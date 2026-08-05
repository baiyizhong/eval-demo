import base64
import json

import httpx
import pytest

from app.errors import (
    LangfuseConfigError,
    LangfuseUpstreamError,
)
from app.langfuse.public_client import LangfusePublicClient, normalize_llm_adapter


@pytest.mark.anyio
async def test_project_request_uses_basic_auth_and_preserves_public_payload() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [{"id": "connection-1"}]})

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        response = await client.list_llm_connections(page=1, limit=20)
    finally:
        await client.aclose()

    expected = base64.b64encode(
        b"pk-lf-project:sk-lf-secret"
    ).decode("ascii")
    assert requests[0].headers["Authorization"] == f"Basic {expected}"
    assert requests[0].url.path == "/api/public/llm-connections"
    assert response["data"][0]["id"] == "connection-1"


@pytest.mark.anyio
async def test_upserts_connection_with_documented_public_api_shape() -> None:
    request_body = {}

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_body
        request_body = __import__("json").loads(request.content)
        return httpx.Response(200, json={"id": "connection-1", "provider": "openai"})

    client = LangfusePublicClient(
        base_url="http://langfuse.test/",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        await client.upsert_llm_connection(
            {
                "provider": "openai",
                "adapter": "openai",
                "secretKey": "provider-secret",
                "baseURL": "https://api.example.com/v1",
                "customModels": ["gpt-4.1"],
                "withDefaultModels": True,
            }
        )
    finally:
        await client.aclose()

    assert request_body["provider"] == "openai"
    assert request_body["customModels"] == ["gpt-4.1"]


@pytest.mark.anyio
async def test_transport_error_maps_to_stable_safe_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("secret timeout detail", request=request)

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        with pytest.raises(LangfuseUpstreamError) as exc_info:
            await client.list_models()
    finally:
        await client.aclose()

    assert exc_info.value.message == "Langfuse 服务暂不可用"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("method_name", "path"),
    [
        ("list_all_llm_connections", "/api/public/llm-connections"),
        ("list_all_models", "/api/public/models"),
    ],
)
async def test_list_all_resources_follows_public_api_pagination(
    method_name: str,
    path: str,
) -> None:
    requested_pages: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == path
        page = int(request.url.params["page"])
        requested_pages.append(page)
        data = [{"id": f"resource-{index}"} for index in range(100)]
        if page == 2:
            data = [{"id": "resource-final"}]
        return httpx.Response(
            200,
            json={
                "data": data,
                "meta": {"page": page, "limit": 100, "totalPages": 2},
            },
        )

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        resources = await getattr(client, method_name)()
    finally:
        await client.aclose()

    assert requested_pages == [1, 2]
    assert len(resources) == 101
    assert resources[-1]["id"] == "resource-final"


@pytest.mark.anyio
async def test_missing_credentials_fail_before_request() -> None:
    client = LangfusePublicClient(base_url="http://langfuse.test")
    try:
        with pytest.raises(LangfuseConfigError):
            await client.list_evaluators()
    finally:
        await client.aclose()


@pytest.mark.anyio
async def test_get_model_uses_documented_resource_path() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "id": "model-1",
                "modelName": "gpt-4.1",
                "isLangfuseManaged": False,
            },
        )

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        model = await client.get_model("model-1")
    finally:
        await client.aclose()

    assert requests[0].url.path == "/api/public/models/model-1"
    assert model["modelName"] == "gpt-4.1"


def test_normalizes_legacy_openai_compatible_adapter() -> None:
    assert normalize_llm_adapter("openai-compatible") == "openai"


def test_rejects_adapter_not_supported_by_langfuse_public_api() -> None:
    with pytest.raises(ValueError, match="不支持"):
        normalize_llm_adapter("custom-adapter")


@pytest.mark.anyio
async def test_list_traces_uses_public_trace_endpoint_and_structured_filter() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [], "meta": {"totalItems": 0}})

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    trace_filter = [
        {"type": "boolean", "column": "bookmarked", "operator": "=", "value": True}
    ]
    try:
        await client.list_traces(
            page=2,
            limit=25,
            fields="core,io,metrics",
            filter=trace_filter,
        )
    finally:
        await client.aclose()

    request = requests[0]
    assert request.method == "GET"
    assert request.url.path == "/api/public/traces"
    assert request.url.params["page"] == "2"
    assert request.url.params["limit"] == "25"
    assert request.url.params["fields"] == "core,io,metrics"
    assert json.loads(request.url.params["filter"]) == trace_filter


