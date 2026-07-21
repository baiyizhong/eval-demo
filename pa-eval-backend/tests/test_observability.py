from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings
from app.data_access import clickhouse
from app.errors import LangfuseUpstreamError
from app.langfuse_clickhouse import (
    LangfuseClickHouseReader,
    _matches_trace,
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


def test_lists_project_traces_accepts_tags_from_frontend() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={"tags": ["refund", "vip"]},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["tags"] == ["refund", "vip"]


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


def test_lists_project_traces_passes_business_id_filter() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={"businessId": "biz-offline-retail-0713-0007"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["business_id"] == "biz-offline-retail-0713-0007"
    assert fake_trace.list_kwargs["time_range"] is None


def test_lists_project_traces_passes_selected_response_fields() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={"fields": "core,io", "sessionId": "session-1"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["fields"] == "core,io"
    assert fake_trace.list_kwargs["session_id"] == "session-1"


def test_lists_project_traces_passes_anchor_trace_id() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={
                "sessionId": "session-1",
                "anchorTraceId": "trace-25",
                "page": 1,
                "pageSize": 20,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["anchor_trace_id"] == "trace-25"


def test_lists_project_traces_does_not_default_time_range_with_metadata_filters() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={
                "metadataFilters": (
                    '[{"key":"latencyMs","operator":"contains","value":"9237"}]'
                )
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["metadata_filters"] == [
        {"key": "latencyMs", "operator": "contains", "value": "9237"},
    ]
    assert fake_trace.list_kwargs["time_range"] is None


def test_matches_trace_filters_by_business_id_metadata_aliases() -> None:
    base_kwargs = {
        "keyword": None,
        "statuses": None,
        "environments": None,
        "session_id": None,
        "user_id": None,
        "latency_min": None,
        "latency_max": None,
        "score_queue_id": None,
        "metadata_key": None,
        "metadata_value": None,
        "metadata_filters": None,
        "categorical_score_filters": None,
        "numeric_score_filters": None,
    }

    assert _matches_trace(
        {
            "traceId": "trace-1",
            "metadata": {"businessId": "biz-offline-retail-0713-0007"},
        },
        business_id="retail-0713",
        **base_kwargs,
    )
    assert _matches_trace(
        {
            "traceId": "trace-2",
            "metadata": {"business_id": "biz-offline-retail-0713-0008"},
        },
        business_id="0008",
        **base_kwargs,
    )
    assert _matches_trace(
        {
            "traceId": "trace-3",
            "metadata": {"app_id": "biz-offline-retail-0713-0009"},
        },
        business_id="0009",
        **base_kwargs,
    )
    assert not _matches_trace(
        {
            "traceId": "trace-4",
            "metadata": {"businessId": "biz-offline-retail-0713-0010"},
        },
        business_id="0009",
        **base_kwargs,
    )


def test_lists_project_traces_passes_score_filters() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={
                "scoreQueueId": "queue-1",
                "categoricalScoreFilters": (
                    '[{"name":"category","operator":"equals","value":"passed"}]'
                ),
                "numericScoreFilters": (
                    '[{"name":"quality","operator":"gte","value":"0.8"},'
                    '{"name":"invalid","operator":"lte","value":"not-a-number"}]'
                ),
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_trace.list_kwargs["score_queue_id"] == "queue-1"
    assert fake_trace.list_kwargs["categorical_score_filters"] == [
        {"name": "category", "operator": "equals", "value": "passed"},
    ]
    assert fake_trace.list_kwargs["numeric_score_filters"] == [
        {"name": "quality", "operator": "gte", "value": 0.8},
    ]


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


@pytest.mark.anyio
async def test_fetches_trace_rows_with_session_filter_and_optional_io_fields(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured = {}

    async def fake_query(query: str, params: dict):
        captured["query"] = query
        captured["params"] = params
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    await reader._fetch_trace_rows(
        "project-1",
        session_id="session-1",
        include_io=True,
    )

    assert "position(ifNull(t.session_id, ''), {session_id:String}) > 0" in captured["query"]
    assert captured["params"] == {
        "project_id": "project-1",
        "session_id": "session-1",
    }


@pytest.mark.anyio
async def test_list_traces_includes_input_and_output_when_io_fields_requested(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())

    captured: dict[str, object] = {}

    async def fake_fetch_trace_rows(*args, **kwargs):
        captured["include_io"] = kwargs.get("include_io")
        return [
            {
                "traceId": "trace-1",
                "projectId": "project-1",
                "environment": "default",
                "status": "success",
                "latency": 120,
                "createdAt": "2026-07-05 01:36:59.275",
                "userId": "user-1",
                "metadata": {},
                "tags": [],
                "scores": [],
            }
        ]

    async def fake_fetch_trace_payloads(project_id: str, trace_ids: list[str]):
        captured["payload_project_id"] = project_id
        captured["payload_trace_ids"] = trace_ids
        return {
            "trace-1": {
                "input": '{"question":"如何重置密码？"}',
                "output": {"answer": "请在账户设置中重置密码"},
            }
        }

    monkeypatch.setattr(reader, "_fetch_trace_rows", fake_fetch_trace_rows)
    monkeypatch.setattr(
        reader,
        "_fetch_trace_payloads",
        fake_fetch_trace_payloads,
        raising=False,
    )

    result = await reader.list_traces(
        "project-1",
        page=1,
        page_size=10,
        fields="core,io",
        time_range=None,
    )

    assert captured.get("include_io") in (None, False)
    assert captured["payload_project_id"] == "project-1"
    assert captured["payload_trace_ids"] == ["trace-1"]
    assert result["datas"][0]["input"] == '{\n  "question": "如何重置密码？"\n}'
    assert result["datas"][0]["output"] == '{\n  "answer": "请在账户设置中重置密码"\n}'


@pytest.mark.anyio
async def test_list_traces_filters_by_tags(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())

    async def fake_count_trace_rows(*args, **kwargs):
        return 1

    async def fake_fetch_trace_rows(*args, **kwargs):
        return [
            {
                "traceId": "trace-1",
                "projectId": "project-1",
                "environment": "default",
                "status": "success",
                "latency": 120,
                "createdAt": "2026-07-05 01:36:59.275",
                "userId": "user-1",
                "metadata": {},
                "tags": ["refund", "vip"],
                "scores": [],
            },
        ]

    monkeypatch.setattr(reader, "_count_trace_rows", fake_count_trace_rows)
    monkeypatch.setattr(reader, "_fetch_trace_rows", fake_fetch_trace_rows)

    result = await reader.list_traces(
        "project-1",
        page=1,
        page_size=10,
        tags=["refund", "vip"],
        time_range=None,
    )

    assert result["total"] == 1
    assert [row["traceId"] for row in result["datas"]] == ["trace-1"]


@pytest.mark.anyio
async def test_list_traces_only_fetches_payloads_for_current_page(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured: dict[str, object] = {}

    async def fake_count_trace_rows(*args, **kwargs):
        return 3

    async def fake_fetch_trace_rows(*args, **kwargs):
        captured["include_io"] = kwargs.get("include_io")
        return [
            {
                "traceId": "trace-2",
                "projectId": "project-1",
                "environment": "default",
                "status": "success",
                "latency": 120,
                "createdAt": "2026-07-05 01:02:00.000",
                "userId": "user-1",
                "metadata": {"businessId": "biz-2"},
                "tags": [],
                "scores": [],
            }
        ]

    async def fake_fetch_trace_payloads(project_id: str, trace_ids: list[str]):
        captured["payload_project_id"] = project_id
        captured["payload_trace_ids"] = trace_ids
        return {
            "trace-2": {
                "input": {"question": "page 2 input"},
                "output": {"answer": "page 2 output"},
            }
        }

    monkeypatch.setattr(reader, "_count_trace_rows", fake_count_trace_rows)
    monkeypatch.setattr(reader, "_fetch_trace_rows", fake_fetch_trace_rows)
    monkeypatch.setattr(
        reader,
        "_fetch_trace_payloads",
        fake_fetch_trace_payloads,
        raising=False,
    )

    result = await reader.list_traces(
        "project-1",
        page=2,
        page_size=1,
        fields="io,metadata",
        time_range=None,
    )

    assert result["total"] == 3
    assert captured.get("include_io") in (None, False)
    assert captured["payload_project_id"] == "project-1"
    assert captured["payload_trace_ids"] == ["trace-2"]
    assert result["datas"] == [
        {
            "traceId": "trace-2",
            "sessionId": "",
            "projectId": "project-1",
            "projectName": "",
            "environment": "default",
            "status": "success",
            "latency": 120,
            "createdAt": "2026-07-05T01:02:00.000Z",
            "userId": "user-1",
            "businessId": "biz-2",
            "tags": [],
            "scores": [],
            "scoreSummary": "",
            "input": '{\n  "question": "page 2 input"\n}',
            "output": '{\n  "answer": "page 2 output"\n}',
            "metadata": {"businessId": "biz-2"},
        }
    ]


@pytest.mark.anyio
async def test_list_traces_pushes_pagination_and_fetches_scores_for_current_page(
    monkeypatch,
) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured_queries: list[tuple[str, dict]] = []

    async def fake_query(query: str, params: dict):
        captured_queries.append((query, params))
        if "COUNT" in query.upper():
            return [{"total": 3}]
        if "FROM traces t" in query:
            return [
                {
                    "traceId": "trace-2",
                    "projectId": "project-1",
                    "environment": "default",
                    "status": "success",
                    "latency": 120,
                    "createdAt": "2026-07-05 01:02:00.000",
                    "userId": "user-1",
                    "metadata": {"businessId": "biz-2"},
                    "tags": [],
                }
            ]
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    result = await reader.list_traces(
        "project-1",
        page=2,
        page_size=1,
        keyword="trace",
        tags=["refund"],
        score_queue_id="queue-1",
        time_range=None,
    )

    paged_queries = [
        (query, params)
        for query, params in captured_queries
        if "FROM traces t" in query and "LIMIT {limit:UInt32}" in query
    ]
    assert paged_queries
    assert paged_queries[0][1]["limit"] == 1
    assert paged_queries[0][1]["offset"] == 1
    score_params = [
        params
        for query, params in captured_queries
        if "FROM scores" in query and "trace_id IN" in query
    ]
    assert score_params
    assert [
        value
        for key, value in score_params[0].items()
        if key.startswith("score_trace_id_")
    ] == ["trace-2"]
    assert result["total"] == 3
    assert [row["traceId"] for row in result["datas"]] == ["trace-2"]


@pytest.mark.anyio
async def test_list_traces_orders_session_results_by_created_at_before_pagination(
    monkeypatch,
) -> None:
    reader = LangfuseClickHouseReader(Settings())

    async def fake_count_trace_rows(*args, **kwargs):
        return 3

    async def fake_fetch_trace_rows(*args, **kwargs):
        return [
            {
                "traceId": "trace-old",
                "sessionId": "session-1",
                "projectId": "project-1",
                "environment": "default",
                "status": "success",
                "latency": 120,
                "createdAt": "2026-07-05 01:01:00.000",
                "userId": "user-1",
                "metadata": {},
                "tags": [],
                "scores": [],
            },
            {
                "traceId": "trace-mid",
                "sessionId": "session-1",
                "projectId": "project-1",
                "environment": "default",
                "status": "success",
                "latency": 120,
                "createdAt": "2026-07-05 01:02:00.000",
                "userId": "user-1",
                "metadata": {},
                "tags": [],
                "scores": [],
            },
        ]

    monkeypatch.setattr(reader, "_count_trace_rows", fake_count_trace_rows)
    monkeypatch.setattr(reader, "_fetch_trace_rows", fake_fetch_trace_rows)

    result = await reader.list_traces(
        "project-1",
        page=1,
        page_size=2,
        session_id="session-1",
        time_range=None,
    )

    assert result["total"] == 3
    assert [row["traceId"] for row in result["datas"]] == [
        "trace-old",
        "trace-mid",
    ]


@pytest.mark.anyio
async def test_list_traces_locates_anchor_page_without_changing_session_order(
    monkeypatch,
) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured_fetch: dict = {}

    async def fake_count_trace_rows(*args, **kwargs):
        return 45

    async def fake_locate_trace_page(*args, **kwargs):
        return 2

    async def fake_fetch_trace_rows(*args, **kwargs):
        captured_fetch.update(kwargs)
        return []

    monkeypatch.setattr(reader, "_count_trace_rows", fake_count_trace_rows)
    monkeypatch.setattr(
        reader,
        "_locate_trace_page",
        fake_locate_trace_page,
        raising=False,
    )
    monkeypatch.setattr(reader, "_fetch_trace_rows", fake_fetch_trace_rows)

    result = await reader.list_traces(
        "project-1",
        page=1,
        page_size=20,
        session_id="session-1",
        anchor_trace_id="trace-25",
        time_range=None,
    )

    assert result["page"] == 2
    assert captured_fetch["offset"] == 20
    assert captured_fetch["order_ascending"] is True


@pytest.mark.anyio
async def test_trace_metrics_uses_clickhouse_aggregates_without_fetching_all_rows(
    monkeypatch,
) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured_queries: list[tuple[str, dict]] = []

    async def fail_fetch_trace_rows(*args, **kwargs):
        raise AssertionError("metrics must not fetch all trace rows")

    async def fake_query(query: str, params: dict):
        captured_queries.append((query, params))
        if "/* summary */" in query:
            return [
                {
                    "total": 2,
                    "success": 1,
                    "failed": 1,
                    "averageLatency": 150,
                    "p95Latency": 200,
                }
            ]
        if "/* traceTrend */" in query:
            return [{"time": "07-05 01:00", "total": 2, "failed": 1}]
        if "/* latencyTrend */" in query:
            return [
                {
                    "time": "07-05 01:00",
                    "averageLatency": 150,
                    "p95Latency": 200,
                }
            ]
        if "/* environmentDistribution */" in query:
            return [{"environment": "default", "count": 2}]
        if "/* slowTraces */" in query:
            return [
                {
                    "traceId": "trace-slow",
                    "projectId": "project-1",
                    "environment": "default",
                    "status": "failed",
                    "latency": 200,
                    "createdAt": "2026-07-05 01:02:00.000",
                    "userId": "user-1",
                    "metadata": {},
                    "tags": [],
                }
            ]
        return []

    monkeypatch.setattr(reader, "_fetch_trace_rows", fail_fetch_trace_rows)
    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    result = await reader.get_trace_metrics(
        "project-1",
        time_range="1d",
        environment="default",
    )

    assert result["summary"]["total"] == 2
    assert result["summary"]["failureRate"] == 0.5
    assert result["traceTrend"] == [{"time": "07-05 01:00", "total": 2, "failed": 1}]
    assert result["latencyTrend"][0]["p95Latency"] == 200
    assert result["environmentDistribution"] == [{"environment": "default", "count": 2}]
    assert result["slowTraces"][0]["traceId"] == "trace-slow"
    metric_queries = [
        query
        for query, _ in captured_queries
        if any(
            marker in query
            for marker in (
                "/* summary */",
                "/* traceTrend */",
                "/* latencyTrend */",
                "/* environmentDistribution */",
                "/* slowTraces */",
            )
        )
    ]
    assert len(metric_queries) == 5


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
async def test_list_traces_by_ids_loads_scores_when_requested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reader = LangfuseClickHouseReader(Settings())
    score = {
        "id": "score-1",
        "traceId": "trace-1",
        "name": "quality",
        "value": 0.9,
        "source": "ANNOTATION",
        "dataType": "NUMERIC",
        "stringValue": "",
        "comment": "通过",
        "metadata": {},
        "authorUserId": "user-1",
        "configId": "score-config-1",
        "queueId": "queue-old",
        "createdAt": "2026-07-05T01:37:01.000Z",
        "updatedAt": "2026-07-05T01:37:01.000Z",
    }
    score_calls: list[tuple[str, list[str]]] = []

    async def fake_fetch_trace_rows(
        project_id: str,
        **_kwargs: object,
    ) -> list[dict]:
        return [
            {
                "traceId": "trace-1",
                "projectId": project_id,
                "environment": "default",
                "status": "success",
                "createdAt": "2026-07-05 01:36:59.275",
            }
        ]

    async def fake_fetch_scores_by_trace(
        project_id: str,
        trace_ids: list[str],
        **_kwargs: object,
    ) -> dict[str, list[dict]]:
        score_calls.append((project_id, trace_ids))
        return {"trace-1": [score]}

    monkeypatch.setattr(reader, "_fetch_trace_rows", fake_fetch_trace_rows)
    monkeypatch.setattr(
        reader,
        "_fetch_scores_by_trace",
        fake_fetch_scores_by_trace,
    )

    rows = await reader.list_traces_by_ids(
        "project-1",
        ["trace-1"],
        fields="scores",
    )

    assert score_calls == [("project-1", ["trace-1"])]
    assert rows[0]["scores"] == [score]
    assert rows[0]["scoreSummary"] == "quality: 0.9"


@pytest.mark.anyio
async def test_clickhouse_reader_filters_traces_by_score_values(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())

    async def fake_count_trace_rows(*args, **kwargs):
        return 1

    async def fake_fetch_trace_rows(*args, **kwargs):
        return [
            {
                "traceId": "trace-pass",
                "projectId": "project-1",
                "environment": "default",
                "status": "success",
                "latency": 120,
                "createdAt": "2026-07-05 01:36:59.275",
                "userId": "user-1",
                "metadata": {},
                "tags": [],
                "scores": [
                    {
                        "id": "score-1",
                        "name": "quality",
                        "value": 0.91,
                        "stringValue": "",
                        "queueId": "queue-1",
                    },
                    {
                        "id": "score-2",
                        "name": "category",
                        "value": None,
                        "stringValue": "passed",
                        "queueId": "queue-1",
                    },
                ],
            },
        ]

    monkeypatch.setattr(reader, "_count_trace_rows", fake_count_trace_rows)
    monkeypatch.setattr(reader, "_fetch_trace_rows", fake_fetch_trace_rows)

    result = await reader.list_traces(
        "project-1",
        page=1,
        page_size=10,
        score_queue_id="queue-1",
        categorical_score_filters=[
            {"name": "category", "operator": "equals", "value": "passed"},
        ],
        numeric_score_filters=[
            {"name": "quality", "operator": "gte", "value": 0.8},
        ],
        time_range=None,
    )

    assert result["total"] == 1
    assert result["datas"][0]["traceId"] == "trace-pass"


@pytest.mark.anyio
async def test_trace_score_filters_use_normalized_final_score_candidates(
    monkeypatch,
) -> None:
    reader = LangfuseClickHouseReader(Settings())

    async def fake_query(query: str, params: dict):
        uses_normalized_score_candidates = (
            "FROM scores s FINAL" in query
            and "ifNull(s.trace_id, '')" in query
            and "ifNull(s.queue_id, '')" in query
        )
        if "SELECT count() AS total" in query:
            return [{"total": 1 if uses_normalized_score_candidates else 0}]
        if (
            "FROM trace_base base" in query
            and "LIMIT {limit:UInt32}" in query
        ):
            if not uses_normalized_score_candidates:
                return []
            return [
                {
                    "traceId": "trace-pass",
                    "projectId": "project-1",
                    "environment": "default",
                    "status": "success",
                    "latency": 120,
                    "createdAt": "2026-07-05 01:36:59.275",
                    "userId": "user-1",
                    "metadata": {},
                    "tags": [],
                }
            ]
        if "FROM scores" in query and "trace_id IN" in query:
            return [
                {
                    "id": "score-1",
                    "traceId": "trace-pass",
                    "observationId": None,
                    "sessionId": None,
                    "name": "quality",
                    "value": 0.91,
                    "source": "API",
                    "comment": "",
                    "metadata": {},
                    "authorUserId": "",
                    "configId": "",
                    "dataType": "NUMERIC",
                    "stringValue": "",
                    "longStringValue": "",
                    "queueId": "queue-1",
                    "createdAt": "2026-07-05 01:37:01.000",
                    "updatedAt": "2026-07-05 01:37:01.000",
                },
                {
                    "id": "score-2",
                    "traceId": "trace-pass",
                    "observationId": None,
                    "sessionId": None,
                    "name": "category",
                    "value": 0,
                    "source": "API",
                    "comment": "",
                    "metadata": {},
                    "authorUserId": "",
                    "configId": "",
                    "dataType": "CATEGORICAL",
                    "stringValue": "passed",
                    "longStringValue": "",
                    "queueId": "queue-1",
                    "createdAt": "2026-07-05 01:37:00.000",
                    "updatedAt": "2026-07-05 01:37:00.000",
                },
            ]
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    result = await reader.list_traces(
        "project-1",
        page=1,
        page_size=10,
        score_queue_id="queue-1",
        categorical_score_filters=[
            {"name": "category", "operator": "equals", "value": "passed"},
        ],
        numeric_score_filters=[
            {"name": "quality", "operator": "gte", "value": 0.8},
        ],
        time_range=None,
    )

    assert result["total"] == 1
    assert [row["traceId"] for row in result["datas"]] == ["trace-pass"]


@pytest.mark.anyio
async def test_trace_score_filter_page_query_uses_clickhouse_safe_timestamp_order(
    monkeypatch,
) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured_page_query = ""

    async def fake_query(query: str, params: dict):
        nonlocal captured_page_query
        if "SELECT count() AS total" in query:
            return [{"total": 0}]
        if (
            "FROM trace_base base" in query
            and "LIMIT {limit:UInt32}" in query
        ):
            captured_page_query = query
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    await reader.list_traces(
        "project-1",
        page=1,
        page_size=10,
        score_queue_id="queue-1",
        time_range=None,
    )

    assert "ORDER BY toUnixTimestamp64Milli(createdAt) DESC, traceId DESC" in captured_page_query


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
    captured_queries = []

    async def fake_query(query: str, params: dict):
        captured_queries.append(query)
        captured_params.append(params)
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    await reader._fetch_scores_by_trace(
        "project-1",
        [f"trace-{index}" for index in range(205)],
    )

    assert len(captured_params) == 3
    assert all(len([key for key in params if key.startswith("score_trace_id_")]) <= 100 for params in captured_params)
    assert all("FROM scores FINAL" in query for query in captured_queries)
    assert all("AND is_deleted = 0" in query for query in captured_queries)


@pytest.mark.anyio
async def test_clickhouse_reader_lists_latest_queue_score_versions(monkeypatch) -> None:
    reader = LangfuseClickHouseReader(Settings())
    captured = {}

    async def fake_query(query: str, params: dict):
        captured["query"] = query
        captured["params"] = params
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    await reader.list_scores_by_queue(
        "project-1",
        "queue-1",
        trace_ids=["trace-1"],
    )

    assert "FROM scores FINAL" in captured["query"]
    assert "AND is_deleted = 0" in captured["query"]


@pytest.mark.anyio
async def test_clickhouse_reader_disables_environment_proxy(monkeypatch) -> None:
    captured = {}

    class FakeResponse:
        text = ""

        def raise_for_status(self) -> None:
            return None

    class FakeAsyncClient:
        is_closed = False

        def __init__(self, **kwargs) -> None:
            captured["client_kwargs"] = kwargs

        async def post(self, *args, **kwargs) -> FakeResponse:
            return FakeResponse()

        async def aclose(self) -> None:
            self.is_closed = True

    await clickhouse.close_clickhouse_http_client()
    monkeypatch.setattr(clickhouse.httpx, "AsyncClient", FakeAsyncClient)
    clickhouse.start_clickhouse_http_client(
        Settings(),
        clickhouse.get_data_access_pool_settings(),
    )
    reader = LangfuseClickHouseReader(Settings())

    await reader._query_json_each_row("SELECT 1 FORMAT JSONEachRow", {})

    assert captured["client_kwargs"]["trust_env"] is False
    await clickhouse.close_clickhouse_http_client()
