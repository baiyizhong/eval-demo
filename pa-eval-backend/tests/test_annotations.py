from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.errors import BusinessError
from app.langfuse_clickhouse import get_langfuse_clickhouse_reader
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeAnnotationDatabaseReader:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    async def list_annotation_queues_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> list[dict]:
        self.calls.append(("list_queues", (project_id, user_id)))
        return [
            {
                "id": "queue-1",
                "projectId": project_id,
                "name": "客服质量人工标注",
                "description": "覆盖差评和慢响应 trace",
                "scoreConfigIds": ["score-1"],
                "assigneeIds": ["user-1"],
                "completedCount": 1,
                "pendingCount": 2,
                "scoreConfigs": [
                    {
                        "id": "score-1",
                        "projectId": project_id,
                        "name": "准确性",
                        "dataType": "NUMERIC",
                        "description": "",
                        "minValue": 1,
                        "maxValue": 5,
                        "categories": [],
                        "archived": False,
                    }
                ],
                "assignees": [
                    {"id": "user-1", "name": "Octocat", "email": "octocat@example.com"}
                ],
                "createdAt": "2026-07-06T01:00:00.000Z",
                "updatedAt": "2026-07-06T02:00:00.000Z",
            }
        ]

    async def create_annotation_queue_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("create_queue", (project_id, user_id, payload)))
        return {
            "id": "queue-created",
            "projectId": project_id,
            "name": payload["name"],
            "description": payload["description"],
            "scoreConfigIds": payload["scoreConfigIds"],
            "assigneeIds": payload["assigneeIds"],
            "completedCount": 0,
            "pendingCount": 0,
            "scoreConfigs": [],
            "assignees": [],
            "createdAt": "2026-07-06T01:00:00.000Z",
            "updatedAt": "2026-07-06T01:00:00.000Z",
        }

    async def create_trace_annotation_task_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("create_trace_task", (project_id, user_id, payload)))
        return {"queueId": "queue-1", "createdCount": 2, "skippedCount": 1}

    async def ensure_default_score_config_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> dict:
        self.calls.append(("ensure_default_score_config", (project_id, user_id)))
        return {
            "id": "score-default",
            "projectId": project_id,
            "name": "人工质量评分",
            "dataType": "NUMERIC",
            "description": "Trace 人工标注默认评分指标",
            "minValue": 1,
            "maxValue": 5,
            "categories": [],
            "archived": False,
        }

    async def create_score_config_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("create_score_config", (project_id, user_id, payload)))
        return {
            "id": "score-created",
            "projectId": project_id,
            "name": payload["name"],
            "dataType": payload["dataType"],
            "description": payload["description"],
            "minValue": payload["minValue"],
            "maxValue": payload["maxValue"],
            "categories": payload["categories"],
            "archived": False,
        }

    async def update_score_config_for_user(
        self,
        project_id: str,
        config_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("update_score_config", (project_id, config_id, user_id, payload)))
        return {
            "id": config_id,
            "projectId": project_id,
            "name": payload["name"],
            "dataType": payload["dataType"],
            "description": payload["description"],
            "minValue": payload["minValue"],
            "maxValue": payload["maxValue"],
            "categories": payload["categories"],
            "archived": False,
        }

    async def set_score_config_archived_for_user(
        self,
        project_id: str,
        config_id: str,
        user_id: str,
        archived: bool,
    ) -> dict:
        self.calls.append(
            ("set_score_config_archived", (project_id, config_id, user_id, archived))
        )
        return {
            "id": config_id,
            "projectId": project_id,
            "name": "准确性",
            "dataType": "NUMERIC",
            "description": "",
            "minValue": 1,
            "maxValue": 5,
            "categories": [],
            "archived": archived,
        }

    async def add_traces_to_dataset_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("add_traces_to_dataset", (project_id, user_id, payload)))
        return {
            "datasetId": payload["datasetId"],
            "successCount": len(payload["traces"]),
            "failureCount": 0,
            "itemIds": ["dataset-item-1"],
            "failures": [],
        }

    async def save_annotation_scores_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(
            ("save_scores", (project_id, queue_id, item_id, user_id, payload))
        )
        return {
            "id": item_id,
            "projectId": project_id,
            "queueId": queue_id,
            "objectId": "trace-1",
            "objectType": "TRACE",
            "status": "COMPLETED",
            "source": {
                "objectId": "trace-1",
                "objectType": "TRACE",
                "title": "trace-1",
                "input": {},
                "output": {},
                "metadata": {},
                "traceId": "trace-1",
                "observationId": "",
                "sessionId": "",
                "userId": "",
                "latencyMs": 0,
                "costUsd": 0,
                "createdAt": "2026-07-06T01:00:00.000Z",
            },
            "scores": [],
            "completedAt": "2026-07-06T02:00:00.000Z",
            "completedBy": {
                "id": "user-1",
                "name": "Octocat",
                "email": "octocat@example.com",
            },
            "createdAt": "2026-07-06T01:00:00.000Z",
            "updatedAt": "2026-07-06T02:00:00.000Z",
        }

    async def list_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> list[dict]:
        self.calls.append(("list_items", (project_id, queue_id, user_id)))
        return [
            {
                "id": "item-1",
                "projectId": project_id,
                "queueId": queue_id,
                "objectId": "trace-1",
                "objectType": "TRACE",
                "status": "PENDING",
                "source": {
                    "objectId": "trace-1",
                    "objectType": "TRACE",
                    "title": "trace-1",
                    "input": {},
                    "output": {},
                    "metadata": {},
                    "traceId": "trace-1",
                    "observationId": "",
                    "sessionId": "",
                    "userId": "",
                    "latencyMs": 0,
                    "costUsd": 0,
                    "createdAt": "2026-07-06T01:00:00.000Z",
                },
                "scores": [],
                "completedAt": "",
                "completedBy": None,
                "createdAt": "2026-07-06T01:00:00.000Z",
                "updatedAt": "2026-07-06T01:00:00.000Z",
            },
            {
                "id": "item-2",
                "projectId": project_id,
                "queueId": queue_id,
                "objectId": "trace-2",
                "objectType": "TRACE",
                "status": "PENDING",
                "source": {
                    "objectId": "trace-2",
                    "objectType": "TRACE",
                    "title": "trace-2",
                    "input": {"question": "如何修改发票抬头？"},
                    "output": {"answer": "进入订单详情修改"},
                    "metadata": {"environment": "production", "errorType": "billing"},
                    "traceId": "trace-2",
                    "observationId": "",
                    "sessionId": "session-2",
                    "userId": "user-2",
                    "latencyMs": 10,
                    "costUsd": 0,
                    "createdAt": "2026-07-06T01:10:00.000Z",
                },
                "scores": [],
                "completedAt": "",
                "completedBy": None,
                "createdAt": "2026-07-06T01:10:00.000Z",
                "updatedAt": "2026-07-06T01:10:00.000Z",
            },
            {
                "id": "item-done",
                "projectId": project_id,
                "queueId": queue_id,
                "objectId": "trace-done",
                "objectType": "TRACE",
                "status": "COMPLETED",
                "source": {
                    "objectId": "trace-done",
                    "objectType": "TRACE",
                    "title": "trace-done",
                    "input": {"question": "已完成样本"},
                    "output": {"answer": "已处理"},
                    "metadata": {"environment": "production"},
                    "traceId": "trace-done",
                    "observationId": "",
                    "sessionId": "session-done",
                    "userId": "user-done",
                    "latencyMs": 20,
                    "costUsd": 0,
                    "createdAt": "2026-07-06T01:20:00.000Z",
                },
                "scores": [],
                "completedAt": "2026-07-06T02:00:00.000Z",
                "completedBy": {
                    "id": "user-1",
                    "name": "Octocat",
                    "email": "octocat@example.com",
                },
                "createdAt": "2026-07-06T01:20:00.000Z",
                "updatedAt": "2026-07-06T02:00:00.000Z",
            },
        ]


