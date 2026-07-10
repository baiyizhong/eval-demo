from fastapi.testclient import TestClient

from app.main import app


def test_sidebar_endpoint_is_removed() -> None:
    response = TestClient(app).get("/api/sidebar")

    assert response.status_code == 404