@pytest.mark.anyio
async def test_list_experiments_uses_public_experiment_endpoint() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"data": [{"id": "experiment-1"}], "meta": {"totalItems": 1}},
        )

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        response = await client.list_experiments(
            page=2,
            limit=25,
            dataset_name="客服黄金集",
        )
    finally:
        await client.aclose()

    request = requests[0]
    assert request.method == "GET"
    assert request.url.path == "/api/public/experiments"
    assert request.url.params["page"] == "2"
    assert request.url.params["limit"] == "25"
    assert request.url.params["datasetName"] == "客服黄金集"
    assert response["data"][0]["id"] == "experiment-1"


@pytest.mark.anyio
async def test_list_experiment_items_uses_public_experiment_items_endpoint() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"data": [{"id": "item-1"}], "meta": {"totalItems": 1}},
        )

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        response = await client.list_experiment_items(
            experiment_id="experiment-1",
            page=1,
            limit=50,
        )
    finally:
        await client.aclose()

    request = requests[0]
    assert request.method == "GET"
    assert request.url.path == "/api/public/experiment-items"
    assert request.url.params["experimentId"] == "experiment-1"
    assert response["data"][0]["id"] == "item-1"


@pytest.mark.anyio
async def test_create_dataset_run_item_uses_public_dataset_run_items_endpoint() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "id": "run-item-1",
                "datasetItemId": "item-1",
                "datasetRunName": "客服实验::group-1",
                "traceId": "trace-1",
            },
        )

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        response = await client.create_dataset_run_item(
            {
                "runName": "客服实验::group-1",
                "runDescription": "真实场景实验",
                "datasetItemId": "item-1",
                "traceId": "trace-1",
                "observationId": "obs-1",
                "metadata": {"paExperimentGroupId": "group-1"},
            }
        )
    finally:
        await client.aclose()

    request = requests[0]
    request_body = json.loads(request.content)
    assert request.method == "POST"
    assert request.url.path == "/api/public/dataset-run-items"
    assert request_body == {
        "runName": "客服实验::group-1",
        "runDescription": "真实场景实验",
        "datasetItemId": "item-1",
        "traceId": "trace-1",
        "observationId": "obs-1",
        "metadata": {"paExperimentGroupId": "group-1"},
    }
    assert response["id"] == "run-item-1"


@pytest.mark.anyio
async def test_list_dataset_run_items_uses_current_public_endpoint() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"data": [{"id": "run-item-1"}], "meta": {"totalItems": 1}},
        )

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        response = await client.list_dataset_run_items(
            dataset_id="dataset-1",
            run_name="客服实验::group-1",
            page=2,
            limit=25,
        )
    finally:
        await client.aclose()

    request = requests[0]
    assert request.method == "GET"
    assert request.url.path == "/api/public/dataset-run-items"
    assert request.url.params["datasetId"] == "dataset-1"
    assert request.url.params["runName"] == "客服实验::group-1"
    assert request.url.params["page"] == "2"
    assert request.url.params["limit"] == "25"
    assert response["data"][0]["id"] == "run-item-1"


@pytest.mark.anyio
async def test_create_score_uses_public_scores_endpoint() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "score-1"})

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        response = await client.create_score(
            {
                "id": "score-1",
                "traceId": "trace-1",
                "name": "accuracy",
                "value": 0.88,
                "comment": "PA 评估通过",
            }
        )
    finally:
        await client.aclose()

    request = requests[0]
    assert request.method == "POST"
    assert request.url.path == "/api/public/scores"
    assert json.loads(request.content) == {
        "id": "score-1",
        "traceId": "trace-1",
        "name": "accuracy",
        "value": 0.88,
        "comment": "PA 评估通过",
    }
    assert response["id"] == "score-1"


@pytest.mark.anyio
async def test_get_trace_selects_documented_field_groups() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "trace-1"})

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        await client.get_trace("trace-1", fields="core,observations,scores")
    finally:
        await client.aclose()

    assert requests[0].url.path == "/api/public/traces/trace-1"
    assert requests[0].url.params["fields"] == "core,observations,scores"