class FakeAnnotationTraceReader:
    async def get_trace(self, project_id: str, trace_id: str) -> dict:
        return {
            "traceId": trace_id,
            "sessionId": "session-1",
            "projectId": project_id,
            "projectName": "",
            "environment": "default",
            "status": "success",
            "latency": 120,
            "createdAt": "2026-07-06T01:00:00.000Z",
            "updatedAt": "2026-07-06T01:00:01.000Z",
            "userId": "user-1",
            "businessId": "app-1",
            "tags": ["workflow"],
            "input": '{"question":"退款多久到账"}',
            "output": '{"answer":"通常 1-3 个工作日到账"}',
            "metadata": {"app_id": "app-1"},
            "callChain": [],
        }


def override_reader(fake_reader: FakeAnnotationDatabaseReader) -> None:
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_langfuse_clickhouse_reader] = (
        lambda: FakeAnnotationTraceReader()
    )
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="octocat@example.com",
        login="octocat",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_lists_project_annotation_queues_with_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues",
            params={"keyword": "客服", "page": 1, "pageSize": 10},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["total"] == 1
    assert body["data"]["datas"][0]["id"] == "queue-1"
    assert fake_reader.calls[0] == ("list_queues", ("project-1", "user-1"))


def test_creates_project_annotation_queue() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "name": "新增人工标注",
        "description": "人工复核",
        "scoreConfigIds": ["score-1"],
        "assigneeIds": ["user-1"],
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "queue-created"
    assert fake_reader.calls[0] == (
        "create_queue",
        ("project-1", "user-1", payload),
    )


