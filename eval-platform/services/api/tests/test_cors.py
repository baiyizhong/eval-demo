from fastapi.testclient import TestClient

from eval_platform_api.main import create_app


def test_health_allows_local_vite_origin():
    client = TestClient(create_app())

    response = client.get("/health", headers={"Origin": "http://localhost:5173"})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_connection_test_preflight_allows_local_vite_origin_and_post_method():
    client = TestClient(create_app())

    response = client.options(
        "/api/projects/connection/test",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "POST" in response.headers["access-control-allow-methods"]


def test_health_allows_loopback_vite_origin():
    client = TestClient(create_app())

    response = client.get("/health", headers={"Origin": "http://127.0.0.1:5173"})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
