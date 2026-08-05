from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.langfuse_db import get_langfuse_db_reader
from app.main import app
from app import scene_experiments as scene_module
from app.scene_experiments import (
    CreateExperimentPayload,
    _scene_from_row,
    _webhook_headers,
    run_scene_experiment,
    set_scene_webhook_runner_for_tests,
    set_scene_workflow_evaluator_runner_for_tests,
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
                "id": "eval_dify_accuracy",
                "projectId": "proj_a",
                "name": "Dify 准确性评估器",
                "type": "WORKFLOW",
                "provider": "DIFY",
                "version": "v1",
                "variables": ["input", "output", "expected_output", "context"],
                "outputVariables": ["accuracy"],
                "outputVariableMappings": [
                    {"variableName": "accuracy", "scoreConfigName": "accuracy"}
                ],
                "config": {
                    "endpointUrl": "http://dify.local/v1/workflows/run",
                    "authType": "BEARER",
                    "authToken": "dify-token",
                    "inputMapping": {},
                    "outputMapping": {},
                    "outputVariableMappings": [
                        {"variableName": "accuracy", "scoreConfigName": "accuracy"}
                    ],
                },
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

    async def get_evaluator_for_user(
        self,
        evaluator_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        for evaluator in self.evaluators:
            if evaluator["id"] == evaluator_id:
                return evaluator
        raise KeyError(evaluator_id)

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
        self.created_scores: list[dict[str, Any]] = []
        self.dataset_run_items_by_run: dict[tuple[str, str], list[dict[str, Any]]] = {}
        self.traces_by_id: dict[str, dict[str, Any]] = {}
        self.trace_fields_by_id: dict[str, str | None] = {}

    async def create_dataset_run_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_run_items.append(payload)
        return {
            "id": f"dataset-run-item-{len(self.created_run_items)}",
            "datasetItemId": payload["datasetItemId"],
            "datasetRunName": payload["runName"],
            "traceId": payload["traceId"],
            "observationId": payload.get("observationId"),
        }

    async def list_dataset_run_items(
        self,
        *,
        dataset_id: str,
        run_name: str,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        rows = self.dataset_run_items_by_run.get((dataset_id, run_name), [])
        return {"data": rows[(page - 1) * limit : page * limit], "meta": {"totalItems": len(rows)}}

    async def get_trace(self, trace_id: str, *, fields: str | None = None) -> dict[str, Any]:
        self.trace_fields_by_id[trace_id] = fields
        trace = self.traces_by_id[trace_id]
        if fields and "io" not in fields.split(","):
            return {key: value for key, value in trace.items() if key not in {"input", "output"}}
        return trace

    async def create_score(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_scores.append(payload)
        return {"id": payload["id"], **payload}


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


def _seed_remote_experiment_result(
    reader: FakeSceneExperimentReader,
    *,
    run_name: str,
    output_prefix: str = "真实输出",
) -> None:
    reader.public_client.dataset_run_items_by_run[("dataset_qa", run_name)] = [
        {
            "id": "dataset-run-item-1",
            "datasetItemId": "item_1",
            "traceId": "trace-item_1",
            "observationId": "obs-item_1",
        },
        {
            "id": "dataset-run-item-2",
            "datasetItemId": "item_2",
            "traceId": "trace-item_2",
            "observationId": "obs-item_2",
        },
    ]
    reader.public_client.traces_by_id = {
        "trace-item_1": {
            "id": "trace-item_1",
            "input": {"question": "怎么退款？"},
            "output": {"answer": f"{output_prefix} item_1"},
            "metadata": {"requestId": "req-item_1"},
        },
        "trace-item_2": {
            "id": "trace-item_2",
            "input": {"question": "多久到账？"},
            "output": {"answer": f"{output_prefix} item_2"},
            "metadata": {"requestId": "req-item_2"},
        },
    }


async def _fake_completed_remote_runner(
    reader: FakeSceneExperimentReader,
    *,
    request_payload: dict[str, Any],
    output_prefix: str = "真实输出",
) -> dict[str, Any]:
    run_name = request_payload["payload"]["langfuseRunName"]
    _seed_remote_experiment_result(reader, run_name=run_name, output_prefix=output_prefix)
    return {
        "accepted": True,
        "externalRunId": "remote-run-1",
        "langfuseRunName": run_name,
        "status": "COMPLETED",
    }


def _client(
    reader: FakeSceneExperimentReader,
    settings: Settings | None = None,
) -> TestClient:
    app.dependency_overrides[get_langfuse_db_reader] = lambda: reader
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="dev@example.com",
        name="Dev",
    )
    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def test_scene_from_row_uses_only_default_scheduled_webhook_ids() -> None:
    scene = _scene_from_row(
        {
            "project_id": "proj_a",
            "resource_id": "scene-1",
            "created_at": datetime(2026, 7, 9, tzinfo=UTC),
            "updated_at": datetime(2026, 7, 9, tzinfo=UTC),
            "payload": {
                "id": "scene-1",
                "projectId": "proj_a",
                "name": "客服场景",
                "defaultScheduledWebhookId": "webhook-old",
            },
        }
    )

    assert scene["defaultScheduledWebhookIds"] == []
    assert "defaultScheduledWebhookId" not in scene


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
        return await _fake_completed_remote_runner(
            reader,
            request_payload=request_payload,
            output_prefix=f"{webhook['name']} 输出",
        )

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
        assert body["reports"][0]["itemResults"]
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


def test_scene_experiment_triggers_remote_runner_once_and_evaluates_langfuse_run_items() -> None:
    reader = FakeSceneExperimentReader()
    settings = Settings(
        pa_eval_backend_url="https://pa.example.test",
        pa_eval_remote_callback_secret="callback-secret",
    )
    current_user = CurrentUserContext(
        user_id="user-1",
        email="dev@example.com",
        name="Dev",
    )
    remote_calls: list[dict[str, Any]] = []
    workflow_calls: list[dict[str, Any]] = []

    async def fake_webhook_runner(
        *,
        webhook: dict[str, Any],
        request_payload: dict[str, Any],
        timeout_seconds: int,
        retry_count: int,
    ) -> dict[str, Any]:
        remote_calls.append(
            {
                "webhook": webhook,
                "payload": request_payload,
                "timeoutSeconds": timeout_seconds,
                "retryCount": retry_count,
            }
        )
        return await _fake_completed_remote_runner(
            reader,
            request_payload=request_payload,
        )

    async def fake_workflow_runner(
        *,
        evaluator: dict[str, Any],
        sample: dict[str, Any],
        settings: Any,
    ) -> dict[str, Any]:
        workflow_calls.append({"evaluator": evaluator, "sample": sample})
        return {
            "score": 0.88,
            "passed": True,
            "reason": "PA 评估通过",
            "scores": [
                {
                    "outputVariable": "accuracy",
                    "name": "accuracy",
                    "value": 0.88,
                    "passed": True,
                }
            ],
        }

    async def exercise() -> dict[str, Any]:
        scene = _scene_payload()
        scene["evaluatorIds"] = ["eval_dify_accuracy"]
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
        set_scene_workflow_evaluator_runner_for_tests(fake_workflow_runner)
        try:
            return await run_scene_experiment(
                project_id="proj_a",
                dataset_id="dataset_qa",
                payload=CreateExperimentPayload(
                    name="客服实验 2026-07",
                    description="真实场景实验",
                    sceneId=scene_id,
                    webhookIds=["webhook_a"],
                    evaluatorIds=["eval_dify_accuracy"],
                    runParameters=scene["runParameters"],
                ),
                current_user=current_user,
                reader=reader,
                settings=settings,
            )
        finally:
            set_scene_webhook_runner_for_tests(None)
            set_scene_workflow_evaluator_runner_for_tests(None)

    import anyio

    body = anyio.run(exercise)

    assert len(remote_calls) == 1
    assert remote_calls[0]["payload"]["projectId"] == "proj_a"
    assert remote_calls[0]["payload"]["datasetId"] == "dataset_qa"
    assert remote_calls[0]["payload"]["datasetName"] == "客服黄金集"
    assert remote_calls[0]["payload"]["payload"]["paSceneId"] == "scene_real_chain"
    assert remote_calls[0]["payload"]["payload"]["langfuseRunName"].startswith(
        "客服实验 2026-07 - 客服机器人 v1::experiment_report_"
    )
    callback = remote_calls[0]["payload"]["callback"]
    assert callback["method"] == "POST"
    assert callback["url"].startswith(
        "https://pa.example.test/api/projects/proj_a/experiment-reports/"
    )
    assert callback["url"].endswith("/remote-callback")
    assert callback["headers"]["X-PA-Remote-Callback-Token"]
    assert remote_calls[0]["payload"]["payload"]["callback"] == callback
    assert "datasetItemId" not in remote_calls[0]["payload"]
    assert remote_calls[0]["timeoutSeconds"] == 30
    assert remote_calls[0]["retryCount"] == 1
    assert reader.public_client.created_run_items == []
    assert len(workflow_calls) == 2
    assert workflow_calls[0]["sample"]["input"]["output"] == "真实输出 item_1"
    assert reader.public_client.created_scores[0]["traceId"] == "trace-item_1"
    assert reader.public_client.created_scores[0]["name"] == "accuracy"
    assert reader.public_client.created_scores[0]["value"] == 0.88

    report = body["reports"][0]
    assert report["status"] == "COMPLETED"
    assert report["successfulItemCount"] == 2
    assert report["failedItemCount"] == 0
    assert report["itemResults"][0]["output"] == {"answer": "真实输出 item_1"}
    assert report["itemResults"][0]["traceId"] == "trace-item_1"
    assert report["itemResults"][0]["observationId"] == "obs-item_1"


def test_scene_experiment_uses_workflow_evaluator_scores() -> None:
    reader = FakeSceneExperimentReader()
    current_user = CurrentUserContext(
        user_id="user-1",
        email="dev@example.com",
        name="Dev",
    )
    workflow_calls: list[dict[str, Any]] = []

    async def fake_webhook_runner(
        *,
        webhook: dict[str, Any],
        request_payload: dict[str, Any],
        timeout_seconds: int,
        retry_count: int,
    ) -> dict[str, Any]:
        return await _fake_completed_remote_runner(
            reader,
            request_payload=request_payload,
            output_prefix="Dify 待评估输出",
        )

    async def fake_workflow_runner(
        *,
        evaluator: dict[str, Any],
        sample: dict[str, Any],
        settings: Any,
    ) -> dict[str, Any]:
        workflow_calls.append({"evaluator": evaluator, "sample": sample})
        return {
            "raw": {"data": {"outputs": {"accuracy": 0.73, "reason": "Dify 判定通过"}}},
            "score": 0.73,
            "passed": True,
            "reason": "Dify 判定通过",
            "scores": [
                {
                    "outputVariable": "accuracy",
                    "name": "accuracy",
                    "value": 0.73,
                    "passed": True,
                }
            ],
        }

    async def exercise() -> dict[str, Any]:
        scene = _scene_payload()
        scene["evaluatorIds"] = ["eval_dify_accuracy"]
        scene_id = "scene_dify_chain"
        await reader.upsert_resource_extension(
            project_id="proj_a",
            resource_type="SCENE",
            resource_id=scene_id,
            extension_type="SCENE_CONFIG",
            payload={**scene, "id": scene_id, "projectId": "proj_a"},
            actor="dev@example.com",
        )
        set_scene_webhook_runner_for_tests(fake_webhook_runner)
        set_scene_workflow_evaluator_runner_for_tests(fake_workflow_runner)
        try:
            return await run_scene_experiment(
                project_id="proj_a",
                dataset_id="dataset_qa",
                payload=CreateExperimentPayload(
                    name="Dify 场景实验",
                    description="真实 Dify 评估器打分",
                    sceneId=scene_id,
                    webhookIds=["webhook_a"],
                    evaluatorIds=["eval_dify_accuracy"],
                    runParameters=scene["runParameters"],
                ),
                current_user=current_user,
                reader=reader,
            )
        finally:
            set_scene_webhook_runner_for_tests(None)
            set_scene_workflow_evaluator_runner_for_tests(None)

    import anyio

    body = anyio.run(exercise)

    assert len(workflow_calls) == 2
    assert workflow_calls[0]["evaluator"]["provider"] == "DIFY"
    assert workflow_calls[0]["sample"]["input"]["output"] == "Dify 待评估输出 item_1"
    assert workflow_calls[0]["sample"]["expectedOutput"] == "订单详情申请退款"

    report = body["reports"][0]
    assert report["scoreResults"] == [
        {
            "key": "eval_dify_accuracy:accuracy",
            "evaluatorId": "eval_dify_accuracy",
            "evaluatorName": "Dify 准确性评估器",
            "variableName": "accuracy",
            "scoreName": "accuracy",
            "value": 0.73,
            "standardDeviation": 0,
        }
    ]
    assert report["itemResults"][0]["scores"] == {"eval_dify_accuracy:accuracy": 0.73}
    assert report["itemResults"][0]["evaluationReasons"]["eval_dify_accuracy:accuracy"] == "Dify 判定通过"


def test_remote_experiment_callback_completes_pa_evaluation_after_async_runner() -> None:
    reader = FakeSceneExperimentReader()
    settings = Settings(
        pa_eval_backend_url="https://pa.example.test",
        pa_eval_remote_callback_secret="callback-secret",
    )
    client = _client(reader, settings)
    workflow_calls: list[dict[str, Any]] = []
    callback_token = ""

    async def fake_remote_runner(
        *,
        webhook: dict[str, Any],
        request_payload: dict[str, Any],
        timeout_seconds: int,
        retry_count: int,
    ) -> dict[str, Any]:
        nonlocal callback_token
        callback_token = request_payload["callback"]["headers"][
            "X-PA-Remote-Callback-Token"
        ]
        return {
            "accepted": True,
            "externalRunId": "remote-run-async",
            "langfuseRunName": request_payload["payload"]["langfuseRunName"],
            "status": "QUEUED",
        }

    async def fake_workflow_runner(
        *,
        evaluator: dict[str, Any],
        sample: dict[str, Any],
        settings: Any,
    ) -> dict[str, Any]:
        workflow_calls.append({"evaluator": evaluator, "sample": sample})
        return {
            "score": 0.91,
            "passed": True,
            "reason": "异步回调后评估通过",
            "scores": [
                {
                    "outputVariable": "accuracy",
                    "name": "accuracy",
                    "value": 0.91,
                    "passed": True,
                }
            ],
        }

    try:
        set_scene_webhook_runner_for_tests(fake_remote_runner)
        set_scene_workflow_evaluator_runner_for_tests(fake_workflow_runner)
        scene_payload = _scene_payload()
        scene_payload["evaluatorIds"] = ["eval_dify_accuracy"]
        scene = client.post("/api/projects/proj_a/scenes", json=scene_payload).json()["data"]
        created = client.post(
            "/api/projects/proj_a/datasets/dataset_qa/experiments",
            json={
                "name": "异步远程实验",
                "description": "",
                "sceneId": scene["id"],
                "webhookIds": ["webhook_a"],
                "evaluatorIds": ["eval_dify_accuracy"],
                "runParameters": scene["runParameters"],
            },
        )
        report = created.json()["data"]["reports"][0]
        assert report["status"] == "RUNNING"
        assert workflow_calls == []
        assert callback_token

        _seed_remote_experiment_result(
            reader,
            run_name=report["langfuseExperimentName"],
            output_prefix="异步真实输出",
        )
        app.dependency_overrides.pop(get_current_user_context)
        callback = client.post(
            f"/api/projects/proj_a/experiment-reports/{report['id']}/remote-callback",
            headers={"X-PA-Remote-Callback-Token": callback_token},
            json={
                "status": "COMPLETED",
                "externalRunId": "remote-run-async",
                "langfuseRunName": report["langfuseExperimentName"],
            },
        )
        assert callback.status_code == 200
        completed = callback.json()["data"]
        assert completed["status"] == "COMPLETED"
        assert completed["externalRunId"] == "remote-run-async"
        assert completed["successfulItemCount"] == 2
        assert completed["itemResults"][0]["output"] == {"answer": "异步真实输出 item_1"}
        assert reader.public_client.trace_fields_by_id["trace-item_1"] == "core,io,observations,scores"
        assert len(workflow_calls) == 2
        assert reader.public_client.created_scores[0]["value"] == 0.91
        stored = reader.extensions[
            ("EXPERIMENT_REPORT", report["id"], "EXPERIMENT_REPORT_SNAPSHOT")
        ]["payload"]
        assert stored["status"] == "COMPLETED"
    finally:
        set_scene_webhook_runner_for_tests(None)
        set_scene_workflow_evaluator_runner_for_tests(None)
        app.dependency_overrides.clear()


def test_remote_experiment_completed_callback_retries_until_langfuse_items_are_visible() -> None:
    reader = FakeSceneExperimentReader()
    settings = Settings(pa_eval_backend_url="https://pa.example.test")
    current_user = CurrentUserContext(
        user_id="user-1",
        email="dev@example.com",
        name="Dev",
    )
    workflow_calls: list[dict[str, Any]] = []

    async def fake_remote_runner(
        *,
        webhook: dict[str, Any],
        request_payload: dict[str, Any],
        timeout_seconds: int,
        retry_count: int,
    ) -> dict[str, Any]:
        return {
            "accepted": True,
            "externalRunId": "remote-run-race",
            "langfuseRunName": request_payload["payload"]["langfuseRunName"],
            "status": "QUEUED",
        }

    async def fake_workflow_runner(
        *,
        evaluator: dict[str, Any],
        sample: dict[str, Any],
        settings: Any,
    ) -> dict[str, Any]:
        workflow_calls.append({"evaluator": evaluator, "sample": sample})
        return {
            "score": 0.89,
            "passed": True,
            "reason": "补偿轮询后评估通过",
            "scores": [
                {
                    "outputVariable": "accuracy",
                    "name": "accuracy",
                    "value": 0.89,
                    "passed": True,
                }
            ],
        }

    async def exercise() -> dict[str, Any]:
        set_scene_webhook_runner_for_tests(fake_remote_runner)
        set_scene_workflow_evaluator_runner_for_tests(fake_workflow_runner)
        try:
            scene_payload = _scene_payload()
            scene_payload["evaluatorIds"] = ["eval_dify_accuracy"]
            await reader.upsert_resource_extension(
                project_id="proj_a",
                resource_type="SCENE",
                resource_id="scene_race_retry",
                extension_type="SCENE_CONFIG",
                payload={**scene_payload, "id": "scene_race_retry", "projectId": "proj_a"},
                actor="dev@example.com",
            )
            created = await run_scene_experiment(
                project_id="proj_a",
                dataset_id="dataset_qa",
                payload=CreateExperimentPayload(
                    name="异步远端可见性补偿实验",
                    description="",
                    sceneId="scene_race_retry",
                    webhookIds=["webhook_a"],
                    evaluatorIds=["eval_dify_accuracy"],
                    runParameters=scene_payload["runParameters"],
                ),
                current_user=current_user,
                reader=reader,
                settings=settings,
            )
            report = created["reports"][0]
            assert report["status"] == "RUNNING"

            sleep_calls = 0

            async def fake_sleep(delay: float) -> None:
                nonlocal sleep_calls
                sleep_calls += 1
                if sleep_calls == 1:
                    _seed_remote_experiment_result(
                        reader,
                        run_name=report["langfuseExperimentName"],
                        output_prefix="补偿真实输出",
                    )

            completed = await scene_module._retry_complete_remote_experiment_report(
                project_id="proj_a",
                report_id=report["id"],
                actor_user_id="user-1",
                actor_email="dev@example.com",
                reader=reader,
                report_updates={"externalRunId": "remote-run-race"},
                retry_delays=(0.01, 0.01),
                sleep=fake_sleep,
            )
            assert sleep_calls == 1
            return completed
        finally:
            set_scene_webhook_runner_for_tests(None)
            set_scene_workflow_evaluator_runner_for_tests(None)

    import anyio

    completed = anyio.run(exercise)

    assert completed["status"] == "COMPLETED"
    assert completed["externalRunId"] == "remote-run-race"
    assert completed["successfulItemCount"] == 2
    assert completed["itemResults"][0]["output"] == {"answer": "补偿真实输出 item_1"}
    assert reader.public_client.trace_fields_by_id["trace-item_1"] == "core,io,observations,scores"
    assert workflow_calls
    stored = reader.extensions[
        ("EXPERIMENT_REPORT", completed["id"], "EXPERIMENT_REPORT_SNAPSHOT")
    ]["payload"]
    assert stored["status"] == "COMPLETED"


def test_scene_experiment_loads_full_workflow_evaluator_config_for_execution() -> None:
    reader = FakeSceneExperimentReader()
    full_evaluator = reader.evaluators[1]
    redacted_evaluator = {
        **full_evaluator,
        "config": {
            key: value
            for key, value in full_evaluator["config"].items()
            if key != "authToken"
        }
        | {"hasAuthToken": True},
    }
    reader.evaluators = [redacted_evaluator]

    async def get_full_evaluator_for_execution(evaluator_id: str, user_id: str) -> dict[str, Any]:
        assert evaluator_id == full_evaluator["id"]
        return full_evaluator

    reader.get_workflow_evaluator_for_execution = get_full_evaluator_for_execution  # type: ignore[attr-defined]
    current_user = CurrentUserContext(
        user_id="user-1",
        email="dev@example.com",
        name="Dev",
    )
    workflow_calls: list[dict[str, Any]] = []

    async def fake_webhook_runner(
        *,
        webhook: dict[str, Any],
        request_payload: dict[str, Any],
        timeout_seconds: int,
        retry_count: int,
    ) -> dict[str, Any]:
        return await _fake_completed_remote_runner(
            reader,
            request_payload=request_payload,
            output_prefix="订单详情申请退款",
        )

    async def fake_workflow_runner(
        *,
        evaluator: dict[str, Any],
        sample: dict[str, Any],
        settings: Any,
    ) -> dict[str, Any]:
        workflow_calls.append(evaluator)
        return {
            "score": 1,
            "passed": True,
            "reason": "ok",
            "scores": [
                {
                    "outputVariable": "accuracy",
                    "name": "accuracy",
                    "value": 1,
                    "passed": True,
                }
            ],
        }

    async def exercise() -> None:
        scene = _scene_payload()
        scene["evaluatorIds"] = [full_evaluator["id"]]
        scene_id = "scene_dify_full_config"
        await reader.upsert_resource_extension(
            project_id="proj_a",
            resource_type="SCENE",
            resource_id=scene_id,
            extension_type="SCENE_CONFIG",
            payload={**scene, "id": scene_id, "projectId": "proj_a"},
            actor="dev@example.com",
        )
        set_scene_webhook_runner_for_tests(fake_webhook_runner)
        set_scene_workflow_evaluator_runner_for_tests(fake_workflow_runner)
        try:
            await run_scene_experiment(
                project_id="proj_a",
                dataset_id="dataset_qa",
                payload=CreateExperimentPayload(
                    name="Dify 完整配置实验",
                    description="执行时使用未脱敏 evaluator 配置",
                    sceneId=scene_id,
                    webhookIds=["webhook_a"],
                    evaluatorIds=[full_evaluator["id"]],
                    runParameters=scene["runParameters"],
                ),
                current_user=current_user,
                reader=reader,
            )
        finally:
            set_scene_webhook_runner_for_tests(None)
            set_scene_workflow_evaluator_runner_for_tests(None)

    import anyio

    anyio.run(exercise)

    assert workflow_calls
    assert workflow_calls[0]["config"]["authToken"] == "dify-token"
    assert "hasAuthToken" not in workflow_calls[0]["config"]
