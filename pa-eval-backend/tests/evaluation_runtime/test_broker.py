import asyncio
import os
import uuid
from typing import Any

import pytest

from app.evaluation_runtime.broker import RedisJobBroker


class FakeResponseError(Exception):
    pass


class FakeRedis:
    def __init__(self, *, decode_responses: bool = False) -> None:
        self.decode_responses = decode_responses
        self.groups: set[tuple[str, str]] = set()
        self.messages: dict[str, list[tuple[bytes | str, dict[Any, Any]]]] = {}
        self.pending: dict[tuple[str, str], set[bytes | str]] = {}
        self.xadd_calls: list[tuple[str, dict[str, str]]] = []
        self.xreadgroup_calls: list[dict[str, Any]] = []
        self.xack_calls: list[tuple[str, str, bytes | str]] = []

    async def xgroup_create(
        self,
        stream: str,
        group: str,
        *,
        id: str,
        mkstream: bool,
    ) -> bool:
        key = (stream, group)
        if key in self.groups:
            raise FakeResponseError("BUSYGROUP Consumer Group name already exists")
        self.groups.add(key)
        self.messages.setdefault(stream, [])
        return True

    async def xadd(self, stream: str, fields: dict[str, str]) -> bytes | str:
        self.xadd_calls.append((stream, fields))
        message_number = len(self.messages.setdefault(stream, [])) + 1
        message_id: bytes | str = f"{message_number}-0"
        stored_fields: dict[Any, Any] = dict(fields)
        if not self.decode_responses:
            message_id = message_id.encode()
            stored_fields = {
                key.encode(): value.encode() for key, value in stored_fields.items()
            }
        self.messages[stream].append((message_id, stored_fields))
        return message_id

    async def xreadgroup(self, **kwargs: Any) -> list[Any]:
        self.xreadgroup_calls.append(kwargs)
        stream = next(iter(kwargs["streams"]))
        group = kwargs["groupname"]
        if (stream, group) not in self.groups:
            raise FakeResponseError("NOGROUP No such key or consumer group")
        messages = self.messages.get(stream, [])[: kwargs["count"]]
        self.pending.setdefault((stream, group), set()).update(
            message_id for message_id, _ in messages
        )
        stream_name: bytes | str = stream if self.decode_responses else stream.encode()
        return [(stream_name, messages)] if messages else []

    async def xack(
        self,
        stream: str,
        group: str,
        message_id: bytes | str,
    ) -> int:
        self.xack_calls.append((stream, group, message_id))
        pending = self.pending.setdefault((stream, group), set())
        stored_message_id: bytes | str = message_id
        if not self.decode_responses and isinstance(message_id, str):
            stored_message_id = message_id.encode()
        if stored_message_id in pending:
            pending.remove(stored_message_id)
            return 1
        return 0

    async def xpending(self, stream: str, group: str) -> dict[str, int]:
        return {"pending": len(self.pending.get((stream, group), set()))}


def _broker(client: FakeRedis) -> RedisJobBroker:
    return RedisJobBroker(
        client=client,
        stream_prefix="pa-eval:jobs",
        consumer_group="pa-eval-workers",
        response_error=FakeResponseError,
    )


@pytest.mark.parametrize("decode_responses", [False, True])
def test_broker_contract_decodes_bytes_or_strings_and_acks_correct_group(
    decode_responses: bool,
) -> None:
    client = FakeRedis(decode_responses=decode_responses)
    broker = _broker(client)

    async def scenario() -> None:
        message_id = await broker.publish("shared", "job-1")
        messages = await broker.read("shared", "worker-a", count=10, block_ms=1)
        assert [(item.message_id, item.job_id) for item in messages] == [
            (message_id, "job-1")
        ]
        await broker.ack("shared", message_id)
        assert await broker.pending_count("shared") == 0

    asyncio.run(scenario())

    assert client.xadd_calls == [("pa-eval:jobs:shared", {"jobId": "job-1"})]
    assert client.xreadgroup_calls[-1]["groupname"] == "pa-eval-workers"
    assert client.xreadgroup_calls[-1]["consumername"] == "worker-a"
    assert client.xack_calls == [
        ("pa-eval:jobs:shared", "pa-eval-workers", "1-0")
    ]


def test_stream_routing_uses_prefix_and_routing_key() -> None:
    broker = _broker(FakeRedis())

    assert broker.stream_name("shared") == "pa-eval:jobs:shared"
    assert broker.stream_name("tenant-a") == "pa-eval:jobs:tenant-a"


def test_read_initializes_missing_group_and_existing_group_is_idempotent() -> None:
    client = FakeRedis()
    broker = _broker(client)

    async def scenario() -> None:
        await broker.publish("shared", "job-1")
        messages = await broker.read("shared", "worker-a", count=1, block_ms=1)
        assert [item.job_id for item in messages] == ["job-1"]
        await broker.ensure_group("shared")

    asyncio.run(scenario())

    assert ("pa-eval:jobs:shared", "pa-eval-workers") in client.groups


@pytest.mark.skipif(
    not os.getenv("PA_EVAL_TEST_REDIS_URL"),
    reason="未配置独立测试 Redis PA_EVAL_TEST_REDIS_URL，跳过真实 Redis 合约测试",
)
def test_real_redis_contract() -> None:
    from redis.asyncio import Redis

    redis_url = os.environ["PA_EVAL_TEST_REDIS_URL"]
    prefix = f"pa-eval:test:{uuid.uuid4().hex}"
    client = Redis.from_url(redis_url)
    broker = RedisJobBroker(
        client=client,
        stream_prefix=prefix,
        consumer_group="pytest-workers",
    )

    async def scenario() -> None:
        try:
            message_id = await broker.publish("shared", "job-real")
            messages = await broker.read(
                "shared", "pytest-worker", count=1, block_ms=10
            )
            assert [(item.message_id, item.job_id) for item in messages] == [
                (message_id, "job-real")
            ]
            await broker.ack("shared", message_id)
            assert await broker.pending_count("shared") == 0
        finally:
            await client.delete(broker.stream_name("shared"))
            await client.aclose()

    asyncio.run(scenario())