@pytest.mark.anyio
async def test_list_observations_uses_v2_cursor_and_filter_contract() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [], "meta": {"cursor": None}})

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    observation_filter = [
        {"type": "string", "column": "traceId", "operator": "=", "value": "trace-1"}
    ]
    try:
        await client.list_observations(
            cursor="cursor-1",
            limit=1000,
            fields="core,basic,io,usage",
            filter=observation_filter,
            expand_metadata=["tenant", "request_id"],
        )
    finally:
        await client.aclose()

    request = requests[0]
    assert request.method == "GET"
    assert request.url.path == "/api/public/v2/observations"
    assert request.url.params["cursor"] == "cursor-1"
    assert request.url.params["limit"] == "1000"
    assert request.url.params["fields"] == "core,basic,io,usage"
    assert request.url.params["expandMetadata"] == "tenant,request_id"
    assert json.loads(request.url.params["filter"]) == observation_filter


@pytest.mark.anyio
async def test_query_metrics_serializes_v2_query_as_json_parameter() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [{"count": 3}]})

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    query = {
        "view": "observations",
        "dimensions": [],
        "metrics": [{"measure": "count", "aggregation": "count"}],
        "fromTimestamp": "2026-07-01T00:00:00Z",
        "toTimestamp": "2026-07-24T00:00:00Z",
    }
    try:
        response = await client.query_metrics(query)
    finally:
        await client.aclose()

    assert requests[0].method == "GET"
    assert requests[0].url.path == "/api/public/v2/metrics"
    assert json.loads(requests[0].url.params["query"]) == query
    assert response["data"][0]["count"] == 3


@pytest.mark.anyio
async def test_list_scores_uses_v3_cursor_and_subject_fields() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [], "meta": {"cursor": None}})

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        await client.list_scores(
            cursor="score-cursor",
            limit=100,
            fields="details,subject,annotation",
            name="quality",
            data_type="NUMERIC",
            value_min=0.8,
            queue_id="queue-1",
        )
    finally:
        await client.aclose()

    request = requests[0]
    assert request.url.path == "/api/public/v3/scores"
    assert request.url.params["cursor"] == "score-cursor"
    assert request.url.params["fields"] == "details,subject,annotation"
    assert request.url.params["name"] == "quality"
    assert request.url.params["dataType"] == "NUMERIC"
    assert request.url.params["valueMin"] == "0.8"
    assert request.url.params["queueId"] == "queue-1"


@pytest.mark.anyio
async def test_dataset_and_item_methods_use_documented_public_endpoints() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "resource-1"})

    client = LangfusePublicClient(
        base_url="http://langfuse.test",
        public_key="pk-lf-project",
        secret_key="sk-lf-secret",
        transport=httpx.MockTransport(handler),
    )
    try:
        await client.list_datasets(page=2, limit=25)
        await client.create_dataset(
            {
                "name": "refund",
                "description": "退款评测",
                "metadata": {"type": "evaluation"},
                "inputSchema": {"type": "object"},
            }
        )
        await client.get_dataset("退款 数据集")
        await client.list_dataset_items(dataset_name="退款 数据集", page=3, limit=50)
        await client.upsert_dataset_item(
            {
                "id": "item-1",
                "datasetName": "退款 数据集",
                "status": "ARCHIVED",
            }
        )
        await client.get_dataset_item("item-1")
        await client.delete_dataset_item("item-1")
    finally:
        await client.aclose()

    assert [(request.method, request.url.path) for request in requests] == [
        ("GET", "/api/public/v2/datasets"),
        ("POST", "/api/public/v2/datasets"),
        ("GET", "/api/public/v2/datasets/退款 数据集"),
        ("GET", "/api/public/dataset-items"),
        ("POST", "/api/public/dataset-items"),
        ("GET", "/api/public/dataset-items/item-1"),
        ("DELETE", "/api/public/dataset-items/item-1"),
    ]
    assert dict(requests[0].url.params) == {"page": "2", "limit": "25"}
    assert requests[3].url.params["datasetName"] == "退款 数据集"
