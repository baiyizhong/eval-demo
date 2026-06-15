from fastapi.testclient import TestClient

from eval_platform_api.main import create_app


def test_create_task_from_trace_ids_returns_task_draft():
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/project-1/tasks",
        json={
            "name": "安全性评测",
            "evaluator_id": "eval-1",
            "trace_ids": ["trace-1", "trace-2"],
            "runtime_config": {"concurrency": 2},
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["error"] is None
    assert body["meta"] == {"project_id": "project-1"}
    assert body["data"]["task_id"]
    assert body["data"]["status"] == "pending"
    assert body["data"]["item_count"] == 2


def test_create_task_requires_at_least_one_trace_id():
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/project-1/tasks",
        json={
            "name": "安全性评测",
            "evaluator_id": "eval-1",
            "trace_ids": [],
        },
    )

    assert response.status_code == 422
