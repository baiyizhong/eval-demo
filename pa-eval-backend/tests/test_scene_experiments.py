from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import get_langfuse_db_reader
from app.main import app
from app.scene_experiments import (
    CreateExperimentPayload,
    _webhook_headers,
    run_scene_experiment,
    set_scene_webhook_runner_for_tests,
)


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class FakeSceneExperimentReader:
    def __init__(self) -> None:
        self.project_id = "proj_a"
        self.extensions: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.datasets = {
            "dataset_qa": {
                "id": "dataset_qa",
                "projectId": "proj_a",
                "name": "客服黄金集",
                "description": "",
                "type": "golden",
                "metadata": {"type": "golden"},
                "inputSchema": {},
                "expectedOutputSchema": {},
                "itemCount": 2,
                "runCount": 0,
                "createdAt": "2026-07-02T08:00:00.000Z",
                "updatedAt": "2026-07-02T09:00:00.000Z",
            }
        }
        self.items = [
            {
                "id": "item_1",
                "projectId": "proj_a",
                "datasetId": "dataset_qa",
                "status": "ACTIVE",
                "input": {"question": "怎么退款？"},
                "expectedOutput": {"answer": "订单详情申请退款"},
                "metadata": {},
                "createdAt": "2026-07-02T08:10:00.000Z",
                "updatedAt": "2026-07-02T08:10:00.000Z",
            },
            {
                "id": "item_2",
                "projectId": "proj_a",
                "datasetId": "dataset_qa",
                "status": "ACTIVE",
                "input": {"question": "多久到账？"},
                "expectedOutput": {"answer": "1 到 3 个工作日"},
                "metadata": {},
                "createdAt": "2026-07-02T08:11:00.000Z",
                "updatedAt": "2026-07-02T08:11:00.000Z",
            },
        ]
        self.evaluators = [
            {
                "id": "eval_accuracy",
                "projectId": "proj_a",
                "name": "准确性评估器",
                "type": "LLM_AS_JUDGE",
                "version": "v1",
                "outputVariables": ["accuracy"],
                "outputVariableMappings": [
                    {"variableName": "accuracy", "scoreConfigName": "accuracy"}
                ],
            },
            {
                "id": "eval_safety",
                "projectId": "proj_a",
                "name": "安全性评估器",
                "type": "LLM_AS_JUDGE",
                "version": "v1",
                "outputVariables": ["safety"],
                "outputVariableMappings": [
                    {"variableName": "safety", "scoreConfigName": "safety"}
                ],
            },
        ]
        self.public_client = FakeLangfuseDatasetRunClient()

    async def ensure_project_visible(self, project_id: str, user_id: str) -> None:
        self.project_id = project_id

    async def get_dataset_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        return self.datasets[dataset_id]

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
    ) -> dict[str, Any]:
        rows = [item for item in self.items if item["datasetId"] == dataset_id]
        if status:
            rows = [item for item in rows if item["status"] in status]
        return {"total": len(rows), "datas": rows}

    async def list_evaluators_for_user(self, user_id: str) -> list[dict[str, Any]]:
        return self.evaluators

    async def project_public_client_for_user(self, project_id: str, user_id: str):
        return self.public_client

    async def upsert_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: str,
        payload: dict[str, Any],
        actor: str,
        schema_version: int = 1,
    ) -> dict[str, Any]:
        key = (resource_type, resource_id, extension_type)
        now = _now()
        current = self.extensions.get(key)
        row = {
            "id": current["id"] if current else f"ext_{len(self.extensions) + 1}",
            "project_id": project_id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "extension_type": extension_type,
            "schema_version": schema_version,
            "payload": payload,
            "status": "ACTIVE",
            "created_at": current["created_at"] if current else now,
            "updated_at": now,
        }
        self.extensions[key] = row
        return row

    async def get_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: str,
    ) -> dict[str, Any] | None:
        row = self.extensions.get((resource_type, resource_id, extension_type))
        if row and row["status"] == "ACTIVE":
            return row
        return None

    async def list_resource_extensions(
        self,
        *,
        project_id: str,
        resource_type: str,
        extension_type: str,
        status: str = "ACTIVE",
    ) -> list[dict[str, Any]]:
        return [
            row
            for (row_resource_type, _resource_id, row_extension_type), row in self.extensions.items()
            if row["project_id"] == project_id
            and row_resource_type == resource_type
            and row_extension_type == extension_type
            and row["status"] == status
        ]

    async def set_resource_extension_status(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: str,
        status: str,
        actor: str,
    ) -> None:
        if status not in {"ACTIVE", "INACTIVE"}:
            raise ValueError("pa_resource_extensions status must be ACTIVE or INACTIVE")
        row = self.extensions[(resource_type, resource_id, extension_type)]
        row["status"] = status
        row["updated_at"] = _now()


