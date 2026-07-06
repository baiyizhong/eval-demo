from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
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
            }
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
