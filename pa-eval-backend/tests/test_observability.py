from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings
from app.errors import LangfuseUpstreamError
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
        self.patched_trace_payload = None

    async def ensure_project_visible(self, project_id: str, user_id: str) -> None:
        self.project_id = project_id
        self.user_id = user_id

    async def get_project_for_user(self, project_id: str, user_id: str) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        return {
            "id": project_id,
            "name": "演示组织 默认项目",
            "organizationId": "org-1",
            "organizationName": "演示组织",
            "description": "",
            "retentionDays": 30,
            "status": "active",
            "createdAt": "2026-07-01T00:00:00.000Z",
            "updatedAt": "2026-07-01T00:00:00.000Z",
        }

    async def patch_trace_for_user(
        self,
        project_id: str,
        trace_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.patched_trace_payload = {
            "project_id": project_id,
            "trace_id": trace_id,
            "user_id": user_id,
            "payload": payload,
        }
        return {
            "traceId": trace_id,
            "input": payload["input"],
            "output": payload["output"],
            "metadata": payload["metadata"],
        }


class FakeTraceReader:
    def __init__(self) -> None:
        self.project_id = None
        self.observation_id = None
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

    async def get_observation(
        self,
        project_id: str,
        trace_id: str,
        observation_id: str,
    ) -> dict:
        self.project_id = project_id
        self.observation_id = observation_id
        return {
            "id": observation_id,
            "traceId": trace_id,
            "projectId": project_id,
            "parentObservationId": None,
            "type": "GENERATION",
            "name": "agent-router",
            "level": "DEFAULT",
            "statusMessage": "",
            "startTime": "2026-07-05T01:36:59.275Z",
            "endTime": "2026-07-05T01:37:00.000Z",
            "input": "{\"question\":\"如何退款\"}",
            "output": "{\"route\":\"refund\"}",
            "metadata": {"node": "agent-router"},
            "usageDetails": {"input": 10, "output": 4, "total": 14},
            "providedUsageDetails": {},
            "costDetails": {},
            "totalCost": 0.001,
            "scores": [
                {
                    "id": "score-1",
                    "name": "quality",
                    "value": 0.9,
                    "source": "ANNOTATION",
                    "dataType": "NUMERIC",
                    "stringValue": "",
                    "comment": "通过",
                    "metadata": {},
                    "authorUserId": "user-1",
                    "createdAt": "2026-07-05T01:37:01.000Z",
                    "updatedAt": "2026-07-05T01:37:01.000Z",
                }
            ],
        }


class FailingTraceReader(FakeTraceReader):
    async def get_trace_metrics(self, project_id: str, **kwargs) -> dict:
        self.project_id = project_id
        self.metrics_kwargs = kwargs
        raise LangfuseUpstreamError("Langfuse ClickHouse 查询失败")

    async def list_traces(self, project_id: str, **kwargs) -> dict:
        self.project_id = project_id
        self.list_kwargs = kwargs
        raise LangfuseUpstreamError("Langfuse ClickHouse 查询失败")


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
    assert fake_trace.list_kwargs["time_range"] == "1d"
    assert body["data"]["datas"][0]["projectName"] == "演示组织 默认项目"


def test_lists_project_traces_accepts_quick_time_range() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={"timeRange": "14d"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["time_range"] == "14d"


def test_lists_project_traces_accepts_bracket_created_at_range_from_frontend() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={
                "createdAtRange[]": [
                    "2026-07-01 00:00:00",
                    "2026-07-02 23:59:59",
                ],
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["created_at_range"] == [
        "2026-07-01 00:00:00",
        "2026-07-02 23:59:59",
    ]


def test_lists_project_traces_passes_multiple_metadata_filters() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={
                "metadataFilters": (
                    '[{"key":"businessId","operator":"contains","value":"ticket"},'
                    '{"key":"priority","operator":"equals","value":"high"}]'
                )
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert fake_trace.list_kwargs["metadata_filters"] == [
        {"key": "businessId", "operator": "contains", "value": "ticket"},
        {"key": "priority", "operator": "equals", "value": "high"},
    ]
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
    assert detail_response.json()["data"]["projectName"] == "演示组织 默认项目"


def test_gets_project_trace_observation_detail() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces/trace-1/observations/obs-1"
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["id"] == "obs-1"
    assert body["data"]["traceId"] == "trace-1"
    assert body["data"]["projectName"] == "演示组织 默认项目"
    assert body["data"]["scores"][0]["name"] == "quality"
    assert fake_db.project_id == "project-1"
    assert fake_db.user_id == "user-1"
    assert fake_trace.observation_id == "obs-1"


def test_patches_project_trace_and_returns_merged_detail() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).patch(
            "/api/projects/project-1/traces/trace-1",
            json={
                "input": "{\"question\":\"如何退款\"}",
                "output": "{\"answer\":\"走订单详情\"}",
                "metadata": {"app_id": "app-1", "reviewed": True},
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["traceId"] == "trace-1"
    assert body["data"]["input"] == "{\"question\":\"如何退款\"}"
    assert body["data"]["output"] == "{\"answer\":\"走订单详情\"}"
    assert body["data"]["metadata"]["reviewed"] is True
    assert body["data"]["callChain"] == []
    assert fake_db.project_id == "project-1"
    assert fake_db.user_id == "user-1"
    assert fake_db.patched_trace_payload == {
        "project_id": "project-1",
        "trace_id": "trace-1",
        "user_id": "user-1",
        "payload": {
            "input": "{\"question\":\"如何退款\"}",
            "output": "{\"answer\":\"走订单详情\"}",
            "metadata": {"app_id": "app-1", "reviewed": True},
        },
    }


def test_forwards_trace_dashboard_filters_to_trace_reader() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/trace-metrics",
            params={"timeRange": "3d", "environment": "default"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.metrics_kwargs == {
        "time_range": "3d",
        "environment": "default",
    }


def test_accepts_bracket_array_trace_filters_from_frontend() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={
                "environments[]": ["production", "staging"],
                "statuses[]": ["failed"],
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["environments"] == ["production", "staging"]
    assert fake_trace.list_kwargs["statuses"] == ["failed"]


def test_trace_metrics_returns_empty_payload_when_clickhouse_is_unavailable() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FailingTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get("/api/projects/project-1/trace-metrics")
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"] == {
        "summary": {
            "total": 0,
            "success": 0,
            "failed": 0,
            "failureRate": 0,
            "averageLatency": 0,
            "p95Latency": 0,
            "totalChangeRate": 0,
        },
        "traceTrend": [],
        "latencyTrend": [],
        "environmentDistribution": [],
        "slowTraces": [],
    }
    assert fake_db.project_id == "project-1"


def test_trace_list_returns_empty_payload_when_clickhouse_is_unavailable() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FailingTraceReader()
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
    assert body["data"] == {"total": 0, "datas": []}
    assert fake_db.project_id == "project-1"


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


def test_trace_row_exposes_langfuse_scores_and_summary() -> None:
    row = LangfuseClickHouseReader._to_trace_row(
        {
            "traceId": "trace-1",
            "projectId": "project-1",
            "environment": "default",
            "status": "success",
            "latency": 120,
            "createdAt": "2026-07-05 01:36:59.275",
            "userId": "user-1",
            "metadata": {"app_id": "app-1"},
            "tags": [],
            "scores": [
                {
                    "id": "score-1",
                    "name": "quality",
                    "value": 0.9,
                    "source": "ANNOTATION",
                    "dataType": "NUMERIC",
                    "stringValue": "",
                    "comment": "通过",
                    "metadata": {},
                    "authorUserId": "user-1",
                    "createdAt": "2026-07-05T01:37:01.000Z",
                    "updatedAt": "2026-07-05T01:37:01.000Z",
                }
            ],
            "scoreSummary": "quality: 0.9",
        }
    )

    assert row["scores"][0]["name"] == "quality"
    assert row["scoreSummary"] == "quality: 0.9"


@pytest.mark.anyio
async def test_clickhouse_reader_get_observation_returns_langfuse_fields(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured_queries = []

    async def fake_query(query: str, params: dict):
        captured_queries.append((query, params))
        if "FROM observations" in query:
            return [
                {
                    "id": "obs-1",
                    "traceId": "trace-1",
                    "projectId": "project-1",
                    "parentObservationId": None,
                    "type": "GENERATION",
                    "name": "agent-router",
                    "level": "DEFAULT",
                    "statusMessage": "",
                    "startTime": "2026-07-05 01:36:59.275",
                    "endTime": "2026-07-05 01:37:00.000",
                    "input": {"question": "如何退款"},
                    "output": {"route": "refund"},
                    "metadata": {"node": "agent-router"},
                    "usageDetails": {"input": 10, "output": 4, "total": 14},
                    "providedUsageDetails": {},
                    "costDetails": {},
                    "totalCost": 0.001,
                }
            ]
        return [
            {
                "id": "score-1",
                "traceId": "trace-1",
                "observationId": "obs-1",
                "name": "quality",
                "value": 0.9,
                "source": "ANNOTATION",
                "dataType": "NUMERIC",
                "stringValue": "",
                "comment": "通过",
                "metadata": {},
                "authorUserId": "user-1",
                "createdAt": "2026-07-05 01:37:01.000",
                "updatedAt": "2026-07-05 01:37:01.000",
            }
        ]

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    observation = await reader.get_observation("project-1", "trace-1", "obs-1")

    assert observation["id"] == "obs-1"
    assert observation["input"] == '{\n  "question": "如何退款"\n}'
    assert observation["output"] == '{\n  "route": "refund"\n}'
    assert observation["scores"][0]["name"] == "quality"
    assert captured_queries[0][1] == {
        "project_id": "project-1",
        "trace_id": "trace-1",
        "observation_id": "obs-1",
    }


@pytest.mark.anyio
async def test_clickhouse_reader_chunks_trace_ids_when_fetching_scores(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured_params = []

    async def fake_query(query: str, params: dict):
        captured_params.append(params)
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    await reader._fetch_scores_by_trace(
        "project-1",
        [f"trace-{index}" for index in range(205)],
    )

    assert len(captured_params) == 3
    assert all(len([key for key in params if key.startswith("score_trace_id_")]) <= 100 for params in captured_params)


@pytest.mark.anyio
async def test_clickhouse_reader_disables_environment_proxy(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured = {}

    class FakeResponse:
        text = ""

        def raise_for_status(self) -> None:
            return None

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, *args, **kwargs) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr("app.langfuse_clickhouse.httpx.AsyncClient", FakeAsyncClient)

    await reader._query_json_each_row("SELECT 1 FORMAT JSONEachRow", {})

    assert captured["client_kwargs"]["trust_env"] is False