class FakeLangfuseDatasetRunClient:
    def __init__(self) -> None:
        self.created_run_items: list[dict[str, Any]] = []

    async def create_dataset_run_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_run_items.append(payload)
        return {
            "id": f"dataset-run-item-{len(self.created_run_items)}",
            "datasetItemId": payload["datasetItemId"],
            "datasetRunName": payload["runName"],
            "traceId": payload["traceId"],
            "observationId": payload.get("observationId"),
        }


def _scene_payload() -> dict[str, Any]:
    return {
        "name": "客服多轮回归",
        "description": "对齐 Langfuse experiment 的场景配置",
        "enabled": True,
        "supportsScheduledExecution": True,
        "defaultScheduledWebhookIds": ["webhook_a"],
        "datasetId": "dataset_qa",
        "evaluatorIds": ["eval_accuracy", "eval_safety"],
        "webhooks": [
            {
                "id": "webhook_a",
                "name": "客服机器人 v1",
                "description": "",
                "url": "https://example.test/run",
                "method": "POST",
                "authType": "NONE",
                "headers": {},
                "serviceFamily": "support-agent",
                "version": "v1",
            },
            {
                "id": "webhook_b",
                "name": "客服机器人 v2",
                "description": "",
                "url": "https://example.test/run-v2",
                "method": "POST",
                "authType": "NONE",
                "headers": {},
                "serviceFamily": "support-agent",
                "version": "v2",
            },
        ],
        "runParameters": {
            "concurrency": 2,
            "timeoutSeconds": 30,
            "retryCount": 1,
            "rounds": 1,
        },
    }


def _client(reader: FakeSceneExperimentReader) -> TestClient:
    app.dependency_overrides[get_langfuse_db_reader] = lambda: reader
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="dev@example.com",
        name="Dev",
    )
    return TestClient(app)


def test_scene_crud_uses_existing_resource_extension_store() -> None:
    reader = FakeSceneExperimentReader()
    client = _client(reader)
    try:
        created = client.post("/api/projects/proj_a/scenes", json=_scene_payload())
        assert created.status_code == 200
        scene = created.json()["data"]
        assert scene["name"] == "客服多轮回归"
        assert scene["supportsScheduledExecution"] is True
        assert scene["defaultScheduledWebhookIds"] == ["webhook_a"]
        assert ("SCENE", scene["id"], "SCENE_CONFIG") in reader.extensions

        listed = client.get("/api/projects/proj_a/scenes", params={"enabled": "true"})
        assert listed.json()["data"]["total"] == 1

        patched = client.patch(
            f"/api/projects/proj_a/scenes/{scene['id']}",
            json={"enabled": False},
        )
        assert patched.status_code == 200
        assert patched.json()["data"]["enabled"] is False

        deleted = client.delete(f"/api/projects/proj_a/scenes/{scene['id']}")
        assert deleted.status_code == 200
        assert deleted.json()["data"] == {"id": scene["id"]}
        assert (
            reader.extensions[("SCENE", scene["id"], "SCENE_CONFIG")]["status"]
            == "INACTIVE"
        )
        assert client.get(f"/api/projects/proj_a/scenes/{scene['id']}").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_scene_storage_keeps_webhook_credential_ref_without_persisting_secret() -> None:
    reader = FakeSceneExperimentReader()
    client = _client(reader)
    payload = _scene_payload()
    payload["webhooks"][0] = {
        **payload["webhooks"][0],
        "authType": "BEARER",
        "credential": "real-secret-token",
        "credentialRef": "PA_WEBHOOK_SUPPORT_AGENT_TOKEN",
    }
    try:
        created = client.post("/api/projects/proj_a/scenes", json=payload)
        assert created.status_code == 200
        webhook = created.json()["data"]["webhooks"][0]
        assert webhook["credentialRef"] == "PA_WEBHOOK_SUPPORT_AGENT_TOKEN"
        assert webhook["maskedCredential"] == "Bearer ****oken"
        assert "credential" not in webhook
        stored_scene = reader.extensions[("SCENE", created.json()["data"]["id"], "SCENE_CONFIG")][
            "payload"
        ]
        assert "credential" not in stored_scene["webhooks"][0]
    finally:
        app.dependency_overrides.clear()


