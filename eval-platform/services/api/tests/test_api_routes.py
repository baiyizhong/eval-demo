from fastapi.testclient import TestClient

from eval_platform_api.main import create_app


def test_route_skeletons_return_envelopes():
    client = TestClient(create_app())

    for path in [
        "/api/projects/project-1/traces",
        "/api/projects/project-1/datasets",
        "/api/projects/project-1/evaluators",
        "/api/projects/project-1/tasks",
        "/api/projects/project-1/reports/task-1",
    ]:
        response = client.get(path)
        assert response.status_code == 200
        body = response.json()
        assert "data" in body
        assert "error" in body
