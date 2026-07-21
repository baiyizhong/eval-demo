from pathlib import Path

import pytest
from pydantic import ValidationError

import app.langfuse_clickhouse as langfuse_clickhouse
import app.main as main
from app.config import Settings
from app.data_access import clickhouse, postgres
from app.data_access.config import DataAccessPoolSettings
from app.langfuse_clickhouse import (
    LangfuseClickHouseReader,
    LangfuseClickHouseScoreWriter,
)


def test_data_access_pool_settings_have_conservative_defaults() -> None:
    settings = DataAccessPoolSettings(_env_file=None)

    assert settings.pa_eval_postgres_pool_min_size == 1
    assert settings.pa_eval_postgres_pool_max_size == 10
    assert settings.pa_eval_postgres_pool_timeout_seconds == 10
    assert settings.pa_eval_postgres_pool_max_idle_seconds == 300
    assert settings.pa_eval_postgres_pool_max_lifetime_seconds == 1800
    assert settings.pa_eval_clickhouse_http_max_connections == 100
    assert settings.pa_eval_clickhouse_http_max_keepalive_connections == 20
    assert settings.pa_eval_clickhouse_http_keepalive_expiry_seconds == 30


@pytest.mark.parametrize(
    "values",
    [
        {
            "pa_eval_postgres_pool_min_size": 5,
            "pa_eval_postgres_pool_max_size": 4,
        },
        {
            "pa_eval_clickhouse_http_max_connections": 10,
            "pa_eval_clickhouse_http_max_keepalive_connections": 11,
        },
    ],
)
def test_data_access_pool_settings_reject_invalid_bounds(values: dict) -> None:
    with pytest.raises(ValidationError):
        DataAccessPoolSettings(_env_file=None, **values)


@pytest.mark.anyio
async def test_postgres_pool_starts_acquires_and_closes(monkeypatch) -> None:
    events = []

    class FakeConnectionContext:
        async def __aenter__(self):
            events.append("acquire")
            return "pooled-connection"

        async def __aexit__(self, *args):
            events.append("release")

    class FakePool:
        def __init__(self, **kwargs):
            events.append(("init", kwargs))

        async def open(self, *, wait: bool):
            events.append(("open", wait))

        def connection(self, *, timeout: float):
            events.append(("connection", timeout))
            return FakeConnectionContext()

        async def close(self):
            events.append("close")

    monkeypatch.setattr(postgres, "AsyncConnectionPool", FakePool)
    pool_settings = DataAccessPoolSettings(_env_file=None)
    await postgres.start_postgres_pool("postgresql://pool", pool_settings)

    async with await postgres.connect_postgres("postgresql://pool") as connection:
        assert connection == "pooled-connection"

    await postgres.close_postgres_pool()
    assert ("connection", 10) in events
    assert events[-1] == "close"


@pytest.mark.anyio
async def test_postgres_connect_falls_back_when_pool_is_not_started(
    monkeypatch,
) -> None:
    direct_connection = object()

    async def fake_connect(conninfo: str, *, row_factory):
        assert conninfo == "postgresql://direct"
        return direct_connection

    monkeypatch.setattr(
        postgres.psycopg.AsyncConnection,
        "connect",
        fake_connect,
    )
    await postgres.close_postgres_pool()

    assert await postgres.connect_postgres("postgresql://direct") is direct_connection


@pytest.mark.anyio
async def test_clickhouse_http_client_is_reused_and_recreated_after_close(
    monkeypatch,
) -> None:
    created = []

    class FakeClient:
        is_closed = False

        def __init__(self, **kwargs):
            created.append(kwargs)

        async def aclose(self):
            self.is_closed = True

    monkeypatch.setattr(clickhouse.httpx, "AsyncClient", FakeClient)
    settings = Settings(pa_eval_api_timeout=7)
    pool_settings = DataAccessPoolSettings(
        _env_file=None,
        pa_eval_clickhouse_http_max_connections=30,
        pa_eval_clickhouse_http_max_keepalive_connections=12,
        pa_eval_clickhouse_http_keepalive_expiry_seconds=45,
    )

    clickhouse.start_clickhouse_http_client(settings, pool_settings)
    first = clickhouse.get_clickhouse_http_client()
    second = clickhouse.get_clickhouse_http_client()

    assert first is second
    assert len(created) == 1
    assert created[0]["timeout"] == 7
    assert created[0]["trust_env"] is False
    assert created[0]["limits"].max_connections == 30
    assert created[0]["limits"].max_keepalive_connections == 12
    assert created[0]["limits"].keepalive_expiry == 45

    await clickhouse.close_clickhouse_http_client()
    clickhouse.start_clickhouse_http_client(settings, pool_settings)
    third = clickhouse.get_clickhouse_http_client()

    assert third is not first
    assert len(created) == 2
    await clickhouse.close_clickhouse_http_client()


