from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "examples" / "pa_remote_experiment_runner.py"


def test_python_remote_runner_example_uses_langfuse_sdk_experiments() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "from langfuse import get_client" in source
    assert "langfuse.get_dataset" in source
    assert "dataset.run_experiment" in source
    assert "def run_application" in source


def test_python_remote_runner_example_matches_pa_callback_contract() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert '@app.post("/pa/remote-experiment-runs")' in source
    assert "PA_RUNNER_BEARER_TOKEN" in source
    assert "Authorization" not in source
    assert "authorization" in source
    assert "externalRunId" in source
    assert "langfuseRunName" in source
    assert 'status="RUNNING"' in source
    assert 'status="COMPLETED"' in source
    assert 'status="FAILED"' in source
    assert "callback.headers" in source


def test_python_remote_runner_waits_for_langfuse_run_items_before_callback() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "wait_for_dataset_run_items" in source
    assert "/api/public/dataset-items" in source
    assert "/api/public/dataset-run-items" in source
    assert "datasetId" in source
    assert "runName" in source
    assert "allow_not_found=True" in source


def test_backend_app_exposes_remote_runner_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("PA_RUNNER_BEARER_TOKEN", "runner-secret")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")

    calls = []

    async def fake_execute_experiment_and_callback(request, external_run_id, settings):
        calls.append(
            {
                "project_id": request.project_id,
                "dataset_id": request.dataset_id,
                "external_run_id": external_run_id,
                "bearer_token": settings.bearer_token,
            }
        )

    monkeypatch.setattr(
        "app.remote_experiment_runner.execute_experiment_and_callback",
        fake_execute_experiment_and_callback,
    )

    response = TestClient(app).post(
        "/pa/remote-experiment-runs",
        headers={"Authorization": "Bearer runner-secret"},
        json={
            "projectId": "proj-a",
            "datasetId": "dataset-a",
            "datasetName": "Dataset A",
            "callback": {"url": "http://localhost:8000/callback"},
            "payload": {
                "paExperimentGroupId": "group-a",
                "paReportId": "report-a",
                "paSceneId": "scene-a",
                "paExperimentName": "Experiment A",
                "langfuseRunName": "Experiment A::run",
                "runParameters": {"temperature": 0.1},
                "remoteRunner": {"name": "builtin"},
                "evaluatorIds": ["eval-a"],
                "callback": {"url": "http://localhost:8000/callback"},
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is True
    assert body["status"] == "QUEUED"
    assert body["langfuseRunName"] == "Experiment A::run"
    assert body["externalRunId"].startswith("pa-remote-run-")
    assert calls == [
        {
            "project_id": "proj-a",
            "dataset_id": "dataset-a",
            "external_run_id": body["externalRunId"],
            "bearer_token": "runner-secret",
        }
    ]
