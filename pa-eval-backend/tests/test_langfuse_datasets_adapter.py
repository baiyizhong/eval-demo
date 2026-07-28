"""Contract tests for the Langfuse Public API datasets adapter.

These tests pin the behaviour required by ``app/datasets.py`` routes while
reading/writing through the typed ``LangfusePublicClient`` instead of direct
ClickHouse/PostgreSQL access. They follow the same FakePublicClient pattern
used by ``test_langfuse_observability_adapter.py``.
"""

from importlib.util import find_spec

import pytest
from app.langfuse import datasets_adapter


def test_langfuse_datasets_adapter_module_exists() -> None:
    assert find_spec("app.langfuse.datasets_adapter") is not None


class FakePublicClient:
    """Records calls and returns canned Public API v2 payloads."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.datasets: list[dict] = []
        self.dataset_items: list[dict] = []
        self.created_dataset: dict | None = None
        self.upserted_items: list[dict] = []
        self.deleted_items: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def list_datasets(self, *, page: int = 1, limit: int = 50) -> dict:
        self.calls.append(("list_datasets", page, limit))
        start = (page - 1) * limit
        page_items = self.datasets[start : start + limit]
        return {
            "data": page_items,
            "meta": {
                "page": page,
                "limit": limit,
                "totalItems": len(self.datasets),
                "totalPages": max(1, (len(self.datasets) + limit - 1) // limit),
            },
        }

    async def create_dataset(self, payload: dict) -> dict:
        self.calls.append(("create_dataset", payload))
        self.created_dataset = {
            "id": "dataset-new",
            "projectId": "project-1",
            "name": payload["name"],
            "description": payload.get("description") or "",
            "metadata": payload.get("metadata") or {},
            "inputSchema": payload.get("inputSchema") or {},
            "expectedOutputSchema": payload.get("expectedOutputSchema") or {},
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        }
        self.datasets.append(self.created_dataset)
        return self.created_dataset

    async def get_dataset(self, dataset_name: str) -> dict:
        self.calls.append(("get_dataset", dataset_name))
        for dataset in self.datasets:
            if dataset["name"] == dataset_name:
                return dataset
        raise AssertionError(f"unexpected dataset name: {dataset_name}")

    async def list_dataset_items(
        self,
        *,
        dataset_name: str | None = None,
        page: int = 1,
        limit: int = 50,
        source_trace_id: str | None = None,
        source_observation_id: str | None = None,
        version: str | None = None,
    ) -> dict:
        self.calls.append(
            ("list_dataset_items", dataset_name, page, limit)
        )
        items = self.dataset_items
        if dataset_name is not None:
            items = [
                item for item in items if item.get("datasetName") == dataset_name
            ]
        start = (page - 1) * limit
        page_items = items[start : start + limit]
        return {
            "data": page_items,
            "meta": {
                "page": page,
                "limit": limit,
                "totalItems": len(items),
                "totalPages": max(1, (len(items) + limit - 1) // limit),
            },
        }

    async def upsert_dataset_item(self, payload: dict) -> dict:
        self.calls.append(("upsert_dataset_item", payload))
        item = {
            "id": payload.get("id") or f"item-{len(self.upserted_items) + 1}",
            "datasetName": payload["datasetName"],
            "datasetId": payload.get("datasetId", "dataset-1"),
            "status": payload.get("status") or "ACTIVE",
            "input": payload.get("input"),
            "expectedOutput": payload.get("expectedOutput"),
            "metadata": payload.get("metadata") or {},
            "sourceTraceId": payload.get("sourceTraceId"),
            "sourceObservationId": payload.get("sourceObservationId"),
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        }
        self.upserted_items.append(item)
        return item

    async def get_dataset_item(self, item_id: str) -> dict:
        self.calls.append(("get_dataset_item", item_id))
        for item in self.dataset_items:
            if item["id"] == item_id:
                return item
        raise AssertionError(f"unexpected item id: {item_id}")

    async def delete_dataset_item(self, item_id: str) -> dict:
        self.calls.append(("delete_dataset_item", item_id))
        self.deleted_items.append(item_id)
        return {}


class FakeProjectClients:
    def __init__(self, client: FakePublicClient) -> None:
        self.client = client
        self.last_project_id: str | None = None
        self.last_user_id: str | None = None
        self.resource_extensions: dict[tuple[str, str, str, str], dict] = {}

    async def project_public_client_for_user(
        self,
        project_id: str,
        user_id: str,
    ):
        self.last_project_id = project_id
        self.last_user_id = user_id
        return self.client

    async def get_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: str,
    ) -> dict | None:
        return self.resource_extensions.get(
            (project_id, resource_type, resource_id, extension_type)
        )

    async def upsert_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: str,
        payload: dict,
        actor: str,
        schema_version: int = 1,
    ) -> dict:
        row = {
            "project_id": project_id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "extension_type": extension_type,
            "payload": payload,
            "status": "ACTIVE",
            "actor": actor,
            "schema_version": schema_version,
        }
        self.resource_extensions[
            (project_id, resource_type, resource_id, extension_type)
        ] = row
        return row


def _adapter(client: FakePublicClient):
    adapter_cls = getattr(datasets_adapter, "LangfuseDatasetsAdapter")
    return adapter_cls(FakeProjectClients(client))


def _seed_datasets(client: FakePublicClient) -> None:
    client.datasets = [
        {
            "id": "dataset-1",
            "projectId": "project-1",
            "name": "客服黄金集",
            "description": "Langfuse 数据集",
            "metadata": {"type": "golden"},
            "inputSchema": {},
            "expectedOutputSchema": {},
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T02:00:00.000Z",
        },
        {
            "id": "dataset-2",
            "projectId": "project-1",
            "name": "回归评测集",
            "description": "",
            "metadata": {"type": "evaluation"},
            "inputSchema": {},
            "expectedOutputSchema": {},
            "createdAt": "2026-07-24T01:30:00.000Z",
            "updatedAt": "2026-07-24T01:30:00.000Z",
        },
    ]
    client.dataset_items = [
        {
            "id": "item-1",
            "datasetName": "客服黄金集",
            "datasetId": "dataset-1",
            "status": "ACTIVE",
            "input": {"question": "怎么退款？"},
            "expectedOutput": {"answer": "查看订单"},
            "metadata": {"batch": "a"},
            "sourceTraceId": "trace-1",
            "sourceObservationId": None,
            "createdAt": "2026-07-24T01:10:00.000Z",
            "updatedAt": "2026-07-24T01:10:00.000Z",
        },
        {
            "id": "item-2",
            "datasetName": "客服黄金集",
            "datasetId": "dataset-1",
            "status": "ARCHIVED",
            "input": {"question": "怎么开发票？"},
            "expectedOutput": {"answer": "订单页申请"},
            "metadata": {},
            "sourceTraceId": None,
            "sourceObservationId": None,
            "createdAt": "2026-07-24T01:20:00.000Z",
            "updatedAt": "2026-07-24T01:20:00.000Z",
        },
    ]


@pytest.mark.anyio
async def test_list_datasets_maps_public_payload_and_aggregates_item_counts() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    result = await adapter.list_datasets(
        "project-1",
        "user-1",
        page=1,
        page_size=10,
    )

    assert result["total"] == 2
    names = [item["name"] for item in result["datas"]]
    assert names == ["客服黄金集", "回归评测集"]
    golden = result["datas"][0]
    assert golden["id"] == "dataset-1"
    assert golden["projectId"] == "project-1"
    assert golden["type"] == "golden"
    assert golden["itemCount"] == 2
    assert golden["runCount"] == 0
    assert ("list_datasets", 1, 100) in client.calls


@pytest.mark.anyio
async def test_list_datasets_applies_keyword_and_type_filters_in_adapter() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    result = await adapter.list_datasets(
        "project-1",
        "user-1",
        page=1,
        page_size=10,
        keyword="黄金",
        dataset_type="golden",
    )

    assert [item["name"] for item in result["datas"]] == ["客服黄金集"]
    assert result["total"] == 1


@pytest.mark.anyio
async def test_get_dataset_returns_pa_contract_with_aggregated_counts() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    dataset = await adapter.get_dataset("project-1", "user-1", "dataset-1")

    assert dataset["id"] == "dataset-1"
    assert dataset["name"] == "客服黄金集"
    assert dataset["type"] == "golden"
    assert dataset["itemCount"] == 2
    assert dataset["runCount"] == 0
    assert ("list_datasets", 1, 100) in client.calls


@pytest.mark.anyio
async def test_create_dataset_routes_to_public_v2_create() -> None:
    client = FakePublicClient()
    adapter = _adapter(client)

    dataset = await adapter.create_dataset(
        "project-1",
        "user-1",
        {
            "name": "新数据集",
            "type": "evaluation",
            "description": "desc",
            "metadata": {"type": "evaluation"},
            "inputSchema": {},
            "expectedOutputSchema": {},
        },
    )

    assert dataset["name"] == "新数据集"
    assert dataset["type"] == "evaluation"
    assert client.created_dataset is not None
    create_call = [c for c in client.calls if c[0] == "create_dataset"][0]
    assert "inputSchema" not in create_call[1]
    assert "expectedOutputSchema" not in create_call[1]


@pytest.mark.anyio
async def test_create_dataset_passes_valid_json_schemas_to_public_v2_create() -> None:
    client = FakePublicClient()
    adapter = _adapter(client)

    await adapter.create_dataset(
        "project-1",
        "user-1",
        {
            "name": "Schema 数据集",
            "type": "evaluation",
            "description": "desc",
            "metadata": {"type": "evaluation"},
            "inputSchema": {"type": "object"},
            "expectedOutputSchema": {"type": "object"},
        },
    )

    create_call = [c for c in client.calls if c[0] == "create_dataset"][0]
    assert create_call[1]["inputSchema"] == {"type": "object"}
    assert create_call[1]["expectedOutputSchema"] == {"type": "object"}


@pytest.mark.anyio
async def test_is_dataset_name_available_true_when_no_conflict() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    available = await adapter.is_dataset_name_available(
        "project-1", "user-1", "全新名称"
    )
    assert available is True


@pytest.mark.anyio
async def test_is_dataset_name_available_false_on_conflict() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    available = await adapter.is_dataset_name_available(
        "project-1", "user-1", "客服黄金集"
    )
    assert available is False


@pytest.mark.anyio
async def test_update_dataset_stores_pa_overlay_and_merges_reads() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    provider = FakeProjectClients(client)
    adapter_cls = getattr(datasets_adapter, "LangfuseDatasetsAdapter")
    adapter = adapter_cls(provider)

    updated = await adapter.update_dataset(
        "project-1",
        "dataset-1",
        "user-1",
        {"name": "客服黄金集-改", "description": "PA desc", "type": "badcase"},
    )

    assert updated["name"] == "客服黄金集-改"
    assert updated["description"] == "PA desc"
    assert updated["type"] == "badcase"
    assert updated["metadata"]["type"] == "badcase"
    overlay = await provider.get_resource_extension(
        project_id="project-1",
        resource_type="DATASET",
        resource_id="dataset-1",
        extension_type="RESOURCE_DISPLAY_OVERRIDE",
    )
    assert overlay is not None
    assert overlay["payload"]["name"] == "客服黄金集-改"

    listed = await adapter.list_datasets("project-1", "user-1")
    assert listed["datas"][0]["name"] == "客服黄金集-改"

    item = await adapter.create_dataset_item(
        "project-1",
        "user-1",
        "dataset-1",
        {"input": {"q": "1"}, "expectedOutput": {"a": "2"}},
    )
    assert item["datasetId"] == "dataset-1"
    upsert_call = [c for c in client.calls if c[0] == "upsert_dataset_item"][-1]
    assert upsert_call[1]["datasetName"] == "客服黄金集"


@pytest.mark.anyio
async def test_delete_dataset_stores_pa_soft_delete_and_hides_reads() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    provider = FakeProjectClients(client)
    adapter_cls = getattr(datasets_adapter, "LangfuseDatasetsAdapter")
    adapter = adapter_cls(provider)

    await adapter.delete_dataset("project-1", "dataset-1", "user-1")

    deleted = await provider.get_resource_extension(
        project_id="project-1",
        resource_type="DATASET",
        resource_id="dataset-1",
        extension_type="RESOURCE_SOFT_DELETE",
    )
    assert deleted is not None
    assert deleted["payload"] == {"deleted": True}

    listed = await adapter.list_datasets("project-1", "user-1")
    assert [item["id"] for item in listed["datas"]] == ["dataset-2"]
    with pytest.raises(Exception) as exc:
        await adapter.get_dataset("project-1", "user-1", "dataset-1")
    assert getattr(exc.value, "status_code", None) == 404


@pytest.mark.anyio
async def test_list_dataset_items_maps_public_payload_to_pa_contract() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    result = await adapter.list_dataset_items(
        "project-1",
        "user-1",
        "dataset-1",
        page=1,
        page_size=10,
    )

    assert result["total"] == 2
    item = result["datas"][0]
    assert item["id"] == "item-1"
    assert item["datasetId"] == "dataset-1"
    assert item["projectId"] == "project-1"
    assert item["status"] == "ACTIVE"
    assert item["sourceTraceId"] == "trace-1"
    assert item["sourceObservationId"] == ""
    assert ("list_dataset_items", "客服黄金集", 1, 100) in client.calls


@pytest.mark.anyio
async def test_list_dataset_items_filters_by_status_and_keyword() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    result = await adapter.list_dataset_items(
        "project-1",
        "user-1",
        "dataset-1",
        page=1,
        page_size=10,
        keyword="退款",
        status=["ACTIVE"],
    )

    assert result["total"] == 1
    assert result["datas"][0]["id"] == "item-1"


@pytest.mark.anyio
async def test_create_dataset_item_upserts_with_dataset_name() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    item = await adapter.create_dataset_item(
        "project-1",
        "user-1",
        "dataset-1",
        {
            "input": {"question": "新问题"},
            "expectedOutput": {"answer": "新答案"},
            "metadata": {},
            "status": "ACTIVE",
            "sourceTraceId": "trace-9",
            "sourceObservationId": "obs-9",
        },
    )

    assert item["datasetId"] == "dataset-1"
    upsert_call = [c for c in client.calls if c[0] == "upsert_dataset_item"][0]
    assert upsert_call[1]["datasetName"] == "客服黄金集"
    assert upsert_call[1]["sourceTraceId"] == "trace-9"


@pytest.mark.anyio
async def test_update_dataset_item_reuses_same_item_id_upsert() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    item = await adapter.update_dataset_item(
        "project-1",
        "user-1",
        "dataset-1",
        "item-1",
        {
            "input": {"question": "改后"},
            "expectedOutput": {"answer": "答案"},
            "metadata": {},
            "status": "ACTIVE",
            "sourceTraceId": "",
            "sourceObservationId": "",
        },
    )

    assert item["id"] == "item-1"
    upsert_call = [c for c in client.calls if c[0] == "upsert_dataset_item"][0]
    assert upsert_call[1]["id"] == "item-1"


@pytest.mark.anyio
async def test_archive_dataset_item_upserts_with_archived_status() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    item = await adapter.archive_dataset_item(
        "project-1", "user-1", "dataset-1", "item-1"
    )

    assert item["status"] == "ARCHIVED"
    upsert_call = [c for c in client.calls if c[0] == "upsert_dataset_item"][0]
    assert upsert_call[1]["id"] == "item-1"
    assert upsert_call[1]["status"] == "ARCHIVED"


@pytest.mark.anyio
async def test_delete_dataset_item_routes_to_public_delete() -> None:
    client = FakePublicClient()
    adapter = _adapter(client)

    await adapter.delete_dataset_item(
        "project-1", "user-1", "dataset-1", "item-1"
    )

    assert "item-1" in client.deleted_items


@pytest.mark.anyio
async def test_get_dataset_metrics_aggregates_status_counts() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    metrics = await adapter.get_dataset_metrics(
        "project-1", "user-1", "dataset-1"
    )

    assert metrics["total"] == 2
    assert metrics["active"] == 1
    assert metrics["archived"] == 1
    assert metrics["updatedAt"] == "2026-07-24T02:00:00.000Z"


@pytest.mark.anyio
async def test_count_dataset_item_statuses_supports_keyword_filter() -> None:
    client = FakePublicClient()
    _seed_datasets(client)
    adapter = _adapter(client)

    counts = await adapter.count_dataset_item_statuses(
        "project-1", "user-1", "dataset-1", keyword="退款"
    )

    assert counts == {"total": 1, "active": 1, "archived": 0}