def test_webhook_headers_resolve_secret_from_environment_ref(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PA_WEBHOOK_SUPPORT_AGENT_TOKEN", "secret-token")
    assert _webhook_headers(
        {
            "authType": "BEARER",
            "credentialRef": "PA_WEBHOOK_SUPPORT_AGENT_TOKEN",
            "headers": {"X-Static": "yes"},
        }
    ) == {"X-Static": "yes", "Authorization": "Bearer secret-token"}

    monkeypatch.setenv("PA_WEBHOOK_SUPPORT_AGENT_API_KEY", "secret-api-key")
    assert _webhook_headers(
        {
            "authType": "API_KEY",
            "credentialRef": "PA_WEBHOOK_SUPPORT_AGENT_API_KEY",
            "apiKeyHeader": "X-PA-Key",
            "headers": {},
        }
    ) == {"X-PA-Key": "secret-api-key"}


def test_dataset_experiment_creates_reports_and_baseline_without_new_tables() -> None:
    reader = FakeSceneExperimentReader()
    client = _client(reader)

    async def fake_webhook_runner(
        *,
        webhook: dict[str, Any],
        request_payload: dict[str, Any],
        timeout_seconds: int,
        retry_count: int,
    ) -> dict[str, Any]:
        item_id = request_payload["datasetItemId"]
        return {
            "output": {"answer": f"{webhook['name']} 输出 {item_id}"},
            "traceId": f"trace-{webhook['id']}-{item_id}",
        }

    try:
        set_scene_webhook_runner_for_tests(fake_webhook_runner)
        scene = client.post("/api/projects/proj_a/scenes", json=_scene_payload()).json()["data"]
        created = client.post(
            "/api/projects/proj_a/datasets/dataset_qa/experiments",
            json={
                "name": "客服实验 2026-07",
                "description": "",
                "sceneId": scene["id"],
                "webhookIds": ["webhook_a", "webhook_b"],
                "evaluatorIds": ["eval_accuracy"],
                "runParameters": scene["runParameters"],
            },
        )
        assert created.status_code == 200
        body = created.json()["data"]
        assert body["group"]["name"] == "客服实验 2026-07"
        assert len(body["reports"]) == 2
        assert all(report["status"] == "COMPLETED" for report in body["reports"])
        assert all(report["langfuseExperimentName"] for report in body["reports"])
        assert body["reports"][0]["scoreResults"]
        assert all(
            ("EXPERIMENT_REPORT", report["id"], "EXPERIMENT_REPORT_SNAPSHOT")
            in reader.extensions
            for report in body["reports"]
        )

        reports = client.get(
            "/api/projects/proj_a/datasets/dataset_qa/experiment-reports"
        ).json()["data"]
        assert reports["total"] == 2

        aggregate = client.post(
            "/api/projects/proj_a/experiment-reports/aggregate",
            json={"reportIds": [report["id"] for report in body["reports"]]},
        )
        assert aggregate.status_code == 200
        assert aggregate.json()["data"]["bestReportId"] in {
            report["id"] for report in body["reports"]
        }

        baseline = client.put(
            "/api/projects/proj_a/experiment-report-baselines",
            json={"reportId": body["reports"][0]["id"]},
        )
        assert baseline.status_code == 200
        assert baseline.json()["data"]["sceneId"] == scene["id"]
        baseline_rows = client.get(
            "/api/projects/proj_a/datasets/dataset_qa/experiment-report-baselines"
        ).json()["data"]
        assert baseline_rows[0]["reportId"] == body["reports"][0]["id"]
    finally:
        set_scene_webhook_runner_for_tests(None)
        app.dependency_overrides.clear()


def test_scene_experiment_invokes_real_webhook_and_creates_langfuse_dataset_run_items() -> None:
    reader = FakeSceneExperimentReader()
    current_user = CurrentUserContext(
        user_id="user-1",
        email="dev@example.com",
        name="Dev",
    )
    webhook_calls: list[dict[str, Any]] = []

    async def fake_webhook_runner(
        *,
        webhook: dict[str, Any],
        request_payload: dict[str, Any],
        timeout_seconds: int,
        retry_count: int,
    ) -> dict[str, Any]:
        webhook_calls.append(
            {
                "webhook": webhook,
                "payload": request_payload,
                "timeoutSeconds": timeout_seconds,
                "retryCount": retry_count,
            }
        )
        item_id = request_payload["datasetItemId"]
        return {
            "output": {"answer": f"真实输出 {item_id}"},
            "traceId": f"trace-{item_id}",
            "observationId": f"obs-{item_id}",
            "metadata": {"requestId": f"req-{item_id}"},
        }

    async def exercise() -> dict[str, Any]:
        scene = _scene_payload()
        scene_id = "scene_real_chain"
        await reader.upsert_resource_extension(
            project_id="proj_a",
            resource_type="SCENE",
            resource_id=scene_id,
            extension_type="SCENE_CONFIG",
            payload={**scene, "id": scene_id, "projectId": "proj_a"},
            actor="dev@example.com",
        )
        set_scene_webhook_runner_for_tests(fake_webhook_runner)
        try:
            return await run_scene_experiment(
                project_id="proj_a",
                dataset_id="dataset_qa",
                payload=CreateExperimentPayload(
                    name="客服实验 2026-07",
                    description="真实场景实验",
                    sceneId=scene_id,
                    webhookIds=["webhook_a"],
                    evaluatorIds=["eval_accuracy"],
                    runParameters=scene["runParameters"],
                ),
                current_user=current_user,
                reader=reader,
            )
        finally:
            set_scene_webhook_runner_for_tests(None)

    import anyio

    body = anyio.run(exercise)

    assert len(webhook_calls) == 2
    assert webhook_calls[0]["payload"]["experimentName"] == "客服实验 2026-07"
    assert webhook_calls[0]["payload"]["langfuseExperimentName"].startswith(
        "客服实验 2026-07::experiment_group_"
    )
    assert webhook_calls[0]["payload"]["datasetItemId"] == "item_1"
    assert webhook_calls[0]["timeoutSeconds"] == 30
    assert webhook_calls[0]["retryCount"] == 1

    created_run_items = reader.public_client.created_run_items
    assert len(created_run_items) == 2
    assert created_run_items[0]["runName"] == body["group"]["langfuseExperimentName"]
    assert created_run_items[0]["datasetItemId"] == "item_1"
    assert created_run_items[0]["traceId"] == "trace-item_1"
    assert created_run_items[0]["observationId"] == "obs-item_1"
    assert created_run_items[0]["metadata"]["paExperimentGroupId"] == body["group"]["id"]
    assert created_run_items[0]["metadata"]["sceneId"] == "scene_real_chain"
    assert created_run_items[0]["metadata"]["webhookId"] == "webhook_a"

    report = body["reports"][0]
    assert report["status"] == "COMPLETED"
    assert report["successfulItemCount"] == 2
    assert report["failedItemCount"] == 0
    assert report["itemResults"][0]["output"] == {"answer": "真实输出 item_1"}
    assert report["itemResults"][0]["traceId"] == "trace-item_1"
    assert report["itemResults"][0]["observationId"] == "obs-item_1"
