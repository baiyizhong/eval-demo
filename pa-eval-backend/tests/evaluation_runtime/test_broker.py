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


@pytest.mark.parametrize(
    "field_name,field_value",
    [
        ("stream_prefix", ""),
        ("stream_prefix", "pa eval"),
        ("stream_prefix", "pa-eval\n"),
        ("stream_prefix", "pa-eval:{jobs}"),
        ("stream_prefix", "x" * 129),
        ("consumer_group", ""),
        ("consumer_group", "pa workers"),
        ("consumer_group", "pa-workers\x00"),
        ("consumer_group", "pa-{workers}"),
        ("consumer_group", "x" * 129),
    ],
)
def test_broker_rejects_invalid_names_without_echoing_values(
    field_name: str,
    field_value: str,
) -> None:
    kwargs = {
        "client": FakeRedis(),
        "stream_prefix": "pa-eval:jobs",
        "consumer_group": "pa-eval-workers",
        "response_error": FakeResponseError,
        field_name: field_value,
    }

    with pytest.raises(ValueError) as exc_info:
        RedisJobBroker(**kwargs)

    assert field_name in str(exc_info.value)
    if field_value:
        assert field_value not in str(exc_info.value)


def test_broker_accepts_name_and_routing_key_boundaries() -> None:
    broker = RedisJobBroker(
        client=FakeRedis(),
        stream_prefix="p" * 128,
        consumer_group="g" * 128,
        response_error=FakeResponseError,
    )
    routing_key = "A" + ("z" * 127)

    assert broker.stream_name(routing_key) == f"{'p' * 128}:{routing_key}"


@pytest.mark.parametrize(
    "routing_key",
    [
        "",
        " tenant-a",
        "tenant a",
        "tenant:a",
        "tenant{a}",
        "tenant\n",
        "_tenant",
        "x" * 129,
    ],
)
def test_all_broker_routing_entrypoints_reject_invalid_keys(
    routing_key: str,
) -> None:
    client = FakeRedis()
    broker = _broker(client)

    with pytest.raises(ValueError, match="routing_key"):
        broker.stream_name(routing_key)
    with pytest.raises(ValueError, match="routing_key"):
        asyncio.run(broker.publish(routing_key, "job-1"))
    with pytest.raises(ValueError, match="routing_key"):
        asyncio.run(
            broker.read(routing_key, "worker-a", count=1, block_ms=1)
        )
    with pytest.raises(ValueError, match="routing_key"):
        asyncio.run(broker.ack(routing_key, "1-0"))

    assert client.xadd_calls == []
    assert client.xreadgroup_calls == []
    assert client.xack_calls == []


def test_read_returns_malformed_and_valid_messages_and_malformed_can_be_acked() -> (
    None
):
    client = FakeRedis()
    broker = _broker(client)
    stream = broker.stream_name("shared")
    client.messages[stream] = [
        (b"1-0", {b"payload": b"missing-job-id"}),
        (b"2-0", {b"jobId": b"  "}),
        (b"3-0", {b"jobId": 123}),
        (b"4-0", {b"jobId": b"job-valid"}),
    ]

    async def scenario() -> list[Any]:
        await broker.ensure_group("shared")
        messages = await broker.read("shared", "worker-a", count=4, block_ms=1)
        assert await broker.pending_count("shared") == 4
        for message in messages[:3]:
            assert await broker.ack("shared", message.message_id) == 1
        assert await broker.pending_count("shared") == 1
        return messages

    messages = asyncio.run(scenario())

    assert [message.message_id for message in messages] == [
        "1-0",
        "2-0",
        "3-0",
        "4-0",
    ]
    assert all(message.stream == stream for message in messages)
    assert all(message.routing_key == "shared" for message in messages)
    assert [message.job_id for message in messages] == [
        None,
        None,
        None,
        "job-valid",
    ]
    assert [message.error_code for message in messages] == [
        "MALFORMED_JOB_MESSAGE",
        "MALFORMED_JOB_MESSAGE",
        "MALFORMED_JOB_MESSAGE",
        None,
    ]


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