def test_creates_trace_annotation_task_with_real_queue_items() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {"traceIds": ["trace-1", "trace-2", "trace-1"]}
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/annotation-task",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {
        "queueId": "queue-1",
        "createdCount": 2,
        "skippedCount": 1,
        "traceCount": 3,
    }
    assert fake_reader.calls[0] == (
        "create_trace_task",
        ("project-1", "user-1", payload),
    )


def test_creates_trace_annotation_task_in_existing_queue() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {"traceIds": ["trace-1"], "queueId": "queue-existing"}
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/annotation-task",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["queueId"] == "queue-1"
    assert fake_reader.calls[0] == (
        "create_trace_task",
        ("project-1", "user-1", payload),
    )


def test_ensures_default_score_config_for_manual_annotation_queue() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/score-configs/default",
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["id"] == "score-default"
    assert body["data"]["name"] == "人工质量评分"
    assert fake_reader.calls[0] == (
        "ensure_default_score_config",
        ("project-1", "user-1"),
    )


def test_creates_updates_and_archives_score_configs() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "name": "准确性",
        "dataType": "NUMERIC",
        "description": "答案是否准确",
        "minValue": 1,
        "maxValue": 5,
        "categories": [],
    }
    try:
        client = TestClient(app)
        create_response = client.post(
            "/api/projects/project-1/score-configs",
            json=payload,
        )
        update_response = client.patch(
            "/api/projects/project-1/score-configs/score-created",
            json={**payload, "description": "更新说明"},
        )
        archive_response = client.post(
            "/api/projects/project-1/score-configs/score-created/archive"
        )
        restore_response = client.post(
            "/api/projects/project-1/score-configs/score-created/restore"
        )
    finally:
        clear_overrides()

    assert create_response.status_code == 200
    assert update_response.status_code == 200
    assert archive_response.status_code == 200
    assert restore_response.status_code == 200
    assert fake_reader.calls == [
        ("create_score_config", ("project-1", "user-1", payload)),
        (
            "update_score_config",
            (
                "project-1",
                "score-created",
                "user-1",
                {**payload, "description": "更新说明"},
            ),
        ),
        ("set_score_config_archived", ("project-1", "score-created", "user-1", True)),
        ("set_score_config_archived", ("project-1", "score-created", "user-1", False)),
    ]


