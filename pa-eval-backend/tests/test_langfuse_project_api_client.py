from typing import Any

import httpx
import pytest

from app.config import Settings
from app.errors import LangfuseProjectCredentialsError, LangfuseUpstreamError
from app.langfuse_client import LangfuseProjectApiClient, LangfuseRateLimitError


class FakeAsyncClient:
    requests: list[dict[str, Any]] = []
    responses: list[httpx.Response | Exception] = []

    def __init__(self, **kwargs: Any) -> None:
        self.kwargs = kwargs

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> httpx.Response:
        self.requests.append(
            {
                "client": self.kwargs,
                "method": method,
                "path": path,
                "kwargs": kwargs,
            }
        )
        if self.responses:
            response = self.responses.pop(0)
            if isinstance(response, Exception):
                raise response
            response.request = httpx.Request(method, path)
            return response
        payload: dict[str, Any] = {
            "id": "llm-1",
            "provider": "OpenAI",
            "adapter": "openai",
            "displaySecretKey": "sk-...1234",
            "baseURL": "https://api.openai.com/v1",
            "customModels": ["gpt-4o-mini"],
            "withDefaultModels": True,
        }
        return httpx.Response(200, json=payload, request=httpx.Request(method, path))


@pytest.mark.anyio
async def test_upserts_llm_connection_with_langfuse_project_admin_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = []
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(
            langfuse_base_url="http://langfuse.local",
            langfuse_admin_api_key="admin-secret",
        )
    )

    connection = await client.upsert_llm_connection(
        "project-1",
        {
            "provider": "OpenAI",
            "adapter": "openai",
            "secretKey": "sk-real",
            "baseUrl": "https://api.openai.com/v1",
            "customModels": ["gpt-4o-mini"],
            "withDefaultModels": True,
        },
    )

    assert connection == {
        "id": "llm-1",
        "provider": "OpenAI",
        "adapter": "openai",
        "displaySecretKey": "sk-...1234",
        "baseUrl": "https://api.openai.com/v1",
        "customModels": ["gpt-4o-mini"],
        "withDefaultModels": True,
    }
    assert FakeAsyncClient.requests[0]["method"] == "PUT"
    assert FakeAsyncClient.requests[0]["path"] == "/api/public/llm-connections"
    assert FakeAsyncClient.requests[0]["client"]["headers"] == {
        "Authorization": "Bearer admin-secret",
        "x-langfuse-admin-api-key": "admin-secret",
        "x-langfuse-project-id": "project-1",
    }
    assert FakeAsyncClient.requests[0]["kwargs"]["json"]["baseURL"] == (
        "https://api.openai.com/v1"
    )


@pytest.mark.anyio
async def test_llm_connection_client_accepts_langfuse_native_admin_api_key_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = []
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(
            langfuse_base_url="http://langfuse.local",
            langfuse_admin_api_key="",
            admin_api_key="native-admin-secret",
        )
    )

    await client.list_llm_connections("project-1")

    assert FakeAsyncClient.requests[0]["client"]["headers"] == {
        "Authorization": "Bearer native-admin-secret",
        "x-langfuse-admin-api-key": "native-admin-secret",
        "x-langfuse-project-id": "project-1",
    }


@pytest.mark.anyio
async def test_lists_llm_connections_with_langfuse_supported_page_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = []
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(
            langfuse_base_url="http://langfuse.local",
            langfuse_admin_api_key="admin-secret",
        )
    )

    await client.list_llm_connections("project-1")

    assert FakeAsyncClient.requests[0]["method"] == "GET"
    assert FakeAsyncClient.requests[0]["path"] == "/api/public/llm-connections"
    assert FakeAsyncClient.requests[0]["kwargs"]["params"] == {
        "page": 1,
        "limit": 100,
    }


@pytest.mark.anyio
async def test_create_score_posts_to_langfuse_public_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [httpx.Response(200, json={"id": "score-1"})]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(
            langfuse_base_url="http://langfuse.local",
            langfuse_admin_api_key="admin-secret",
        )
    )

    result = await client.create_score(
        "pk-project-1",
        "sk-project-1",
        {"id": "score-1", "name": "quality", "value": 1},
    )

    request = FakeAsyncClient.requests[0]
    assert request["method"] == "POST"
    assert request["path"] == "/api/public/scores"
    assert request["kwargs"]["json"]["id"] == "score-1"
    auth = request["client"]["auth"]
    auth_request = httpx.Request("POST", "http://langfuse.local")
    next(auth.sync_auth_flow(auth_request))
    assert auth_request.headers["Authorization"] == (
        "Basic cGstcHJvamVjdC0xOnNrLXByb2plY3QtMQ=="
    )
    assert "headers" not in request["client"]
    assert result == {"id": "score-1"}


@pytest.mark.anyio
async def test_create_score_treats_existing_id_as_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.Response(
            409,
            json={"message": "conflict"},
        ),
        httpx.Response(200, json={"id": "score-1", "name": "quality"}),
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(
            langfuse_base_url="http://langfuse.local",
            langfuse_admin_api_key="admin-secret",
        )
    )

    result = await client.create_score(
        "pk-project-1",
        "sk-project-1",
        {"id": "score-1", "name": "quality", "value": 1},
    )

    assert result == {"id": "score-1", "duplicate": True}
    assert [request["method"] for request in FakeAsyncClient.requests] == [
        "POST",
        "GET",
    ]
    assert FakeAsyncClient.requests[1]["path"] == "/api/public/scores/score-1"


