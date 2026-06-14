import respx
from fastapi.testclient import TestClient
from httpx import Response

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
