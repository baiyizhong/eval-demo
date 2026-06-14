from fastapi.testclient import TestClient

from eval_platform_api.main import create_app


def test_health_returns_ok():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["data"] == {"status": "ok", "service": "eval-platform-api"}
    assert response.json()["error"] is None