def test_score_config_payload_uses_langfuse_category_objects() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "name": "问题类型",
        "dataType": "CATEGORICAL",
        "description": "人工标注的问题分类",
        "minValue": None,
        "maxValue": None,
        "categories": [
            {"label": "工具调用错误", "value": 1},
            {"label": "答案事实错误", "value": 2},
        ],
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/score-configs",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.calls[0] == (
        "create_score_config",
        ("project-1", "user-1", payload),
    )


def test_boolean_score_config_forces_langfuse_boolean_categories() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/score-configs",
            json={
                "name": "是否合格",
                "dataType": "BOOLEAN",
                "description": "",
                "categories": [{"label": "自定义", "value": 99}],
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.calls[0][1][2]["categories"] == [
        {"label": "True", "value": 1},
        {"label": "False", "value": 0},
    ]


def test_rejects_invalid_categorical_score_config_categories() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/score-configs",
            json={
                "name": "问题类型",
                "dataType": "CATEGORICAL",
                "description": "",
                "categories": [
                    {"label": "重复", "value": 1},
                    {"label": "重复", "value": 2},
                ],
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 400
    assert response.json()["code"] != 0


def test_adds_selected_traces_to_dataset_with_trace_details() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {"datasetId": "dataset-1", "traceIds": ["trace-1"]}
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/dataset-items",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["successCount"] == 1
    assert fake_reader.calls[0][0] == "add_traces_to_dataset"
    assert fake_reader.calls[0][1][0:2] == ("project-1", "user-1")
    assert fake_reader.calls[0][1][2]["datasetId"] == "dataset-1"
    assert fake_reader.calls[0][1][2]["traces"][0]["traceId"] == "trace-1"
    assert fake_reader.calls[0][1][2]["traces"][0]["input"] == (
        '{"question":"退款多久到账"}'
    )


def test_saves_annotation_scores_and_completes_queue_item() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "scores": [
            {
                "configId": "score-1",
                "value": 4,
                "stringValue": "",
                "comment": "回答准确",
            }
        ]
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/items/item-1/scores",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "COMPLETED"
    assert fake_reader.calls[0] == (
        "save_scores",
        ("project-1", "queue-1", "item-1", "user-1", payload),
    )


def test_previews_annotation_batch_scope_without_overwriting_completed_items() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "filters": {
            "keyword": "trace",
            "status": ["PENDING", "COMPLETED"],
            "objectType": ["TRACE"],
        },
        "limit": 2,
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-preview",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["totalCount"] == 3
    assert body["pendingCount"] == 2
    assert body["completedCount"] == 1
    assert [item["id"] for item in body["samples"]] == ["item-1", "item-2"]
    assert "待标注 2 条" in body["filterSummary"]
    assert fake_reader.calls[0] == ("list_items", ("project-1", "queue-1", "user-1"))


def test_previews_annotation_batch_with_time_and_metadata_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-preview",
            json={
                "filters": {
                    "status": ["PENDING"],
                    "objectType": ["TRACE"],
                    "createdAtFrom": "2026-07-06T01:05:00.000Z",
                    "createdAtTo": "2026-07-06T01:15:00.000Z",
                    "metadataFilter": {
                        "key": "errorType",
                        "operator": "equals",
                        "value": "billing",
                    },
                },
                "limit": 5,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["totalCount"] == 1
    assert body["pendingCount"] == 1
    assert [item["id"] for item in body["samples"]] == ["item-2"]
    assert "Metadata：errorType equals" in body["filterSummary"]


def test_previews_annotation_batch_with_multiple_metadata_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-preview",
            json={
                "filters": {
                    "status": ["PENDING"],
                    "metadataFilters": [
                        {
                            "key": "environment",
                            "operator": "equals",
                            "value": "production",
                        },
                        {
                            "key": "errorType",
                            "operator": "exists",
                        },
                    ],
                },
                "limit": 5,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["totalCount"] == 1
    assert body["pendingCount"] == 1
    assert [item["id"] for item in body["samples"]] == ["item-2"]
    assert "Metadata：2 个条件" in body["filterSummary"]


def test_lists_annotation_items_with_multiple_metadata_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={
                "status": "PENDING",
                "metadataFilters": (
                    '[{"key":"environment","operator":"equals","value":"production"},'
                    '{"key":"errorType","operator":"exists"}]'
                ),
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["total"] == 1
    assert [item["id"] for item in body["datas"]] == ["item-2"]


def test_bulk_saves_annotation_scores_only_for_pending_filtered_items() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    scores = [
        {
            "configId": "score-1",
            "value": 2,
            "stringValue": "",
            "comment": "同类错误统一低分",
        }
    ]
    payload = {
        "filters": {
            "keyword": "trace",
            "status": ["PENDING", "COMPLETED"],
            "objectType": ["TRACE"],
        },
        "scores": scores,
        "expectedPendingCount": 2,
        "confirmLargeBatch": False,
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-scores",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["successCount"] == 2
    assert body["failureCount"] == 0
    assert body["skippedCount"] == 1
    assert body["successItemIds"] == ["item-1", "item-2"]
    assert body["failures"] == []
    assert fake_reader.calls == [
        ("list_items", ("project-1", "queue-1", "user-1")),
        ("save_scores", ("project-1", "queue-1", "item-1", "user-1", {"scores": scores})),
        ("save_scores", ("project-1", "queue-1", "item-2", "user-1", {"scores": scores})),
    ]


def test_normalizes_boolean_annotation_score_values() -> None:
    normalize = LangfuseDatabaseReader._normalize_score_value

    assert normalize("BOOLEAN", True, "") == (1.0, "true")
    assert normalize("BOOLEAN", 1, "") == (1.0, "true")
    assert normalize("BOOLEAN", "1", "") == (1.0, "true")
    assert normalize("BOOLEAN", "true", "") == (1.0, "true")
    assert normalize("BOOLEAN", "是", "") == (1.0, "true")

    assert normalize("BOOLEAN", False, "") == (0.0, "false")
    assert normalize("BOOLEAN", 0, "") == (0.0, "false")
    assert normalize("BOOLEAN", "0", "") == (0.0, "false")
    assert normalize("BOOLEAN", "false", "") == (0.0, "false")
    assert normalize("BOOLEAN", "否", "") == (0.0, "false")
    assert normalize("BOOLEAN", None, "") == (None, None)


def test_normalizes_categorical_annotation_score_with_langfuse_category() -> None:
    config = {
        "data_type": "CATEGORICAL",
        "categories": [
            {"label": "工具调用错误", "value": 1},
            {"label": "答案事实错误", "value": 2},
        ],
    }

    assert LangfuseDatabaseReader._normalize_score_value(
        config,
        2,
        "答案事实错误",
    ) == (2.0, "答案事实错误")
    assert LangfuseDatabaseReader._normalize_score_value(
        config,
        None,
        "工具调用错误",
    ) == (1.0, "工具调用错误")


def test_normalizes_text_annotation_score_value_like_langfuse() -> None:
    assert LangfuseDatabaseReader._normalize_score_value(
        {"data_type": "TEXT"},
        None,
        "需要复核引用来源",
    ) == (0.0, "需要复核引用来源")


def test_rejects_overlong_text_annotation_score_value() -> None:
    try:
        LangfuseDatabaseReader._normalize_score_value(
            {"data_type": "TEXT"},
            None,
            "x" * 501,
        )
    except BusinessError as exc:
        assert exc.code == 1026
    else:
        raise AssertionError("expected BusinessError for overlong text score")


def test_lists_annotation_queue_items_with_large_page_size_for_navigation() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={"page": 1, "pageSize": 5000},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["datas"][0]["id"] == "item-1"
    assert fake_reader.calls[0] == ("list_items", ("project-1", "queue-1", "user-1"))