@pytest.mark.anyio
async def test_create_score_does_not_confirm_unrelated_409(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.Response(409, json={"message": "unrelated conflict"}),
        httpx.Response(200, json={"id": "different-score", "name": "quality"}),
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(
            langfuse_base_url="http://langfuse.local",
            langfuse_admin_api_key="admin-secret",
        )
    )

    with pytest.raises(LangfuseUpstreamError):
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )


@pytest.mark.anyio
async def test_create_score_keeps_conflict_pending_when_confirmation_conflicts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.Response(409, json={"message": "create conflict"}),
        httpx.Response(409, json={"message": "read conflict"}),
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(langfuse_base_url="http://langfuse.local")
    )

    with pytest.raises(LangfuseUpstreamError):
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )


@pytest.mark.anyio
async def test_create_score_preserves_rate_limit_from_duplicate_confirmation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.Response(409, json={"message": "create conflict"}),
        httpx.Response(
            429,
            headers={"Retry-After": "7"},
            json={"message": "credential-shaped-sensitive-response"},
        ),
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(langfuse_base_url="http://langfuse.local")
    )

    with pytest.raises(LangfuseRateLimitError) as captured:
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )

    assert captured.value.retry_after_seconds == 7
    assert "credential-shaped" not in captured.value.message


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("failure", "expected_error_code", "expected_status"),
    [
        (
            httpx.ReadTimeout("timeout contains credential"),
            "PROVIDER_TIMEOUT",
            None,
        ),
        (
            httpx.ConnectError("connect contains credential"),
            "PROVIDER_UNAVAILABLE",
            None,
        ),
        (
            httpx.ReadError("read contains credential"),
            "PROVIDER_UNAVAILABLE",
            None,
        ),
        (
            httpx.WriteError("write contains credential"),
            "PROVIDER_UNAVAILABLE",
            None,
        ),
        (
            httpx.RemoteProtocolError("protocol contains credential"),
            "PROVIDER_UNAVAILABLE",
            None,
        ),
        (
            httpx.Response(
                503,
                json={"message": "upstream response contains credential"},
            ),
            "PROVIDER_UNAVAILABLE",
            503,
        ),
    ],
)
async def test_create_score_classifies_only_transient_upstream_failures_as_retryable(
    monkeypatch: pytest.MonkeyPatch,
    failure: httpx.Response | Exception,
    expected_error_code: str,
    expected_status: int | None,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [failure]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(langfuse_base_url="http://langfuse.local")
    )

    with pytest.raises(LangfuseUpstreamError) as captured:
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )

    assert captured.value.retryable is True
    assert captured.value.error_code == expected_error_code
    assert captured.value.upstream_status_code == expected_status
    assert "credential" not in captured.value.message


@pytest.mark.anyio
async def test_create_score_does_not_retry_unsupported_protocol_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.UnsupportedProtocol("unsupported protocol contains credential")
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(langfuse_base_url="http://langfuse.local")
    )

    with pytest.raises(LangfuseUpstreamError) as captured:
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )

    assert getattr(captured.value, "retryable", False) is False
    assert "credential" not in captured.value.message


@pytest.mark.anyio
@pytest.mark.parametrize("status_code", [401, 403])
async def test_create_score_classifies_invalid_project_credentials_as_non_retryable(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.Response(
            status_code,
            json={"message": "credential-shaped-sensitive-response"},
        )
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(langfuse_base_url="http://langfuse.local")
    )

    with pytest.raises(LangfuseUpstreamError) as captured:
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )

    assert captured.value.retryable is False
    assert captured.value.error_code == "PROVIDER_AUTHENTICATION_FAILED"
    assert captured.value.upstream_status_code == status_code
    assert "credential-shaped" not in captured.value.message


@pytest.mark.anyio
async def test_create_score_rejects_missing_project_credentials() -> None:
    client = LangfuseProjectApiClient(
        Settings(langfuse_base_url="http://langfuse.local")
    )

    with pytest.raises(LangfuseProjectCredentialsError):
        await client.create_score(
            "",
            "",
            {"id": "score-1", "name": "quality", "value": 1},
        )


@pytest.mark.anyio
async def test_create_score_exposes_retry_after_for_rate_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.Response(
            429,
            headers={"Retry-After": "3"},
            json={"message": "rate limited"},
        )
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(
            langfuse_base_url="http://langfuse.local",
            langfuse_admin_api_key="admin-secret",
        )
    )

    with pytest.raises(LangfuseRateLimitError) as captured:
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )

    assert captured.value.retry_after_seconds == 3


@pytest.mark.anyio
async def test_create_score_accepts_http_date_retry_after(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.Response(
            429,
            headers={"Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT"},
            json={"message": "rate limited"},
        )
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(
            langfuse_base_url="http://langfuse.local",
            langfuse_admin_api_key="admin-secret",
        )
    )

    with pytest.raises(LangfuseRateLimitError) as captured:
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )

    assert captured.value.retry_after_seconds == 0


@pytest.mark.anyio
@pytest.mark.parametrize("header", ["NaN", "inf", "-1", "not-a-date"])
async def test_create_score_uses_safe_default_for_invalid_retry_after(
    monkeypatch: pytest.MonkeyPatch,
    header: str,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.responses = [
        httpx.Response(
            429,
            headers={"Retry-After": header},
            json={"message": "rate limited"},
        )
    ]
    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseProjectApiClient(
        Settings(langfuse_base_url="http://langfuse.local")
    )

    with pytest.raises(LangfuseRateLimitError) as captured:
        await client.create_score(
            "pk-project-1",
            "sk-project-1",
            {"id": "score-1", "name": "quality", "value": 1},
        )

    assert captured.value.retry_after_seconds == 1.0
