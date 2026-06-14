import respx
from fastapi.testclient import TestClient
from httpx import ConnectTimeout, Response

from eval_platform_api.main import create_app


@respx.mock
def test_connection_test_calls_langfuse_health():
    respx.get("http://localhost:3000/api/public/projects").mock(
        return_value=Response(200, json={"data": []})
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/connection/test",
        json={
            "langfuse_base_url": "http://localhost:3000",
            "langfuse_public_key": "pk-lf-test",
            "langfuse_secret_key": "sk-lf-test",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["ok"] is True


def test_validation_error_does_not_echo_langfuse_secret_key():
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/connection/test",
        json={
            "langfuse_base_url": "http://localhost:3000",
            "langfuse_secret_key": "sk-should-not-leak",
        },
    )

    assert response.status_code == 422
    assert "sk-should-not-leak" not in response.text
    assert '"input"' not in response.text


@respx.mock
def test_connection_test_rejects_non_configured_langfuse_origin():
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/connection/test",
        json={
            "langfuse_base_url": "http://169.254.169.254",
            "langfuse_public_key": "pk-lf-test",
            "langfuse_secret_key": "sk-lf-test",
        },
    )

    assert response.status_code == 400
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == "invalid_langfuse_base_url"
    assert not respx.calls


@respx.mock
def test_connection_test_returns_not_ok_for_unauthorized_response():
    respx.get("http://localhost:3000/api/public/projects").mock(
        return_value=Response(401, json={"message": "Unauthorized"})
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/connection/test",
        json={
            "langfuse_base_url": "http://localhost:3000",
            "langfuse_public_key": "pk-lf-test",
            "langfuse_secret_key": "sk-lf-test",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["ok"] is False


@respx.mock
def test_connection_test_returns_not_ok_for_transport_error():
    respx.get("http://localhost:3000/api/public/projects").mock(
        side_effect=ConnectTimeout("Langfuse timed out")
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/connection/test",
        json={
            "langfuse_base_url": "http://localhost:3000",
            "langfuse_public_key": "pk-lf-test",
            "langfuse_secret_key": "sk-lf-test",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["ok"] is False
