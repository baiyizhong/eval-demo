"""Contract tests for the Langfuse Public API score-configs adapter.

The score-configs sub-domain of Task 4 covers list/get/create/update plus
archive/restore (via PATCH isArchived). These behaviours route exclusively
through ``LangfusePublicClient``; no direct SQL access is used.
"""

from importlib.util import find_spec

import pytest

from app.errors import BusinessError, LangfuseUpstreamError
from app.langfuse import annotations_adapter


def test_langfuse_annotations_adapter_module_exists() -> None:
    assert find_spec("app.langfuse.annotations_adapter") is not None


class FakePublicClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.score_configs: list[dict] = []
        self.created: dict | None = None
        self.updated: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def list_score_configs(self, *, page: int = 1, limit: int = 50) -> dict:
        self.calls.append(("list_score_configs", page, limit))
        start = (page - 1) * limit
        page_items = self.score_configs[start : start + limit]
        return {
            "data": page_items,
            "meta": {
                "page": page,
                "limit": limit,
                "totalItems": len(self.score_configs),
                "totalPages": max(1, (len(self.score_configs) + limit - 1) // limit),
            },
        }

    async def list_all_score_configs(self) -> list:
        self.calls.append(("list_all_score_configs",))
        return list(self.score_configs)

    async def create_score_config(self, payload: dict) -> dict:
        self.calls.append(("create_score_config", payload))
        self.created = {
            "id": "config-new",
            "projectId": "project-1",
            "name": payload["name"],
            "dataType": payload["dataType"],
            "description": payload.get("description") or "",
            "minValue": payload.get("minValue"),
            "maxValue": payload.get("maxValue"),
            "categories": payload.get("categories") or [],
            "isArchived": False,
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        }
        self.score_configs.append(self.created)
        return self.created

    async def get_score_config(self, config_id: str) -> dict:
        self.calls.append(("get_score_config", config_id))
        for cfg in self.score_configs:
            if cfg["id"] == config_id:
                return cfg
        raise AssertionError(f"unexpected config id: {config_id}")

    async def update_score_config(self, config_id: str, payload: dict) -> dict:
        self.calls.append(("update_score_config", config_id, payload))
        for cfg in self.score_configs:
            if cfg["id"] == config_id:
                cfg.update({k: v for k, v in payload.items() if v is not None})
                cfg["updatedAt"] = "2026-07-24T02:00:00.000Z"
                self.updated.append(payload)
                return cfg
        raise AssertionError(f"unexpected config id: {config_id}")


class FakeProjectClients:
    def __init__(self, client: FakePublicClient) -> None:
        self.client = client

    async def project_public_client_for_user(self, project_id: str, user_id: str):
        return self.client


def _adapter(client: FakePublicClient):
    cls = getattr(annotations_adapter, "LangfuseAnnotationsAdapter")
    return cls(FakeProjectClients(client))


def _seed_configs(client: FakePublicClient) -> None:
    client.score_configs = [
        {
            "id": "config-1",
            "projectId": "project-1",
            "name": "质量分",
            "dataType": "NUMERIC",
            "description": "质量评分",
            "minValue": 0,
            "maxValue": 1,
            "categories": [],
            "isArchived": False,
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        },
        {
            "id": "config-2",
            "projectId": "project-1",
            "name": "准确性",
            "dataType": "CATEGORICAL",
            "description": "",
            "minValue": None,
            "maxValue": None,
            "categories": [
                {"label": "正确", "value": "correct"},
                {"label": "错误", "value": "incorrect"},
            ],
            "isArchived": True,
            "createdAt": "2026-07-24T01:30:00.000Z",
            "updatedAt": "2026-07-24T01:30:00.000Z",
        },
    ]


@pytest.mark.anyio
async def test_list_score_configs_maps_public_payload() -> None:
    client = FakePublicClient()
    _seed_configs(client)
    adapter = _adapter(client)

    result = await adapter.list_score_configs(
        "project-1", "user-1", include_archived=True
    )

    assert result["total"] == 2
    cfg = result["datas"][0]
    assert cfg["id"] == "config-1"
    assert cfg["dataType"] == "NUMERIC"
    assert cfg["minValue"] == 0
    assert cfg["maxValue"] == 1
    assert cfg["archived"] is False
    assert cfg["projectId"] == "project-1"


@pytest.mark.anyio
async def test_list_score_configs_excludes_archived_by_default() -> None:
    client = FakePublicClient()
    _seed_configs(client)
    adapter = _adapter(client)

    result = await adapter.list_score_configs("project-1", "user-1")

    assert result["total"] == 1
    assert result["datas"][0]["id"] == "config-1"


@pytest.mark.anyio
async def test_list_score_configs_keyword_filter() -> None:
    client = FakePublicClient()
    _seed_configs(client)
    adapter = _adapter(client)

    result = await adapter.list_score_configs(
        "project-1", "user-1", include_archived=True, keyword="质量"
    )

    assert result["total"] == 1
    assert result["datas"][0]["name"] == "质量分"


@pytest.mark.anyio
async def test_create_score_config_routes_to_public_api() -> None:
    client = FakePublicClient()
    adapter = _adapter(client)

    config = await adapter.create_score_config(
        "project-1",
        "user-1",
        {
            "name": "新指标",
            "dataType": "NUMERIC",
            "description": "desc",
            "minValue": 0,
            "maxValue": 10,
            "categories": [],
        },
    )

    assert config["name"] == "新指标"
    assert client.created is not None
    create_call = [c for c in client.calls if c[0] == "create_score_config"][0]
    assert "categories" not in create_call[1]


@pytest.mark.anyio
async def test_update_score_config_routes_to_public_patch() -> None:
    client = FakePublicClient()
    _seed_configs(client)
    adapter = _adapter(client)

    config = await adapter.update_score_config(
        "project-1",
        "user-1",
        "config-1",
        {
            "name": "质量分-改",
            "dataType": "NUMERIC",
            "description": "updated",
            "minValue": 0,
            "maxValue": 1,
            "categories": [],
        },
    )

    assert config["name"] == "质量分-改"
    update_call = [c for c in client.calls if c[0] == "update_score_config"][0]
    assert update_call[1] == "config-1"
    assert update_call[2]["name"] == "质量分-改"
    assert "categories" not in update_call[2]


@pytest.mark.anyio
async def test_archive_score_config_uses_patch_is_archived() -> None:
    client = FakePublicClient()
    _seed_configs(client)
    adapter = _adapter(client)

    config = await adapter.set_score_config_archived(
        "project-1", "user-1", "config-1", True
    )

    assert config["archived"] is True
    update_call = [c for c in client.calls if c[0] == "update_score_config"][0]
    assert update_call[2] == {"isArchived": True}


@pytest.mark.anyio
async def test_restore_score_config_uses_patch_is_archived_false() -> None:
    client = FakePublicClient()
    _seed_configs(client)
    adapter = _adapter(client)

    config = await adapter.set_score_config_archived(
        "project-1", "user-1", "config-2", False
    )

    assert config["archived"] is False
    update_call = [c for c in client.calls if c[0] == "update_score_config"][0]
    assert update_call[2] == {"isArchived": False}


@pytest.mark.anyio
async def test_ensure_default_score_config_is_idempotent() -> None:
    client = FakePublicClient()
    _seed_configs(client)
    adapter = _adapter(client)

    # When a NUMERIC config already exists it should be returned, not created.
    config = await adapter.ensure_default_score_config("project-1", "user-1")
    assert config["dataType"] == "NUMERIC"
    # No create call should have been made.
    assert not any(c[0] == "create_score_config" for c in client.calls)


@pytest.mark.anyio
async def test_ensure_default_score_config_creates_when_missing() -> None:
    client = FakePublicClient()
    adapter = _adapter(client)

    config = await adapter.ensure_default_score_config("project-1", "user-1")
    assert config["dataType"] == "NUMERIC"
    assert any(c[0] == "create_score_config" for c in client.calls)


# ---------------------------------------------------------------------------
# Annotation queue sub-domain contract tests
# ---------------------------------------------------------------------------


class _QueueFakePublicClient:
    """Public API client backing the annotation-queue route tests."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.queues: list[dict] = []
        self.queue_items: dict[str, list[dict]] = {}
        self.assignments: dict[str, list[dict]] = {}
        self.assignment_reads_supported = True
        self.score_configs: list[dict] = []
        self.created_queue: dict | None = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def list_all_annotation_queues(self) -> list:
        self.calls.append(("list_all_annotation_queues",))
        return list(self.queues)

    async def get_annotation_queue(self, queue_id: str) -> dict:
        self.calls.append(("get_annotation_queue", queue_id))
        for queue in self.queues:
            if queue["id"] == queue_id:
                return queue
        raise AssertionError(f"unexpected queue id: {queue_id}")

    async def create_annotation_queue(self, payload: dict) -> dict:
        self.calls.append(("create_annotation_queue", payload))
        self.created_queue = {
            "id": "queue-new",
            "name": payload["name"],
            "description": payload.get("description") or "",
            "scoreConfigIds": payload.get("scoreConfigIds") or [],
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        }
        self.queues.append(self.created_queue)
        return self.created_queue

    async def list_all_annotation_queue_items(
        self, queue_id: str, *, status=None
    ) -> list:
        self.calls.append(("list_all_annotation_queue_items", queue_id, status))
        return list(self.queue_items.get(queue_id, []))

    async def list_all_annotation_queue_assignments(self, queue_id: str) -> list:
        self.calls.append(("list_all_annotation_queue_assignments", queue_id))
        if not self.assignment_reads_supported:
            raise LangfuseUpstreamError("Langfuse 服务请求失败")
        return list(self.assignments.get(queue_id, []))

    async def list_all_score_configs(self) -> list:
        self.calls.append(("list_all_score_configs",))
        return list(self.score_configs)


def _seed_queue_client(client: _QueueFakePublicClient) -> None:
    client.queues = [
        {
            "id": "queue-1",
            "name": "客服标注队列",
            "description": "desc",
            "scoreConfigIds": ["config-1"],
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T02:00:00.000Z",
        }
    ]
    client.queue_items = {
        "queue-1": [
            {
                "id": "item-1",
                "queueId": "queue-1",
                "objectId": "trace-1",
                "objectType": "TRACE",
                "status": "OPEN",
                "completedAt": None,
                "createdAt": "2026-07-24T01:00:00.000Z",
                "updatedAt": "2026-07-24T01:00:00.000Z",
            },
            {
                "id": "item-2",
                "queueId": "queue-1",
                "objectId": "trace-2",
                "objectType": "TRACE",
                "status": "COMPLETED",
                "completedAt": "2026-07-24T01:30:00.000Z",
                "createdAt": "2026-07-24T01:00:00.000Z",
                "updatedAt": "2026-07-24T01:30:00.000Z",
            },
        ]
    }
    client.assignments = {
        "queue-1": [
            {"userId": "user-2", "projectId": "project-1", "queueId": "queue-1"},
        ]
    }
    client.score_configs = [
        {
            "id": "config-1",
            "projectId": "project-1",
            "name": "质量分",
            "dataType": "NUMERIC",
            "description": "",
            "minValue": 0,
            "maxValue": 1,
            "categories": [],
            "isArchived": False,
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        }
    ]


def _queue_adapter(client: _QueueFakePublicClient):
    cls = getattr(annotations_adapter, "LangfuseAnnotationsAdapter")

    class _Provider:
        def __init__(self) -> None:
            self.resource_extensions: dict[tuple[str, str, str, str], dict] = {}

        async def project_public_client_for_user(self, project_id, user_id):
            return client

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

    provider = _Provider()
    return cls(provider), provider


@pytest.mark.anyio
async def test_list_annotation_queues_aggregates_counts_and_assignees() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    adapter, _provider = _queue_adapter(client)

    result = await adapter.list_annotation_queues("project-1", "user-1")

    total = result["total"]
    assert total >= 1
    queue = result["datas"][0]
    assert queue["id"] == "queue-1"
    assert queue["name"] == "客服标注队列"
    assert queue["pendingCount"] == 1
    assert queue["completedCount"] == 1
    assert queue["assigneeIds"] == ["user-2"]


@pytest.mark.anyio
async def test_list_annotation_queues_keyword_filter() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    adapter, _provider = _queue_adapter(client)

    result = await adapter.list_annotation_queues(
        "project-1", "user-1", keyword="不存在"
    )
    assert result["total"] == 0


@pytest.mark.anyio
async def test_get_annotation_queue_returns_full_payload() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    adapter, _provider = _queue_adapter(client)

    queue = await adapter.get_annotation_queue("project-1", "user-1", "queue-1")

    assert queue["id"] == "queue-1"
    assert queue["scoreConfigIds"] == ["config-1"]
    assert queue["scoreConfigs"][0]["name"] == "质量分"
    assert queue["pendingCount"] == 1
    assert queue["completedCount"] == 1
    assert queue["assignees"][0]["id"] == "user-2"


@pytest.mark.anyio
async def test_create_annotation_queue_routes_to_public_api() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    adapter, _provider = _queue_adapter(client)

    queue = await adapter.create_annotation_queue(
        "project-1",
        "user-1",
        {
            "name": "新队列",
            "description": "desc",
            "scoreConfigIds": ["config-1"],
            "assigneeIds": [],
        },
    )

    assert queue["name"] == "新队列"
    create_call = [c for c in client.calls if c[0] == "create_annotation_queue"][0]
    assert create_call[1]["name"] == "新队列"
    assert create_call[1]["scoreConfigIds"] == ["config-1"]


@pytest.mark.anyio
async def test_create_annotation_queue_tolerates_unsupported_assignment_reads() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    client.assignment_reads_supported = False
    adapter, _provider = _queue_adapter(client)

    queue = await adapter.create_annotation_queue(
        "project-1",
        "user-1",
        {
            "name": "无需读取分配人的新队列",
            "description": "desc",
            "scoreConfigIds": ["config-1"],
            "assigneeIds": [],
        },
    )

    assert queue["name"] == "无需读取分配人的新队列"
    assert queue["assigneeIds"] == []
    assert any(c[0] == "create_annotation_queue" for c in client.calls)


@pytest.mark.anyio
async def test_is_annotation_queue_name_available() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    adapter, _provider = _queue_adapter(client)

    taken = await adapter.is_annotation_queue_name_available(
        "project-1", "user-1", "客服标注队列"
    )
    free = await adapter.is_annotation_queue_name_available(
        "project-1", "user-1", "全新队列"
    )
    assert taken is False
    assert free is True


@pytest.mark.anyio
async def test_get_annotation_queue_metrics() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    adapter, _provider = _queue_adapter(client)

    metrics = await adapter.get_annotation_queue_metrics(
        "project-1", "user-1", "queue-1"
    )
    assert metrics["total"] == 2
    assert metrics["pendingCount"] == 1
    assert metrics["completedCount"] == 1


@pytest.mark.anyio
async def test_update_annotation_queue_stores_pa_overlay_and_merges_reads() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    adapter, provider = _queue_adapter(client)

    updated = await adapter.update_annotation_queue(
        "project-1",
        "queue-1",
        "user-1",
        {"name": "客服标注队列-改", "description": "PA desc"},
    )

    assert updated["name"] == "客服标注队列-改"
    assert updated["description"] == "PA desc"
    overlay = await provider.get_resource_extension(
        project_id="project-1",
        resource_type="ANNOTATION_QUEUE",
        resource_id="queue-1",
        extension_type="RESOURCE_DISPLAY_OVERRIDE",
    )
    assert overlay is not None
    assert overlay["payload"]["name"] == "客服标注队列-改"

    listed = await adapter.list_annotation_queues("project-1", "user-1")
    assert listed["datas"][0]["name"] == "客服标注队列-改"


@pytest.mark.anyio
async def test_delete_annotation_queue_stores_pa_soft_delete_and_hides_reads() -> None:
    client = _QueueFakePublicClient()
    _seed_queue_client(client)
    adapter, provider = _queue_adapter(client)

    await adapter.delete_annotation_queue("project-1", "queue-1", "user-1")

    deleted = await provider.get_resource_extension(
        project_id="project-1",
        resource_type="ANNOTATION_QUEUE",
        resource_id="queue-1",
        extension_type="RESOURCE_SOFT_DELETE",
    )
    assert deleted is not None
    assert deleted["payload"] == {"deleted": True}

    listed = await adapter.list_annotation_queues("project-1", "user-1")
    assert listed["total"] == 0
    with pytest.raises(BusinessError) as exc:
        await adapter.get_annotation_queue("project-1", "user-1", "queue-1")
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# Annotation queue item sub-domain contract tests
# ---------------------------------------------------------------------------


class _ItemFakePublicClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.created_items: list[dict] = []
        self.deleted_items: list[tuple] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def create_annotation_queue_item(self, queue_id: str, payload: dict) -> dict:
        self.calls.append(("create_annotation_queue_item", queue_id, payload))
        item = {
            "id": f"item-{len(self.created_items) + 1}",
            "queueId": queue_id,
            "objectId": payload.get("objectId", ""),
            "objectType": payload.get("objectType", "TRACE"),
            "status": "OPEN",
            "completedAt": None,
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        }
        self.created_items.append(item)
        return item

    async def delete_annotation_queue_item(self, queue_id: str, item_id: str) -> dict:
        self.calls.append(("delete_annotation_queue_item", queue_id, item_id))
        self.deleted_items.append((queue_id, item_id))
        return {"success": True}


def _item_adapter(client: _ItemFakePublicClient):
    cls = getattr(annotations_adapter, "LangfuseAnnotationsAdapter")

    class _Provider:
        async def project_public_client_for_user(self, project_id, user_id):
            return client

    return cls(_Provider())


@pytest.mark.anyio
async def test_create_annotation_queue_item_routes_to_public_api() -> None:
    client = _ItemFakePublicClient()
    adapter = _item_adapter(client)

    item = await adapter.create_annotation_queue_item(
        "project-1",
        "user-1",
        "queue-1",
        {"objectId": "trace-1", "objectType": "TRACE"},
    )

    assert item["objectId"] == "trace-1"
    assert item["queueId"] == "queue-1"
    assert item["projectId"] == "project-1"
    call = client.calls[0]
    assert call[0] == "create_annotation_queue_item"
    assert call[1] == "queue-1"


@pytest.mark.anyio
async def test_delete_annotation_queue_items_routes_to_public_api() -> None:
    client = _ItemFakePublicClient()
    adapter = _item_adapter(client)

    deleted = await adapter.delete_annotation_queue_items(
        "project-1", "user-1", "queue-1", ["item-1", "item-2"]
    )

    assert deleted == ["item-1", "item-2"]
    assert client.deleted_items == [
        ("queue-1", "item-1"),
        ("queue-1", "item-2"),
    ]


# ---------------------------------------------------------------------------
# Annotation item → dataset sub-domain contract tests
# ---------------------------------------------------------------------------


class _ItemToDatasetFakePublicClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.queues = [
            {
                "id": "queue-1",
                "name": "标注队列",
                "description": "",
                "scoreConfigIds": [],
            }
        ]
        self.queue_items = {
            "queue-1": [
                {
                    "id": "item-1",
                    "queueId": "queue-1",
                    "objectId": "trace-1",
                    "objectType": "TRACE",
                    "status": "OPEN",
                    "completedAt": None,
                    "createdAt": "2026-07-24T01:00:00.000Z",
                    "updatedAt": "2026-07-24T01:00:00.000Z",
                }
            ]
        }
        self.datasets = [
            {"id": "dataset-1", "name": "黄金集", "projectId": "project-1"}
        ]
        self.upserted_dataset_items: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def get_annotation_queue_item(self, queue_id: str, item_id: str) -> dict:
        self.calls.append(("get_annotation_queue_item", queue_id, item_id))
        for item in self.queue_items.get(queue_id, []):
            if item["id"] == item_id:
                return item
        raise AssertionError(f"unexpected item: {item_id}")

    async def list_all_annotation_queues(self) -> list:
        self.calls.append(("list_all_annotation_queues",))
        return list(self.queues)

    async def list_all_score_configs(self) -> list:
        return []

    async def list_all_annotation_queue_items(
        self, queue_id: str, *, status=None
    ) -> list:
        return []

    async def list_all_annotation_queue_assignments(self, queue_id: str) -> list:
        return []

    async def list_datasets(self, *, page: int = 1, limit: int = 50) -> dict:
        self.calls.append(("list_datasets", page, limit))
        start = (page - 1) * limit
        return {
            "data": self.datasets[start : start + limit],
            "meta": {
                "page": page,
                "limit": limit,
                "totalItems": len(self.datasets),
                "totalPages": 1,
            },
        }

    async def upsert_dataset_item(self, payload: dict) -> dict:
        self.calls.append(("upsert_dataset_item", payload))
        item = {
            "id": "dataset-item-new",
            "datasetName": payload.get("datasetName", ""),
            "datasetId": payload.get("datasetId", ""),
            "status": "ACTIVE",
            "input": payload.get("input"),
            "expectedOutput": payload.get("expectedOutput"),
            "metadata": payload.get("metadata") or {},
            "sourceTraceId": payload.get("sourceTraceId"),
            "sourceObservationId": payload.get("sourceObservationId"),
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        }
        self.upserted_dataset_items.append(item)
        return item


def _dataset_link_adapter(client: _ItemToDatasetFakePublicClient):
    cls = getattr(annotations_adapter, "LangfuseAnnotationsAdapter")

    class _Provider:
        async def project_public_client_for_user(self, project_id, user_id):
            return client

    return cls(_Provider())


@pytest.mark.anyio
async def test_add_annotation_item_to_dataset_creates_dataset_item_via_public_api() -> (
    None
):
    client = _ItemToDatasetFakePublicClient()
    adapter = _dataset_link_adapter(client)

    result = await adapter.add_annotation_item_to_dataset(
        "project-1",
        "user-1",
        "queue-1",
        "item-1",
        {
            "datasetId": "dataset-1",
            "input": {"question": "退款"},
            "expectedOutput": {"answer": "查看订单"},
            "metadata": {"batch": "a"},
        },
    )

    assert result["datasetName"] == "黄金集"
    assert result["datasetId"] == "dataset-1"
    upsert_call = [c for c in client.calls if c[0] == "upsert_dataset_item"][0]
    assert upsert_call[1]["datasetName"] == "黄金集"
    assert upsert_call[1]["sourceTraceId"] == "trace-1"


# ---------------------------------------------------------------------------
# Traces → dataset batch add contract tests
# ---------------------------------------------------------------------------


class _TraceDatasetFakePublicClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.datasets = [
            {"id": "dataset-1", "name": "黄金集", "projectId": "project-1"}
        ]
        self.upserted: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def list_datasets(self, *, page: int = 1, limit: int = 50) -> dict:
        self.calls.append(("list_datasets", page, limit))
        start = (page - 1) * limit
        return {
            "data": self.datasets[start : start + limit],
            "meta": {
                "page": page,
                "limit": limit,
                "totalItems": len(self.datasets),
                "totalPages": 1,
            },
        }

    async def upsert_dataset_item(self, payload: dict) -> dict:
        self.calls.append(("upsert_dataset_item", payload))
        result = {
            "id": f"item-{len(self.upserted) + 1}",
            "datasetName": payload.get("datasetName", ""),
            "datasetId": payload.get("datasetId", ""),
            "status": "ACTIVE",
            "input": payload.get("input"),
            "expectedOutput": payload.get("expectedOutput"),
            "metadata": payload.get("metadata") or {},
            "sourceTraceId": payload.get("sourceTraceId"),
            "sourceObservationId": None,
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        }
        self.upserted.append(result)
        return result


def _trace_dataset_adapter(client: _TraceDatasetFakePublicClient):
    cls = getattr(annotations_adapter, "LangfuseAnnotationsAdapter")

    class _Provider:
        async def project_public_client_for_user(self, project_id, user_id):
            return client

    return cls(_Provider())


@pytest.mark.anyio
async def test_add_traces_to_dataset_upserts_each_trace_as_dataset_item() -> None:
    client = _TraceDatasetFakePublicClient()
    adapter = _trace_dataset_adapter(client)

    result = await adapter.add_traces_to_dataset(
        "project-1",
        "user-1",
        {
            "datasetId": "dataset-1",
            "traces": [
                {
                    "traceId": "trace-1",
                    "input": {"q": "1"},
                    "output": {"a": "1"},
                    "metadata": {},
                },
                {
                    "traceId": "trace-2",
                    "input": {"q": "2"},
                    "output": {"a": "2"},
                    "metadata": {},
                },
            ],
        },
    )

    assert result["successCount"] == 2
    assert result["failureCount"] == 0
    assert len(client.upserted) == 2
    assert client.upserted[0]["datasetName"] == "黄金集"
    assert client.upserted[0]["sourceTraceId"] == "trace-1"


@pytest.mark.anyio
async def test_add_traces_to_dataset_reports_missing_dataset_as_error() -> None:
    client = _TraceDatasetFakePublicClient()
    adapter = _trace_dataset_adapter(client)

    with pytest.raises(BusinessError):
        await adapter.add_traces_to_dataset(
            "project-1",
            "user-1",
            {"datasetId": "missing", "traces": []},
        )


# ---------------------------------------------------------------------------
# Complete annotation queue item contract tests
# ---------------------------------------------------------------------------


class _CompleteItemFakePublicClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.updated_items: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def update_annotation_queue_item(
        self, queue_id: str, item_id: str, payload: dict
    ) -> dict:
        self.calls.append(("update_annotation_queue_item", queue_id, item_id, payload))
        item = {
            "id": item_id,
            "queueId": queue_id,
            "objectId": "trace-1",
            "objectType": "TRACE",
            "status": payload.get("status", "COMPLETED"),
            "completedAt": "2026-07-24T02:00:00.000Z",
            "createdAt": "2026-07-24T01:00:00.000Z",
            "updatedAt": "2026-07-24T02:00:00.000Z",
        }
        self.updated_items.append(item)
        return item


def _complete_adapter(client: _CompleteItemFakePublicClient):
    cls = getattr(annotations_adapter, "LangfuseAnnotationsAdapter")

    class _Provider:
        async def project_public_client_for_user(self, project_id, user_id):
            return client

    return cls(_Provider())


@pytest.mark.anyio
async def test_complete_annotation_queue_item_patches_status_to_completed() -> None:
    client = _CompleteItemFakePublicClient()
    adapter = _complete_adapter(client)

    result = await adapter.complete_annotation_queue_item(
        "project-1", "user-1", "queue-1", "item-1"
    )

    assert result["status"] == "COMPLETED"
    call = client.calls[0]
    assert call[0] == "update_annotation_queue_item"
    assert call[1] == "queue-1"
    assert call[2] == "item-1"
    assert call[3] == {"status": "COMPLETED"}
