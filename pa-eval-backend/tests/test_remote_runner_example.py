from pathlib import Path


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