@pytest.mark.anyio
async def test_clickhouse_reader_and_writer_share_the_application_client(
    monkeypatch,
) -> None:
    requests = []

    class FakeResponse:
        text = '{"value": 1}'

        def raise_for_status(self) -> None:
            return None

    class FakeClient:
        def __init__(self) -> None:
            self.close_count = 0

        async def post(self, *args, **kwargs):
            requests.append((args, kwargs))
            return FakeResponse()

        async def aclose(self) -> None:
            self.close_count += 1

    shared_client = FakeClient()
    monkeypatch.setattr(
        langfuse_clickhouse,
        "get_clickhouse_http_client",
        lambda: shared_client,
    )

    def reject_request_scoped_client(**kwargs):
        raise AssertionError("request-scoped AsyncClient must not be created")

    monkeypatch.setattr(
        langfuse_clickhouse.httpx,
        "AsyncClient",
        reject_request_scoped_client,
    )

    settings = Settings()
    first_reader = LangfuseClickHouseReader(settings)
    second_reader = LangfuseClickHouseReader(settings)
    writer = LangfuseClickHouseScoreWriter(settings)

    assert await first_reader._query_json_each_row("SELECT 1", {}) == [{"value": 1}]
    assert await second_reader._query_json_each_row("SELECT 2", {}) == [{"value": 1}]
    await writer._insert_json_each_row("INSERT INTO scores FORMAT JSONEachRow")
    await writer.aclose()

    assert len(requests) == 3
    assert shared_client.close_count == 0


def test_business_modules_do_not_open_postgres_connections_directly() -> None:
    offenders = []
    for path in Path("app").glob("*.py"):
        if "psycopg.AsyncConnection.connect(" in path.read_text():
            offenders.append(path.as_posix())

    assert offenders == []


@pytest.mark.anyio
async def test_app_lifespan_wraps_background_workers_with_data_access_resources(
    monkeypatch,
) -> None:
    events = []

    class FakeBackgroundService:
        def __init__(self, name: str) -> None:
            self.name = name

        async def stop(self) -> None:
            events.append(f"{self.name}-stop")

    async def fake_start_resources(settings, pool_settings) -> None:
        events.append("resources-start")

    async def fake_close_resources() -> None:
        events.append("resources-close")

    def fake_start_scheduler(settings):
        events.append("scheduler-start")
        return FakeBackgroundService("scheduler")

    def fake_start_worker(settings):
        events.append("worker-start")
        return FakeBackgroundService("worker")

    monkeypatch.setattr(
        main,
        "start_data_access_resources",
        fake_start_resources,
        raising=False,
    )
    monkeypatch.setattr(
        main,
        "close_data_access_resources",
        fake_close_resources,
        raising=False,
    )
    monkeypatch.setattr(
        main,
        "get_data_access_pool_settings",
        lambda: DataAccessPoolSettings(_env_file=None),
        raising=False,
    )
    monkeypatch.setattr(main, "start_scheduled_job_scheduler", fake_start_scheduler)
    monkeypatch.setattr(main, "start_trace_bulk_job_worker", fake_start_worker)

    test_app = main.create_app()
    async with test_app.router.lifespan_context(test_app):
        events.append("running")

    assert events == [
        "resources-start",
        "scheduler-start",
        "worker-start",
        "running",
        "worker-stop",
        "scheduler-stop",
        "resources-close",
    ]
