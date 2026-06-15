from fastapi.testclient import TestClient
import pytest

from eval_platform_api.main import create_app


@pytest.mark.parametrize(
    ("path", "expected_data", "expected_meta"),
    [
        (
            "/api/projects/project-1/datasets",
            [],
            {"project_id": "project-1"},
        ),
        (
            "/api/projects/project-1/evaluators",
            [],
            {"project_id": "project-1"},
        ),
        (
            "/api/projects/project-1/tasks",
            [],
            {"project_id": "project-1"},
        ),
        (
            "/api/projects/project-1/reports/task-1",
            {"task_id": "task-1", "summary": {}},
            {"project_id": "project-1"},
        ),
    ],
)
def test_route_skeletons_return_envelopes(path, expected_data, expected_meta):
    client = TestClient(create_app())

    response = client.get(path)

    assert response.status_code == 200
    body = response.json()
    assert body["data"] == expected_data
    assert body["meta"] == expected_meta
    assert body["error"] is None
