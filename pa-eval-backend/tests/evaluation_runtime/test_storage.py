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
    ShardDescriptor,
    build_batch_ranges,
)


class _Body:
    def __init__(self, value: bytes, *, fail_on_read: bool = False) -> None:
        self._value = value
        self._fail_on_read = fail_on_read
        self.closed = False

    def read(self) -> bytes:
        if self._fail_on_read:
            raise OSError("read failed")
        return self._value

    def close(self) -> None:
        self.closed = True


class FakeObjectStoreClient:
    def __init__(self, *, fail_on_put: int | None = None) -> None:
        self.objects: dict[str, dict[str, Any]] = {}
        self.put_calls: list[str] = []
        self.get_bodies: list[_Body] = []
        self.fail_on_put = fail_on_put
        self.fail_on_read = False

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
        body = _Body(stored["body"], fail_on_read=self.fail_on_read)
        self.get_bodies.append(body)
        return {
            "Body": body,
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


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


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
    assert client.get_bodies[-1].closed is True

    all_canonical_bytes = b"".join(_canonical_line(sample) for sample in samples)
    assert stored.content_hash == hashlib.sha256(all_canonical_bytes).hexdigest()
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
    assert index["version"] == 1
    assert index["contentHash"] == stored.content_hash
    assert "manifestHash" not in index
    assert stored.manifest_hash == hashlib.sha256(index_body).hexdigest()
    assert (
        client.objects[stored.index_object_key]["metadata"]["sha256"]
        == stored.manifest_hash
    )
    assert all("samples" not in shard for shard in index["shards"])
    assert len(index_body) < 2_000


def test_same_content_with_different_batch_layout_has_distinct_manifest_identity() -> (
    None
):
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)
    samples = [{"id": index} for index in range(150)]

    first = asyncio.run(
        storage.put_manifest("project", "run", samples, batch_size=100)
    )
    second = asyncio.run(
        storage.put_manifest("project", "run", samples, batch_size=50)
    )

    assert first.content_hash == second.content_hash
    assert first.manifest_hash != second.manifest_hash
    assert first.index_object_key != second.index_object_key


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
    assert client.get_bodies[-1].closed is True


def test_read_shard_rejects_invalid_descriptor_before_object_store_access() -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)
    descriptor = ShardDescriptor(
        start=0,
        end=1,
        object_key="../../secret",
        shard_hash="a" * 64,
    )

    with pytest.raises(ValueError, match="invalid shard descriptor"):
        asyncio.run(storage.read_shard(descriptor))

    assert client.get_bodies == []


def test_read_shard_rejects_non_string_hash_as_invalid_descriptor() -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)
    descriptor = ShardDescriptor(
        start=0,
        end=1,
        object_key=(
            "manifests/project/run/batches/"
            f"0-1-{'a' * 64}.jsonl.gz"
        ),
        shard_hash=None,  # type: ignore[arg-type]
    )

    with pytest.raises(ValueError, match="invalid shard descriptor"):
        asyncio.run(storage.read_shard(descriptor))


def test_read_shard_closes_body_when_stream_read_fails() -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)
    stored = asyncio.run(storage.put_manifest("project", "run", [{"id": 1}]))
    client.fail_on_read = True

    with pytest.raises(ObjectIntegrityError, match="hash"):
        asyncio.run(storage.read_shard(stored.shards[0]))

    assert client.get_bodies[-1].closed is True


@pytest.mark.parametrize("invalid_bytes", [b"not-gzip", b"{invalid-json}\n"])
def test_read_shard_closes_body_for_decompression_or_json_failure(
    invalid_bytes: bytes,
) -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)
    canonical_bytes = (
        invalid_bytes if invalid_bytes.startswith(b"{") else b"unused"
    )
    shard_hash = hashlib.sha256(canonical_bytes).hexdigest()
    key = f"manifests/project/run/batches/0-1-{shard_hash}.jsonl.gz"
    client.objects[key] = {
        "body": (
            gzip.compress(canonical_bytes, mtime=0)
            if invalid_bytes.startswith(b"{")
            else invalid_bytes
        ),
        "metadata": {"sha256": shard_hash},
        "content_type": "application/x-ndjson",
    }
    descriptor = ShardDescriptor(0, 1, key, shard_hash)

    with pytest.raises(ObjectIntegrityError, match="hash"):
        asyncio.run(storage.read_shard(descriptor))

    assert client.get_bodies[-1].closed is True


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


@pytest.mark.parametrize(
    "invalid",
    ["", " leading", "bad/name", "bad{name}", "bad\nname", "a" * 129],
)
def test_manifest_rejects_unsafe_key_components_without_echoing_value(
    invalid: str,
) -> None:
    storage = ManifestStorage(bucket="test-bucket", client=FakeObjectStoreClient())

    with pytest.raises(ValueError) as project_error:
        asyncio.run(storage.put_manifest(invalid, "run", [{"id": 1}]))
    assert str(project_error.value) == "invalid project_id"

    with pytest.raises(ValueError) as run_error:
        asyncio.run(storage.put_manifest("project", invalid, [{"id": 1}]))
    assert str(run_error.value) == "invalid run_id"


@pytest.mark.parametrize(
    "invalid",
    ["", " trailing", "bad/job", "bad{job}", "bad\tjob", "j" * 129],
)
def test_result_rejects_unsafe_key_components_without_echoing_value(
    invalid: str,
) -> None:
    storage = ManifestStorage(bucket="test-bucket", client=FakeObjectStoreClient())

    with pytest.raises(ValueError) as captured:
        asyncio.run(storage.put_result("project", "run", invalid, {"score": 1}))

    assert str(captured.value) == "invalid job_id"


def test_manifest_upload_interleaves_with_lazy_async_sample_consumption() -> None:
    client = FakeObjectStoreClient()
    storage = ManifestStorage(bucket="test-bucket", client=client)

    async def lazy_samples() -> Any:
        for index in range(201):
            if index >= 100 and not client.put_calls:
                raise AssertionError("consumed beyond current shard before upload")
            yield {"id": index}

    stored = asyncio.run(
        storage.put_manifest("project", "run", lazy_samples(), batch_size=100)
    )

    assert stored.total_count == 201
    assert len(stored.shards) == 3


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
