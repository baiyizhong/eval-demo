import re

import respx
from fastapi.testclient import TestClient
from httpx import ConnectTimeout, Response

from eval_platform_api.core.config import get_settings
from eval_platform_api.main import create_app


def configure_langfuse_env(monkeypatch):
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost:3000")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    get_settings.cache_clear()


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


@respx.mock
def test_list_projects_reads_langfuse_project_and_trace_summary(monkeypatch):
    configure_langfuse_env(monkeypatch)
    respx.get("http://localhost:3000/api/public/projects").mock(
        return_value=Response(
            200,
            json={
                "data": [
                    {
                        "id": "langfuse-project-1",
                        "name": "医疗问答助手",
                        "organization": {"id": "org-1", "name": "安辉医疗科技"},
                        "metadata": {"description": "真实 Langfuse 项目"},
                    }
                ]
            },
        )
    )
    respx.get(re.compile(r"http://localhost:3000/api/public/traces.*")).mock(
        return_value=Response(
            200,
            json={
                "data": [{"id": "trace-1", "timestamp": "2026-06-10T14:32:11.453Z"}],
                "meta": {"totalItems": 12847},
            },
        )
    )
    client = TestClient(create_app())

    response = client.get("/api/projects")

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["meta"]["source"] == "langfuse"
    assert body["data"] == [
        {
            "id": "langfuse-project-1",
            "name": "医疗问答助手",
            "description": "真实 Langfuse 项目",
            "status": "active",
            "trace_count": 12847,
            "created_at": None,
            "last_active_at": "2026-06-10T14:32:11.453Z",
            "langfuse_base_url": "http://localhost:3000/",
            "organization_name": "安辉医疗科技",
        }
    ]


def test_list_projects_reports_missing_langfuse_credentials(monkeypatch):
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost:3000")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.get("/api/projects")

    assert response.status_code == 503
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == "langfuse_not_configured"
    assert "sk-" not in response.text


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
