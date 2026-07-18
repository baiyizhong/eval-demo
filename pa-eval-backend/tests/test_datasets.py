import asyncio
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from app import dataset_exports
from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.user_id = None
        self.project_id = None
        self.list_datasets_call = None
        self.list_dataset_items_call = None
        self.status_counts_call = None
        self.export_item_batches = []
        self.created = None
        self.updated = None
        self.deleted = None
        self.created_item = None
        self.updated_item = None
        self.archived_item = None
        self.deleted_item = None
        self.export_job = None

    async def list_datasets_for_user(
        self,
        project_id: str,
        user_id: str,
        *,
        page: int | None = None,
        page_size: int | None = None,
        keyword: str | None = None,
        dataset_type: str | None = None,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.list_datasets_call = {
            "page": page,
            "page_size": page_size,
            "keyword": keyword,
            "dataset_type": dataset_type,
        }
        datasets = [
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
        if keyword:
            datasets = [item for item in datasets if keyword in item["name"]]
        if dataset_type:
            datasets = [item for item in datasets if item["type"] == dataset_type]
        if page is None or page_size is None:
            return {"total": len(datasets), "datas": datasets}
        start = (page - 1) * page_size
        return {"total": len(datasets), "datas": datasets[start : start + page_size]}

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
        *,
        page: int | None = None,
        page_size: int | None = None,
        keyword: str | None = None,
        status: list[str] | None = None,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.list_dataset_items_call = {
            "dataset_id": dataset_id,
            "page": page,
            "page_size": page_size,
            "keyword": keyword,
            "status": status,
        }
        items = [
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
        if page is None or page_size is None:
            return {"total": len(items), "datas": items}
        start = (page - 1) * page_size
        return {"total": len(items), "datas": items[start : start + page_size]}

    async def count_dataset_item_statuses_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        *,
        keyword: str | None = None,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.status_counts_call = {"dataset_id": dataset_id, "keyword": keyword}
        return {"ACTIVE": 1, "ARCHIVED": 0}

    async def iter_dataset_items_for_export(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        *,
        batch_size: int = 1000,
    ):
        self.project_id = project_id
        self.user_id = user_id
        self.export_item_batches.append(batch_size)
        result = await self.list_dataset_items_for_user(
            project_id,
            dataset_id,
            user_id,
            page=1,
            page_size=batch_size,
        )
        yield result["datas"]

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

    async def create_dataset_item_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.created_item = {"dataset_id": dataset_id, "payload": payload}
        return {
            "id": "item-created",
            "projectId": project_id,
            "datasetId": dataset_id,
            "status": payload.get("status") or "ACTIVE",
            "input": payload["input"],
            "expectedOutput": payload["expectedOutput"],
            "metadata": payload["metadata"],
            "sourceTraceId": payload.get("sourceTraceId") or "",
            "sourceObservationId": payload.get("sourceObservationId") or "",
            "createdAt": "2026-07-02T08:10:00.000Z",
            "updatedAt": "2026-07-02T08:10:00.000Z",
        }

    async def update_dataset_item_for_user(
        self,
        project_id: str,
        dataset_id: str,
        item_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.updated_item = {
            "dataset_id": dataset_id,
            "item_id": item_id,
            "payload": payload,
        }
        return {
            "id": item_id,
            "projectId": project_id,
            "datasetId": dataset_id,
            "status": payload.get("status") or "ACTIVE",
            "input": payload["input"],
            "expectedOutput": payload["expectedOutput"],
            "metadata": payload["metadata"],
            "sourceTraceId": payload.get("sourceTraceId") or "",
            "sourceObservationId": payload.get("sourceObservationId") or "",
            "createdAt": "2026-07-02T08:10:00.000Z",
            "updatedAt": "2026-07-02T09:10:00.000Z",
        }

    async def archive_dataset_item_for_user(
        self,
        project_id: str,
        dataset_id: str,
        item_id: str,
        user_id: str,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.archived_item = {"dataset_id": dataset_id, "item_id": item_id}
        return {
            "id": item_id,
            "projectId": project_id,
            "datasetId": dataset_id,
            "status": "ARCHIVED",
            "input": {"question": "怎么退款？"},
            "expectedOutput": {"answer": "在订单详情申请退款"},
            "metadata": {},
            "sourceTraceId": "",
            "sourceObservationId": "",
            "createdAt": "2026-07-02T08:10:00.000Z",
            "updatedAt": "2026-07-02T09:10:00.000Z",
        }

    async def delete_dataset_item_for_user(
        self,
        project_id: str,
        dataset_id: str,
        item_id: str,
        user_id: str,
    ) -> None:
        self.project_id = project_id
        self.user_id = user_id
        self.deleted_item = {"dataset_id": dataset_id, "item_id": item_id}

    async def create_dataset_export_job_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        export_format: str,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        self.export_job = {
            "id": "export-job-1",
            "projectId": project_id,
            "datasetId": dataset_id,
            "format": export_format,
            "status": "PENDING",
            "totalCount": 0,
            "exportedCount": 0,
            "fileName": "",
            "fileSize": 0,
            "errorMessage": "",
            "createdAt": "2026-07-02T10:00:00.000Z",
            "updatedAt": "2026-07-02T10:00:00.000Z",
            "expiresAt": "2026-07-09T10:00:00.000Z",
        }
        return self.export_job

    async def get_dataset_export_job_for_user(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
        user_id: str,
    ) -> dict:
        self.project_id = project_id
        self.user_id = user_id
        return self.export_job or {
            "id": job_id,
            "projectId": project_id,
            "datasetId": dataset_id,
            "format": "csv",
            "status": "SUCCEEDED",
            "totalCount": 1,
            "exportedCount": 1,
            "fileName": "dataset.csv",
            "fileSize": 128,
            "errorMessage": "",
            "createdAt": "2026-07-02T10:00:00.000Z",
            "updatedAt": "2026-07-02T10:01:00.000Z",
            "expiresAt": "2026-07-09T10:00:00.000Z",
        }

    async def mark_dataset_export_job_running(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
    ) -> None:
        if self.export_job:
            self.export_job["status"] = "RUNNING"

    async def mark_dataset_export_job_succeeded(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
        *,
        total_count: int,
        file_name: str,
        file_path: str,
        file_size: int,
    ) -> None:
        if self.export_job:
            self.export_job.update(
                {
                    "status": "SUCCEEDED",
                    "totalCount": total_count,
                    "exportedCount": total_count,
                    "fileName": file_name,
                    "filePath": file_path,
                    "fileSize": file_size,
                }
            )

    async def mark_dataset_export_job_failed(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
        error_message: str,
    ) -> None:
        if self.export_job:
            self.export_job.update(
                {
                    "status": "FAILED",
                    "errorMessage": error_message,
                }
            )


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
    assert fake_reader.list_datasets_call == {
        "page": 1,
        "page_size": 10,
        "keyword": "黄金",
        "dataset_type": "golden",
    }
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


def test_lists_dataset_items_with_reader_pagination_keyword_and_status() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/datasets/dataset-1/items",
            params=[
                ("page", "3"),
                ("pageSize", "25"),
                ("keyword", "refund"),
                ("status", "ACTIVE"),
                ("status", "ARCHIVED"),
            ],
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.list_dataset_items_call == {
        "dataset_id": "dataset-1",
        "page": 3,
        "page_size": 25,
        "keyword": "refund",
        "status": ["ACTIVE", "ARCHIVED"],
    }
    assert response.json()["data"]["total"] == 1


def test_counts_dataset_item_statuses_with_keyword_across_all_items() -> None:
    class StatusCountReader(FakeDatabaseReader):
        async def count_dataset_item_statuses_for_user(
            self,
            project_id: str,
            dataset_id: str,
            user_id: str,
            *,
            keyword: str | None = None,
        ) -> dict:
            self.project_id = project_id
            self.user_id = user_id
            self.status_counts_call = {"dataset_id": dataset_id, "keyword": keyword}
            return {"ACTIVE": 1, "ARCHIVED": 1}

    fake_reader = StatusCountReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/datasets/dataset-1/items/status-counts",
            params={"keyword": "refund"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.project_id == "project-1"
    assert fake_reader.user_id == "user-1"
    assert fake_reader.list_dataset_items_call is None
    assert fake_reader.status_counts_call == {
        "dataset_id": "dataset-1",
        "keyword": "refund",
    }
    assert response.json()["data"] == {"ACTIVE": 1, "ARCHIVED": 1}


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


def test_creates_updates_archives_and_deletes_langfuse_dataset_items() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)
    payload = {
        "input": {"question": "怎么退款？"},
        "expectedOutput": {"answer": "在订单详情申请退款"},
        "metadata": {"priority": "high"},
        "status": "ARCHIVED",
        "sourceTraceId": "trace-1",
        "sourceObservationId": "observation-1",
    }

    try:
        create_response = TestClient(app).post(
            "/api/projects/project-1/datasets/dataset-1/items",
            json=payload,
        )
        update_response = TestClient(app).patch(
            "/api/projects/project-1/datasets/dataset-1/items/item-created",
            json={**payload, "metadata": {"priority": "medium"}},
        )
        archive_response = TestClient(app).post(
            "/api/projects/project-1/datasets/dataset-1/items/item-created/archive"
        )
        delete_response = TestClient(app).delete(
            "/api/projects/project-1/datasets/dataset-1/items/item-created"
        )
    finally:
        clear_overrides()

    assert create_response.status_code == 200
    assert create_response.json()["data"]["id"] == "item-created"
    assert fake_reader.created_item == {
        "dataset_id": "dataset-1",
        "payload": payload,
    }
    assert update_response.status_code == 200
    assert update_response.json()["data"]["metadata"] == {"priority": "medium"}
    assert fake_reader.updated_item == {
        "dataset_id": "dataset-1",
        "item_id": "item-created",
        "payload": {**payload, "metadata": {"priority": "medium"}},
    }
    assert archive_response.status_code == 200
    assert archive_response.json()["data"]["status"] == "ARCHIVED"
    assert fake_reader.archived_item == {
        "dataset_id": "dataset-1",
        "item_id": "item-created",
    }
    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {"id": "item-created"}
    assert fake_reader.deleted_item == {
        "dataset_id": "dataset-1",
        "item_id": "item-created",
    }


def test_creates_and_gets_dataset_export_job() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        client = TestClient(app)
        create_response = client.post(
            "/api/projects/project-1/datasets/dataset-1/export-jobs",
            json={"format": "csv"},
        )
        get_response = client.get(
            "/api/projects/project-1/datasets/dataset-1/export-jobs/export-job-1"
        )
    finally:
        clear_overrides()

    assert create_response.status_code == 200
    assert create_response.json()["data"]["id"] == "export-job-1"
    assert create_response.json()["data"]["format"] == "csv"
    assert fake_reader.export_job is not None
    assert get_response.status_code == 200
    assert get_response.json()["data"]["projectId"] == "project-1"


def test_dataset_export_file_name_uses_dataset_type_name_and_export_date(
    tmp_path: Path,
    monkeypatch,
) -> None:
    class FixedDatetime:
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 7, 19, tzinfo=tz or timezone.utc)

    monkeypatch.setattr(dataset_exports, "datetime", FixedDatetime, raising=False)

    fake_reader = FakeDatabaseReader()
    asyncio.run(
        fake_reader.create_dataset_export_job_for_user(
            "project-1",
            "dataset-1",
            "user-1",
            "csv",
        )
    )

    asyncio.run(
        dataset_exports.generate_dataset_export_file(
            reader=fake_reader,  # type: ignore[arg-type]
            project_id="project-1",
            dataset_id="dataset-1",
            job_id="export-job-1",
            user_id="user-1",
            export_format="csv",
            storage_dir=str(tmp_path),
        )
    )

    assert fake_reader.export_job is not None
    assert fake_reader.export_job["fileName"] == "【黄金集】客服黄金集20260719.csv"
    assert Path(fake_reader.export_job["filePath"]).name == "【黄金集】客服黄金集20260719.csv"
    assert (tmp_path / "project-1" / "dataset-1" / "【黄金集】客服黄金集20260719.csv").is_file()
    assert fake_reader.export_item_batches == [1000]


def test_dataset_export_streams_items_in_batches(tmp_path: Path) -> None:
    class BatchExportReader(FakeDatabaseReader):
        async def list_dataset_items_for_user(self, *args, **kwargs) -> dict:
            raise AssertionError("export should use iter_dataset_items_for_export")

        async def iter_dataset_items_for_export(
            self,
            project_id: str,
            dataset_id: str,
            user_id: str,
            *,
            batch_size: int = 1000,
        ):
            self.project_id = project_id
            self.user_id = user_id
            self.export_item_batches.append(batch_size)
            for batch_start in (1, 3):
                yield [
                    {
                        "id": f"item-{index}",
                        "projectId": project_id,
                        "datasetId": dataset_id,
                        "status": "ACTIVE",
                        "input": {"question": f"question-{index}"},
                        "expectedOutput": {"answer": f"answer-{index}"},
                        "metadata": {"batch": batch_start},
                        "sourceTraceId": "",
                        "sourceObservationId": "",
                        "createdAt": "2026-07-02T08:10:00.000Z",
                        "updatedAt": "2026-07-02T08:10:00.000Z",
                    }
                    for index in range(batch_start, batch_start + 2)
                ]

    fake_reader = BatchExportReader()
    asyncio.run(
        fake_reader.create_dataset_export_job_for_user(
            "project-1",
            "dataset-1",
            "user-1",
            "txt",
        )
    )

    asyncio.run(
        dataset_exports.generate_dataset_export_file(
            reader=fake_reader,  # type: ignore[arg-type]
            project_id="project-1",
            dataset_id="dataset-1",
            job_id="export-job-1",
            user_id="user-1",
            export_format="txt",
            storage_dir=str(tmp_path),
        )
    )

    assert fake_reader.export_job is not None
    assert fake_reader.export_job["exportedCount"] == 4
    assert fake_reader.export_item_batches == [1000]
    file_path = Path(fake_reader.export_job["filePath"])
    assert file_path.read_text(encoding="utf-8").count("\n") == 4


def test_dataset_xlsx_export_streams_items_into_workbook(tmp_path: Path) -> None:
    fake_reader = FakeDatabaseReader()
    asyncio.run(
        fake_reader.create_dataset_export_job_for_user(
            "project-1",
            "dataset-1",
            "user-1",
            "xlsx",
        )
    )

    asyncio.run(
        dataset_exports.generate_dataset_export_file(
            reader=fake_reader,  # type: ignore[arg-type]
            project_id="project-1",
            dataset_id="dataset-1",
            job_id="export-job-1",
            user_id="user-1",
            export_format="xlsx",
            storage_dir=str(tmp_path),
        )
    )

    assert fake_reader.export_job is not None
    assert fake_reader.export_job["exportedCount"] == 1
    with zipfile.ZipFile(fake_reader.export_job["filePath"]) as workbook:
        sheet = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")
    assert "item-1" in sheet
    assert "expectedOutput" in sheet


def test_rejects_unsupported_dataset_export_format() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/datasets/dataset-1/export-jobs",
            json={"format": "json"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 422
