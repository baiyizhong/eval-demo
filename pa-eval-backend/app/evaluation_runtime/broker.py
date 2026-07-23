from dataclasses import dataclass
import re
from typing import Any
import unicodedata

from redis.exceptions import ResponseError


_MAX_REDIS_NAME_LENGTH = 128
_ROUTING_KEY_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")


@dataclass(frozen=True, slots=True)
class BrokerMessage:
    message_id: str
    stream: str
    routing_key: str
    job_id: str | None
    error_code: str | None = None


JobMessage = BrokerMessage


class RedisJobBroker:
    def __init__(
        self,
        *,
        client: Any,
        stream_prefix: str,
        consumer_group: str,
        response_error: type[Exception] = ResponseError,
    ) -> None:
        _validate_redis_name(stream_prefix, "stream_prefix")
        normalized_prefix = stream_prefix.rstrip(":")
        _validate_redis_name(normalized_prefix, "stream_prefix")
        _validate_redis_name(consumer_group, "consumer_group")
        self._client = client
        self._stream_prefix = normalized_prefix
        self._consumer_group = consumer_group
        self._response_error = response_error

    def stream_name(self, routing_key: str) -> str:
        _validate_routing_key(routing_key)
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
    ) -> list[BrokerMessage]:
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

        messages: list[BrokerMessage] = []
        for _, stream_messages in response:
            for message_id, fields in stream_messages:
                raw_job_id = fields.get("jobId")
                if raw_job_id is None:
                    raw_job_id = fields.get(b"jobId")
                job_id = _job_id(raw_job_id)
                messages.append(
                    BrokerMessage(
                        message_id=_decode(message_id),
                        stream=stream,
                        routing_key=routing_key,
                        job_id=job_id,
                        error_code=(
                            "MALFORMED_JOB_MESSAGE" if job_id is None else None
                        ),
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


def _job_id(value: Any) -> str | None:
    if isinstance(value, bytes):
        try:
            decoded = value.decode("utf-8")
        except UnicodeDecodeError:
            return None
    elif isinstance(value, str):
        decoded = value
    else:
        return None
    return decoded if decoded.strip() else None


def _validate_redis_name(value: Any, field_name: str) -> None:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > _MAX_REDIS_NAME_LENGTH
        or any(
            char.isspace()
            or char in "{}"
            or unicodedata.category(char) == "Cc"
            for char in value
        )
    ):
        raise ValueError(f"{field_name} is invalid")


def _validate_routing_key(value: Any) -> None:
    if not isinstance(value, str) or _ROUTING_KEY_PATTERN.fullmatch(value) is None:
        raise ValueError("routing_key is invalid")
