from dataclasses import dataclass
from typing import Any

from redis.exceptions import ResponseError


@dataclass(frozen=True, slots=True)
class JobMessage:
    message_id: str
    job_id: str


class RedisJobBroker:
    def __init__(
        self,
        *,
        client: Any,
        stream_prefix: str,
        consumer_group: str,
        response_error: type[Exception] = ResponseError,
    ) -> None:
        self._client = client
        self._stream_prefix = stream_prefix.rstrip(":")
        self._consumer_group = consumer_group
        self._response_error = response_error

    def stream_name(self, routing_key: str) -> str:
        return f"{self._stream_prefix}:{routing_key}"

    async def publish(self, routing_key: str, job_id: str) -> str:
        message_id = await self._client.xadd(
            self.stream_name(routing_key),
            {"jobId": job_id},
        )
        return _decode(message_id)

    async def ensure_group(self, routing_key: str) -> None:
        try:
            await self._client.xgroup_create(
                self.stream_name(routing_key),
                self._consumer_group,
                id="0",
                mkstream=True,
            )
        except self._response_error as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def read(
        self,
        routing_key: str,
        consumer_name: str,
        *,
        count: int,
        block_ms: int,
    ) -> list[JobMessage]:
        if count <= 0:
            raise ValueError("count must be positive")
        if block_ms < 0:
            raise ValueError("block_ms must be non-negative")
        stream = self.stream_name(routing_key)
        try:
            response = await self._read_group(
                stream,
                consumer_name,
                count=count,
                block_ms=block_ms,
            )
        except self._response_error as exc:
            if "NOGROUP" not in str(exc):
                raise
            await self.ensure_group(routing_key)
            response = await self._read_group(
                stream,
                consumer_name,
                count=count,
                block_ms=block_ms,
            )

        messages: list[JobMessage] = []
        for _, stream_messages in response:
            for message_id, fields in stream_messages:
                raw_job_id = fields.get("jobId")
                if raw_job_id is None:
                    raw_job_id = fields.get(b"jobId")
                if raw_job_id is None:
                    continue
                messages.append(
                    JobMessage(
                        message_id=_decode(message_id),
                        job_id=_decode(raw_job_id),
                    )
                )
        return messages

    async def ack(self, routing_key: str, message_id: str) -> int:
        return await self._client.xack(
            self.stream_name(routing_key),
            self._consumer_group,
            message_id,
        )

    async def pending_count(self, routing_key: str) -> int:
        try:
            summary = await self._client.xpending(
                self.stream_name(routing_key),
                self._consumer_group,
            )
        except self._response_error as exc:
            if "NOGROUP" not in str(exc):
                raise
            await self.ensure_group(routing_key)
            return 0
        if isinstance(summary, dict):
            return int(summary.get("pending", summary.get(b"pending", 0)))
        if hasattr(summary, "pending"):
            return int(summary.pending)
        return int(summary[0])

    async def _read_group(
        self,
        stream: str,
        consumer_name: str,
        *,
        count: int,
        block_ms: int,
    ) -> list[Any]:
        return await self._client.xreadgroup(
            groupname=self._consumer_group,
            consumername=consumer_name,
            streams={stream: ">"},
            count=count,
            block=block_ms,
        )


def _decode(value: bytes | str) -> str:
    return value.decode("utf-8") if isinstance(value, bytes) else value
