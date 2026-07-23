import asyncio
import gzip
import hashlib
import json
from collections.abc import AsyncIterable, AsyncIterator, Iterable, Mapping
from dataclasses import dataclass
from typing import Any


class ObjectIntegrityError(RuntimeError):
    retryable = False


class EmptyManifestError(ValueError):
    retryable = False


@dataclass(frozen=True, slots=True)
class ShardDescriptor:
    start: int
    end: int
    object_key: str
    shard_hash: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "start": self.start,
            "end": self.end,
            "objectKey": self.object_key,
            "shardHash": self.shard_hash,
        }


@dataclass(frozen=True, slots=True)
class StoredManifest:
    index_object_key: str
    manifest_hash: str
    total_count: int
    batch_size: int
    shards: tuple[ShardDescriptor, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "totalCount": self.total_count,
            "batchSize": self.batch_size,
            "manifestHash": self.manifest_hash,
            "shards": [shard.as_dict() for shard in self.shards],
        }


def build_batch_ranges(*, total: int, batch_size: int) -> list[tuple[int, int]]:
    if total < 0:
        raise ValueError("total must be non-negative")
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    return [
        (start, min(start + batch_size, total))
        for start in range(0, total, batch_size)
    ]


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")


def _canonical_json_line(value: Mapping[str, Any]) -> bytes:
    return _canonical_json_bytes(value) + b"\n"


async def _iterate_samples(
    samples: Iterable[Mapping[str, Any]] | AsyncIterable[Mapping[str, Any]],
) -> AsyncIterator[Mapping[str, Any]]:
    if isinstance(samples, AsyncIterable):
        async for sample in samples:
            yield sample
        return
    for sample in samples:
        yield sample


class ManifestStorage:
    def __init__(self, *, bucket: str, client: Any) -> None:
        if not bucket.strip():
            raise ValueError("object store bucket must not be empty")
        self._bucket = bucket
        self._client = client

    @classmethod
    def from_config(
        cls,
        *,
        endpoint: str,
        region: str,
        bucket: str,
        access_key: str = "",
        secret_key: str = "",
        secure: bool = True,
    ) -> "ManifestStorage":
        import boto3

        endpoint_url = endpoint.strip()
        if endpoint_url and "://" not in endpoint_url:
            scheme = "https" if secure else "http"
            endpoint_url = f"{scheme}://{endpoint_url}"
        options: dict[str, Any] = {
            "service_name": "s3",
            "region_name": region,
        }
        if endpoint_url:
            options["endpoint_url"] = endpoint_url
        if access_key:
            options["aws_access_key_id"] = access_key
        if secret_key:
            options["aws_secret_access_key"] = secret_key
        return cls(bucket=bucket, client=boto3.client(**options))

    async def put_manifest(
        self,
        project_id: str,
        run_id: str,
        samples: Iterable[Mapping[str, Any]] | AsyncIterable[Mapping[str, Any]],
        *,
        batch_size: int = 100,
    ) -> StoredManifest:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")

        full_hasher = hashlib.sha256()
        shards: list[ShardDescriptor] = []
        current_lines: list[bytes] = []
        total_count = 0

        async for sample in _iterate_samples(samples):
            line = _canonical_json_line(sample)
            full_hasher.update(line)
            current_lines.append(line)
            total_count += 1
            if len(current_lines) == batch_size:
                shard = await self._put_shard(
                    project_id,
                    run_id,
                    start=total_count - len(current_lines),
                    lines=current_lines,
                )
                shards.append(shard)
                current_lines = []

        if current_lines:
            shard = await self._put_shard(
                project_id,
                run_id,
                start=total_count - len(current_lines),
                lines=current_lines,
            )
            shards.append(shard)
        if total_count == 0:
            raise EmptyManifestError("sample manifest is empty")

        manifest_hash = full_hasher.hexdigest()
        index_object_key = (
            f"manifests/{project_id}/{run_id}/{manifest_hash}/index.json"
        )
        stored = StoredManifest(
            index_object_key=index_object_key,
            manifest_hash=manifest_hash,
            total_count=total_count,
            batch_size=batch_size,
            shards=tuple(shards),
        )
        await self._put_object(
            key=index_object_key,
            body=_canonical_json_bytes(stored.as_dict()),
            content_type="application/json",
            metadata={"sha256": manifest_hash},
        )
        return stored

    async def _put_shard(
        self,
        project_id: str,
        run_id: str,
        *,
        start: int,
        lines: list[bytes],
    ) -> ShardDescriptor:
        shard_hasher = hashlib.sha256()
        for line in lines:
            shard_hasher.update(line)
        canonical_bytes = b"".join(lines)
        shard_hash = shard_hasher.hexdigest()
        end = start + len(lines)
        object_key = (
            f"manifests/{project_id}/{run_id}/batches/"
            f"{start}-{end}-{shard_hash}.jsonl.gz"
        )
        await self._put_object(
            key=object_key,
            body=gzip.compress(canonical_bytes, mtime=0),
            content_type="application/x-ndjson",
            metadata={"sha256": shard_hash},
        )
        return ShardDescriptor(
            start=start,
            end=end,
            object_key=object_key,
            shard_hash=shard_hash,
        )

    async def read_shard(
        self, shard: ShardDescriptor
    ) -> list[Mapping[str, Any]]:
        response = await asyncio.to_thread(
            self._client.get_object,
            Bucket=self._bucket,
            Key=shard.object_key,
        )
        metadata_hash = response.get("Metadata", {}).get("sha256")
        if metadata_hash != shard.shard_hash:
            raise ObjectIntegrityError("object metadata hash mismatch")
        try:
            compressed = await asyncio.to_thread(response["Body"].read)
            canonical_bytes = gzip.decompress(compressed)
        except (KeyError, OSError, EOFError) as error:
            raise ObjectIntegrityError("object content hash validation failed") from error
        content_hash = hashlib.sha256(canonical_bytes).hexdigest()
        if content_hash != shard.shard_hash:
            raise ObjectIntegrityError("object content hash mismatch")
        try:
            samples = [
                json.loads(line)
                for line in canonical_bytes.splitlines()
                if line
            ]
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ObjectIntegrityError("object content hash validation failed") from error
        if len(samples) != shard.end - shard.start:
            raise ObjectIntegrityError("object content range does not match hash metadata")
        return samples

    async def put_result(
        self,
        project_id: str,
        run_id: str,
        job_id: str,
        result: Any,
    ) -> str:
        canonical_bytes = _canonical_json_bytes(result)
        result_hash = hashlib.sha256(canonical_bytes).hexdigest()
        object_key = f"results/{project_id}/{run_id}/{job_id}/{result_hash}.json.gz"
        await self._put_object(
            key=object_key,
            body=gzip.compress(canonical_bytes, mtime=0),
            content_type="application/json",
            metadata={"sha256": result_hash},
        )
        return object_key

    async def _put_object(
        self,
        *,
        key: str,
        body: bytes,
        content_type: str,
        metadata: dict[str, str],
    ) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
            Metadata=metadata,
        )
