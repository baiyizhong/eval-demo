import asyncio
import gzip
import hashlib
import json
import os
import uuid
from typing import Any

import pytest

from app.evaluation_runtime.storage import (
    ManifestStorage,
    ObjectIntegrityError,
    build_batch_ranges,
)


class _Body:
    def __init__(self, value: bytes) -> None:
        self._value = value

    def read(self) -> bytes:
        return self._value


class FakeObjectStoreClient:
    def __init__(self, *, fail_on_put: int | None = None) -> None:
        self.objects: dict[str, dict[str, Any]] = {}
        self.put_calls: list[str] = []
        self.fail_on_put = fail_on_put

    def put_object(self, **kwargs: Any) -> dict[str, Any]:
        self.put_calls.append(kwargs["Key"])
        if self.fail_on_put == len(self.put_calls):
            raise RuntimeError("object store unavailable")
        self.objects[kwargs["Key"]] = {
            "body": bytes(kwargs["Body"]),
            "metadata": dict(kwargs["Metadata"]),
            "content_type": kwargs["ContentType"],
        }
        return {}

    def get_object(self, **kwargs: Any) -> dict[str, Any]:
        stored = self.objects[kwargs["Key"]]
        return {
            "Body": _Body(stored["body"]),
            "Metadata": dict(stored["metadata"]),
        }


def _canonical_line(value: dict[str, Any]) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        + b"\n"
    )


def test_manifest_round_trip_uses_immutable_shards_and_canonical_hashes() -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)
    samples = [{"id": index, "text": f"样本-{index}"} for index in range(150)]

    stored = asyncio.run(
        storage.put_manifest("project-1", "run-1", samples, batch_size=100)
    )

    assert stored.total_count == len(samples)
    assert stored.batch_size == 100
    assert len(stored.shards) == 2
    assert (stored.shards[0].start, stored.shards[0].end) == (0, 100)
    assert (stored.shards[1].start, stored.shards[1].end) == (100, 150)
    assert asyncio.run(storage.read_shard(stored.shards[1])) == samples[100:]

    all_canonical_bytes = b"".join(_canonical_line(sample) for sample in samples)
    assert stored.manifest_hash == hashlib.sha256(all_canonical_bytes).hexdigest()
    second_shard_bytes = b"".join(
        _canonical_line(sample) for sample in samples[100:]
    )
    expected_shard_hash = hashlib.sha256(second_shard_bytes).hexdigest()
    assert stored.shards[1].shard_hash == expected_shard_hash
    assert stored.shards[1].object_key == (
        "manifests/project-1/run-1/batches/"
        f"100-150-{expected_shard_hash}.jsonl.gz"
    )
    assert stored.index_object_key == (
        f"manifests/project-1/run-1/{stored.manifest_hash}/index.json"
    )


def test_manifest_uploads_all_shards_before_lightweight_index() -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)

    stored = asyncio.run(
        storage.put_manifest(
            "project-1",
            "run-1",
            ({"id": index} for index in range(201)),
            batch_size=100,
        )
    )

    assert client.put_calls == [
        *(shard.object_key for shard in stored.shards),
        stored.index_object_key,
    ]
    index_body = client.objects[stored.index_object_key]["body"]
    index = json.loads(index_body)
    assert index == stored.as_dict()
    assert all("samples" not in shard for shard in index["shards"])
    assert len(index_body) < 2_000


def test_manifest_gzip_bytes_are_deterministic() -> None:
    first_client = FakeObjectStoreClient()
    second_client = FakeObjectStoreClient()
    samples = [{"z": 1, "a": "值"}]

    first = asyncio.run(
        ManifestStorage(bucket="bucket", client=first_client).put_manifest(
            "project", "run", samples
        )
    )
    second = asyncio.run(
        ManifestStorage(bucket="bucket", client=second_client).put_manifest(
            "project", "run", samples
        )
    )

    assert first == second
    assert first_client.objects[first.shards[0].object_key]["body"] == (
        second_client.objects[second.shards[0].object_key]["body"]
    )


@pytest.mark.parametrize("corruption", ["body", "metadata"])
def test_read_shard_rejects_content_or_metadata_hash_corruption(
    corruption: str,
) -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)
    stored = asyncio.run(
        storage.put_manifest("project", "run", [{"id": 1}, {"id": 2}])
    )
    shard = stored.shards[0]
    if corruption == "body":
        client.objects[shard.object_key]["body"] = gzip.compress(
            _canonical_line({"id": "tampered"}), mtime=0
        )
    else:
        client.objects[shard.object_key]["metadata"]["sha256"] = "0" * 64

    with pytest.raises(ObjectIntegrityError, match="hash"):
        asyncio.run(storage.read_shard(shard))


def test_build_batch_ranges_handles_one_million_without_materializing_samples() -> None:
    ranges = build_batch_ranges(total=1_000_000, batch_size=100)

    assert len(ranges) == 10_000
    assert ranges[0] == (0, 100)
    assert ranges[-1] == (999_900, 1_000_000)


def test_put_result_uses_content_addressed_deterministic_gzip_key() -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)
    result = {"score": 0.9, "reason": "通过"}
    canonical = json.dumps(
        result,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    result_hash = hashlib.sha256(canonical).hexdigest()

    object_key = asyncio.run(
        storage.put_result("project-1", "run-1", "job-1", result)
    )

    assert object_key == f"results/project-1/run-1/job-1/{result_hash}.json.gz"
    uploaded = client.objects[object_key]
    assert uploaded["metadata"]["sha256"] == result_hash
    assert gzip.decompress(uploaded["body"]) == canonical


def test_storage_requires_non_empty_bucket() -> None:
    with pytest.raises(ValueError, match="bucket"):
        ManifestStorage(bucket="", client=FakeObjectStoreClient())


_object_store_env = (
    "PA_EVAL_TEST_OBJECT_STORE_ENDPOINT",
    "PA_EVAL_TEST_OBJECT_STORE_REGION",
    "PA_EVAL_TEST_OBJECT_STORE_BUCKET",
)


@pytest.mark.skipif(
    not all(os.getenv(name) for name in _object_store_env),
    reason="未完整配置独立 PA_EVAL_TEST_OBJECT_STORE_*，跳过真实对象存储测试",
)
def test_real_object_store_manifest_round_trip() -> None:
    endpoint = os.environ["PA_EVAL_TEST_OBJECT_STORE_ENDPOINT"]
    storage = ManifestStorage.from_config(
        endpoint=endpoint,
        region=os.environ["PA_EVAL_TEST_OBJECT_STORE_REGION"],
        bucket=os.environ["PA_EVAL_TEST_OBJECT_STORE_BUCKET"],
        access_key=os.getenv("PA_EVAL_TEST_OBJECT_STORE_ACCESS_KEY", ""),
        secret_key=os.getenv("PA_EVAL_TEST_OBJECT_STORE_SECRET_KEY", ""),
        secure=os.getenv("PA_EVAL_TEST_OBJECT_STORE_SECURE", "true").lower()
        in {"1", "true", "yes"},
    )
    suffix = uuid.uuid4().hex
    samples = [{"id": suffix, "value": 1}]

    stored = asyncio.run(
        storage.put_manifest(f"pytest-{suffix}", f"run-{suffix}", samples)
    )

    assert asyncio.run(storage.read_shard(stored.shards[0])) == samples
