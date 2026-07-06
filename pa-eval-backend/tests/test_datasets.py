from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.user_id = None
        self.project_id = None
        self.created = None
        self.updated = None
        self.deleted = None

    async def list_datasets_for_user(self, project_id: str, user_id: str) -> list[dict]:
        self.project_id = project_id
        self.user_id = user_id
        return [
            {
                "id": "dataset-1",
                "projectId": project_id,
                "name": "客服黄金集",
                "description": "Langfuse 中创建的数据集",
                "type": "golden",
                "metadata": {"type": "golden"},
                "inputSchema": {},
                "expectedOutputSchema": {},
                "itemCount": 12,
                "runCount": 2,
                "createdAt": "2026-07-02T08:00:00.000Z",
                "updatedAt": "2026-07-02T09:00:00.000Z",
            },
            {
                "id": "dataset-2",
                "projectId": project_id,
                "name": "回归评测集",
                "description": "",
                "type": "evaluation",
                "metadata": {"type": "evaluation"},
                "inputSchema": {},
                "expectedOutputSchema": {},
                "itemCount": 3,
                "runCount": 0,
                "createdAt": "2026-07-01T08:00:00.000Z",
                "updatedAt": "2026-07-01T09:00:00.000Z",
            },
        ]

    async def get_dataset_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        return {
            "id": dataset_id,
            "projectId": project_id,
            "name": "客服黄金集",
            "description": "Langfuse 中创建的数据集",
            "type": "golden",
            "metadata": {"type": "golden"},
            "inputSchema": {},
            "expectedOutputSchema": {},
            "itemCount": 12,
            "runCount": 2,
            "createdAt": "2026-07-02T08:00:00.000Z",
            "updatedAt": "2026-07-02T09:00:00.000Z",
        }

    async def get_dataset_metric_summary_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> dict:
        return {
            "total": 12,
            "active": 10,
            "archived": 2,
            "updatedAt": "2026-07-02T09:00:00.000Z",
            "specific": [
                {"label": "来源", "value": "Langfuse"},
            ],
        }

    async def list_dataset_items_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> list[dict]:
        return [
            {
                "id": "item-1",
                "projectId": project_id,
                "datasetId": dataset_id,
                "status": "ACTIVE",
                "input": {"question": "怎么退款？"},
                "expectedOutput": {"answer": "在订单详情申请退款"},
                "metadata": {},
                "sourceTraceId": "",
                "sourceObservationId": "",
                "createdAt": "2026-07-02T08:10:00.000Z",
                "updatedAt": "2026-07-02T08:10:00.000Z",
            }
        ]

    async def create_dataset_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.created = payload
        return {
            "id": "dataset-created",
            "projectId": project_id,
            "name": payload["name"],
            "description": payload["description"],
            "type": payload["type"],
            "metadata": payload["metadata"],
            "inputSchema": payload["inputSchema"],
            "expectedOutputSchema": payload["expectedOutputSchema"],
            "itemCount": 0,
            "runCount": 0,
            "createdAt": "2026-07-02T08:00:00.000Z",
            "updatedAt": "2026-07-02T08:00:00.000Z",
        }

    async def update_dataset_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.updated = {"dataset_id": dataset_id, "payload": payload}
        return {
            "id": dataset_id,
            "projectId": project_id,
            "name": payload["name"],
            "description": payload["description"],
            "type": payload["type"],
            "metadata": payload["metadata"],
            "inputSchema": payload["inputSchema"],
            "expectedOutputSchema": payload["expectedOutputSchema"],
            "itemCount": 0,
            "runCount": 0,
            "createdAt": "2026-07-02T08:00:00.000Z",
            "updatedAt": "2026-07-02T09:00:00.000Z",
        }

    async def delete_dataset_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> None:
        self.project_id = project_id
        self.user_id = user_id
        self.deleted = dataset_id


def override_reader(fake_reader: FakeDatabaseReader):
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="admin@163.com",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_lists_langfuse_datasets_with_pa_pagination_keyword_and_type() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/datasets",
            params={
                "page": 1,
                "pageSize": 10,
                "keyword": "黄金",
                "type": "golden",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert fake_reader.project_id == "project-1"
    assert fake_reader.user_id == "user-1"
    assert body["data"] == {
        "total": 1,
        "datas": [
            {
                "id": "dataset-1",
                "projectId": "project-1",
                "name": "客服黄金集",
                "description": "Langfuse 中创建的数据集",
                "type": "golden",
                "metadata": {"type": "golden"},
                "inputSchema": {},
                "expectedOutputSchema": {},
                "itemCount": 12,
                "runCount": 2,
                "createdAt": "2026-07-02T08:00:00.000Z",
                "updatedAt": "2026-07-02T09:00:00.000Z",
            }
        ],
    }


def test_gets_langfuse_dataset_detail_and_items() -> None:
    override_reader(FakeDatabaseReader())

    try:
        dataset_response = TestClient(app).get(
            "/api/projects/project-1/datasets/dataset-1"
        )
        metric_response = TestClient(app).get(
            "/api/projects/project-1/datasets/dataset-1/metrics"
        )
        item_response = TestClient(app).get(
            "/api/projects/project-1/datasets/dataset-1/items",
            params={"page": 1, "pageSize": 10},
        )
    finally:
        clear_overrides()

    assert dataset_response.status_code == 200
    assert dataset_response.json()["data"]["id"] == "dataset-1"
    assert metric_response.status_code == 200
    assert metric_response.json()["data"]["total"] == 12
    assert item_response.status_code == 200
    assert item_response.json()["data"]["datas"][0]["id"] == "item-1"


def test_creates_updates_and_deletes_langfuse_dataset() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)
    payload = {
        "name": "新增评测集",
        "type": "evaluation",
        "description": "用于回归测试",
        "metadata": {"owner": "qa", "type": "evaluation"},
        "inputSchema": {"type": "object"},
        "expectedOutputSchema": {"type": "object"},
    }

    try:
        create_response = TestClient(app).post(
            "/api/projects/project-1/datasets",
            json=payload,
        )
        update_response = TestClient(app).patch(
            "/api/projects/project-1/datasets/dataset-created",
            json={**payload, "name": "更新评测集"},
        )
        delete_response = TestClient(app).delete(
            "/api/projects/project-1/datasets/dataset-created"
        )
    finally:
        clear_overrides()

    assert create_response.status_code == 200
    assert create_response.json()["data"]["name"] == "新增评测集"
    assert fake_reader.created == payload
    assert update_response.status_code == 200
    assert update_response.json()["data"]["name"] == "更新评测集"
    assert fake_reader.updated == {
        "dataset_id": "dataset-created",
        "payload": {**payload, "name": "更新评测集"},
    }
    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {"id": "dataset-created"}
    assert fake_reader.deleted == "dataset-created"
