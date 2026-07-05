from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings
from app.langfuse_clickhouse import (
    LangfuseClickHouseReader,
    get_langfuse_clickhouse_reader,
)
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.project_id = None
        self.user_id = None

    async def ensure_project_visible(self, project_id: str, user_id: str) -> None:
        self.project_id = project_id
        self.user_id = user_id


class FakeTraceReader:
    def __init__(self) -> None:
        self.project_id = None
        self.metrics_kwargs = None
        self.list_kwargs = None

    async def get_trace_metrics(self, project_id: str, **kwargs) -> dict:
        self.project_id = project_id
        self.metrics_kwargs = kwargs
        return {
            "summary": {
                "total": 1,
                "success": 1,
                "failed": 0,
                "failureRate": 0,
                "averageLatency": 120,
                "p95Latency": 120,
                "totalChangeRate": 0,
            },
            "traceTrend": [],
            "latencyTrend": [],
            "environmentDistribution": [],
            "slowTraces": [],
        }

    async def list_traces(self, project_id: str, **kwargs) -> dict:
        self.project_id = project_id
        self.list_kwargs = kwargs
        return {
            "total": 1,
            "datas": [
                {
                    "traceId": "trace-1",
                    "sessionId": "",
                    "projectId": project_id,
                    "projectName": "",
                    "environment": "default",
                    "status": "success",
                    "latency": 120,
                    "createdAt": "2026-07-05T01:36:59.275Z",
                    "userId": "user-1",
                    "businessId": "app-1",
                    "tags": ["workflow"],
                }
            ],
        }

    async def get_trace(self, project_id: str, trace_id: str) -> dict:
        self.project_id = project_id
        return {
            "traceId": trace_id,
            "sessionId": "",
            "projectId": project_id,
            "projectName": "",
            "environment": "default",
            "status": "success",
            "latency": 120,
            "createdAt": "2026-07-05T01:36:59.275Z",
            "updatedAt": "2026-07-05T01:37:00.000Z",
            "userId": "user-1",
            "businessId": "app-1",
            "tags": ["workflow"],
            "input": "{}",
            "output": "{}",
            "metadata": {"app_id": "app-1"},
            "callChain": [],
        }


def override_readers(fake_db: FakeDatabaseReader, fake_trace: FakeTraceReader):
    async def _db_override() -> LangfuseDatabaseReader:
        return fake_db  # type: ignore[return-value]

    async def _trace_override() -> LangfuseClickHouseReader:
        return fake_trace  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _db_override
    app.dependency_overrides[get_langfuse_clickhouse_reader] = _trace_override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="admin@163.com",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_lists_project_traces_after_project_visibility_check() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={"page": 1, "pageSize": 10},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert fake_db.project_id == "project-1"
    assert fake_db.user_id == "user-1"
    assert fake_trace.project_id == "project-1"
    assert body["data"]["datas"][0]["traceId"] == "trace-1"


def test_gets_project_trace_metrics_and_detail() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        metrics_response = TestClient(app).get("/api/projects/project-1/trace-metrics")
        detail_response = TestClient(app).get("/api/projects/project-1/traces/trace-1")
    finally:
        clear_overrides()

    assert metrics_response.status_code == 200
    assert metrics_response.json()["data"]["summary"]["total"] == 1
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["traceId"] == "trace-1"


def test_forwards_trace_dashboard_filters_to_trace_reader() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/trace-metrics",
            params={"timeRange": "24h", "environment": "default"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.metrics_kwargs == {
        "time_range": "24h",
        "environment": "default",
    }


@pytest.mark.anyio
async def test_fetches_trace_rows_with_time_and_environment_filters(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured = {}

    async def fake_query(query: str, params: dict):
        captured["query"] = query
        captured["params"] = params
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    await reader._fetch_trace_rows(
        "project-1",
        start_time=datetime(2026, 7, 5, 0, 0, 0),
        end_time=datetime(2026, 7, 6, 0, 0, 0),
        environments=["default"],
    )

    assert "t.timestamp >= {start_time:DateTime64(3)}" in captured["query"]
    assert "t.timestamp < {end_time:DateTime64(3)}" in captured["query"]
    assert "t.environment IN ({environment_0:String})" in captured["query"]
    assert captured["params"] == {
        "project_id": "project-1",
        "start_time": datetime(2026, 7, 5, 0, 0, 0),
        "end_time": datetime(2026, 7, 6, 0, 0, 0),
        "environment_0": "default",
    }
