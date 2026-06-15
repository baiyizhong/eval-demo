import re

import respx
from fastapi.testclient import TestClient
from httpx import Response

from eval_platform_api.core.config import get_settings
from eval_platform_api.main import create_app


def configure_langfuse_env(monkeypatch):
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost:3000")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    get_settings.cache_clear()


@respx.mock
def test_list_traces_proxies_langfuse_trace_list(monkeypatch):
    configure_langfuse_env(monkeypatch)
    respx.get(re.compile(r"http://localhost:3000/api/public/traces.*")).mock(
        return_value=Response(
            200,
            json={
                "data": [
                    {
                        "id": "trace-1",
                        "name": "medical-answer",
                        "timestamp": "2026-06-10T14:32:11.453Z",
                        "userId": "user_alice",
                        "sessionId": "sess_8a2f",
                        "input": {"question": "头痛怎么办？"},
                        "output": {"answer": "请咨询医生。"},
                    }
                ],
                "meta": {"page": 1, "limit": 25, "totalItems": 1},
            },
        )
    )
    client = TestClient(create_app())

    response = client.get("/api/projects/langfuse-project-1/traces?limit=25&page=1")

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["meta"] == {
        "project_id": "langfuse-project-1",
        "source": "langfuse",
        "pagination": {"page": 1, "limit": 25, "totalItems": 1},
    }
    assert body["data"] == [
        {
            "id": "trace-1",
            "name": "medical-answer",
            "timestamp": "2026-06-10T14:32:11.453Z",
            "user_id": "user_alice",
            "session_id": "sess_8a2f",
            "input": {"question": "头痛怎么办？"},
            "output": {"answer": "请咨询医生。"},
        }
    ]


def test_list_traces_reports_missing_langfuse_credentials(monkeypatch):
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost:3000")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.get("/api/projects/langfuse-project-1/traces")

    assert response.status_code == 503
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == "langfuse_not_configured"
