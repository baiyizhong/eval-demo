from importlib.util import find_spec

import pytest

from app.langfuse import observability_adapter
from app.langfuse_db import LangfuseDatabaseReader


def test_langfuse_observability_adapter_module_exists() -> None:
    assert find_spec("app.langfuse.observability_adapter") is not None


def test_database_reader_exposes_project_scoped_public_client_factory() -> None:
    assert hasattr(LangfuseDatabaseReader, "project_public_client_for_user")


class FakePublicClient:
    def __init__(self) -> None:
        self.trace_kwargs: dict = {}
        self.observation_kwargs: dict = {}
        self.score_kwargs: dict = {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def list_traces(self, **kwargs) -> dict:
        self.trace_kwargs = kwargs
        return {
            "data": [
                {
                    "id": "trace-1",
                    "projectId": "project-1",
                    "timestamp": "2026-07-24T01:02:03.000Z",
                    "sessionId": "session-1",
                    "userId": "user-1",
                    "environment": "production",
                    "metadata": {"businessId": "biz-1"},
                    "tags": ["refund"],
                    "latency": 0.12,
                    "observations": [{"level": "DEFAULT"}],
                    "scores": [{"name": "quality", "value": 0.9}],
                }
            ],
            "meta": {"totalItems": 1},
        }

    async def get_trace(self, trace_id: str, *, fields: str | None = None) -> dict:
        assert trace_id == "trace-1"
        assert fields in {"core", "core,io,scores,observations,metrics"}
        return {
            "id": "trace-1",
            "projectId": "project-1",
            "timestamp": "2026-07-24T01:02:03.000Z",
            "input": {"question": "如何退款"},
            "output": {"answer": "查看订单"},
            "metadata": {"businessId": "biz-1"},
            "latency": 0.12,
            "observations": [
                {
                    "id": "obs-1",
                    "traceId": "trace-1",
                    "projectId": "project-1",
                    "type": "GENERATION",
                    "name": "answer",
                    "level": "DEFAULT",
                    "startTime": "2026-07-24T01:02:03.000Z",
                    "endTime": "2026-07-24T01:02:03.120Z",
                    "input": {"question": "如何退款"},
                    "output": {"answer": "查看订单"},
                }
            ],
            "scores": [
                {
                    "id": "score-1",
                    "name": "quality",
                    "value": 0.9,
                    "observationId": "obs-1",
                }
            ],
        }

    async def query_metrics(self, query: dict) -> dict:
        dimensions = query.get("dimensions") or []
        time_dimension = query.get("timeDimension")
        if time_dimension:
            return {"data": []}
        if dimensions == [{"field": "level"}]:
            return {
                "data": [
                    {"level": "DEFAULT", "count_count": 2},
                    {"level": "ERROR", "count_count": 1},
                ]
            }
        if dimensions == [{"field": "environment"}]:
            return {"data": [{"environment": "production", "count_count": 3}]}
        return {
            "data": [
                {
                    "count_count": 3,
                    "avg_latency": 120,
                    "p95_latency": 240,
                }
            ]
        }

    async def list_observations(self, **kwargs) -> dict:
        self.observation_kwargs = kwargs
        return {
            "data": [
                {
                    "id": "obs-1",
                    "traceId": "trace-1",
                    "input": '{"question":"如何开发票"}',
                    "output": '{"answer":"订单页申请"}',
                }
            ],
            "meta": {"cursor": None},
        }

    async def list_scores(self, **kwargs) -> dict:
        self.score_kwargs = kwargs
        return {
            "data": [
                {
                    "id": "score-1",
                    "name": "quality",
                    "value": 0.9,
                    "subject": {"kind": "trace", "id": "trace-1"},
                }
            ],
            "meta": {"cursor": None},
        }


class FakeDatabaseReader:
    def __init__(self, client: FakePublicClient) -> None:
        self.client = client

    async def project_public_client_for_user(self, project_id: str, user_id: str):
        assert project_id == "project-1"
        assert user_id == "user-1"
        return self.client


@pytest.mark.anyio
async def test_list_traces_maps_langfuse_payload_to_existing_pa_contract() -> None:
    adapter_type = getattr(observability_adapter, "LangfuseObservabilityAdapter")
    public_client = FakePublicClient()
    adapter = adapter_type(FakeDatabaseReader(public_client))

    result = await adapter.list_traces(
        "project-1",
        "user-1",
        page=1,
        page_size=10,
        keyword="refund",
        statuses=["failed"],
        environments=["production"],
        tags=["refund"],
        business_id="biz-1",
        anchor_trace_id="trace-1",
        time_range="1d",
    )

    assert result == {
        "total": 1,
        "datas": [
            {
                "traceId": "trace-1",
                "sessionId": "session-1",
                "projectId": "project-1",
                "projectName": "",
                "environment": "production",
                "status": "success",
                "latency": 120,
                "createdAt": "2026-07-24T01:02:03.000Z",
                "userId": "user-1",
                "businessId": "biz-1",
                "tags": ["refund"],
                "scores": [{"name": "quality", "value": 0.9}],
                "scoreSummary": "quality: 0.9",
            }
        ],
    }
    assert public_client.trace_kwargs["page"] == 1
    assert public_client.trace_kwargs["limit"] == 10
    assert public_client.trace_kwargs["fields"] == (
        "core,io,scores,observations,metrics"
    )
    assert {
        "type": "stringOptions",
        "column": "environment",
        "operator": "any of",
        "value": ["production"],
    } in public_client.trace_kwargs["filter"]
    assert {
        "type": "datetime",
        "column": "timestamp",
        "operator": "<=",
        "value": "2026-07-24T01:02:03.000Z",
    } in public_client.trace_kwargs["filter"]
    assert {
        "type": "arrayOptions",
        "column": "tags",
        "operator": "all of",
        "value": ["refund"],
    } in public_client.trace_kwargs["filter"]
    assert {
        "type": "stringOptions",
        "column": "level",
        "operator": "any of",
        "value": ["ERROR"],
    } in public_client.trace_kwargs["filter"]
    assert {
        "type": "stringObject",
        "column": "metadata",
        "key": "businessId",
        "operator": "contains",
        "value": "biz-1",
    } in public_client.trace_kwargs["filter"]


@pytest.mark.anyio
async def test_trace_and_observation_details_are_derived_from_public_trace() -> None:
    adapter_type = getattr(observability_adapter, "LangfuseObservabilityAdapter")
    adapter = adapter_type(FakeDatabaseReader(FakePublicClient()))

    trace = await adapter.get_trace("project-1", "user-1", "trace-1")
    observation = await adapter.get_observation(
        "project-1",
        "user-1",
        "trace-1",
        "obs-1",
    )

    assert trace["traceId"] == "trace-1"
    assert trace["input"] == '{\n  "question": "如何退款"\n}'
    assert trace["callChain"][0]["id"] == "obs-1"
    assert observation["id"] == "obs-1"
    assert observation["scores"] == [
        {
            "id": "score-1",
            "name": "quality",
            "value": 0.9,
            "observationId": "obs-1",
        }
    ]


@pytest.mark.anyio
async def test_trace_metrics_are_aggregated_from_metrics_v2() -> None:
    adapter_type = getattr(observability_adapter, "LangfuseObservabilityAdapter")
    adapter = adapter_type(FakeDatabaseReader(FakePublicClient()))

    metrics = await adapter.get_trace_metrics(
        "project-1",
        "user-1",
        time_range="1d",
        environment="production",
    )

    assert metrics["summary"] == {
        "total": 3,
        "success": 2,
        "failed": 1,
        "failureRate": pytest.approx(1 / 3),
        "averageLatency": 120,
        "p95Latency": 240,
        "totalChangeRate": 0,
    }
    assert metrics["environmentDistribution"] == [
        {"environment": "production", "count": 3}
    ]


@pytest.mark.anyio
async def test_advanced_io_and_score_filters_restrict_public_trace_ids() -> None:
    adapter_type = getattr(observability_adapter, "LangfuseObservabilityAdapter")
    public_client = FakePublicClient()
    adapter = adapter_type(FakeDatabaseReader(public_client))

    await adapter.list_traces(
        "project-1",
        "user-1",
        page=1,
        page_size=10,
        input_filters=[
            {"key": "question", "operator": "contains", "value": "发票"}
        ],
        numeric_score_filters=[
            {"name": "quality", "operator": "gte", "value": 0.8}
        ],
        score_queue_id="queue-1",
    )

    assert public_client.observation_kwargs["fields"] == "core,io"
    assert public_client.score_kwargs == {
        "limit": 100,
        "fields": "details,subject,annotation",
        "name": "quality",
        "data_type": "NUMERIC",
        "value_min": 0.8,
        "queue_id": "queue-1",
    }
    assert {
        "type": "stringOptions",
        "column": "id",
        "operator": "any of",
        "value": ["trace-1"],
    } in public_client.trace_kwargs["filter"]
