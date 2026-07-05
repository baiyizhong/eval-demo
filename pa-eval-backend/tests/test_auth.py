from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.auth_context import create_access_token, parse_access_token
from app.config import Settings, get_settings
from app.main import app


def override_settings(settings: Settings) -> None:
    app.dependency_overrides[get_settings] = lambda: settings


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_github_login_returns_config_error_when_oauth_missing() -> None:
    override_settings(Settings(github_client_id="", github_client_secret=""))

    try:
        response = TestClient(app).get(
            "/api/auth/github/login",
            follow_redirects=False,
        )
    finally:
        clear_overrides()

    assert response.status_code == 500
    body = response.json()
    assert body["code"] == 3001
    assert body["message"] == "GitHub OAuth 未配置"


def test_github_login_redirects_to_github_with_state_cookie() -> None:
    override_settings(
        Settings(
            github_client_id="github-client-id",
            github_client_secret="github-client-secret",
            github_oauth_redirect_uri=(
                "http://localhost:8000/api/auth/github/callback"
            ),
        )
    )

    try:
        response = TestClient(app).get(
            "/api/auth/github/login",
            follow_redirects=False,
        )
    finally:
        clear_overrides()

    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == (
        "https://github.com/login/oauth/authorize"
    )
    assert query["client_id"] == ["github-client-id"]
    assert query["redirect_uri"] == [
        "http://localhost:8000/api/auth/github/callback"
    ]
    assert query["scope"] == ["read:user user:email"]
    assert query["state"][0]
    assert "pa_eval_github_oauth_state=" in response.headers["set-cookie"]


def test_github_callback_redirects_to_login_when_state_is_invalid() -> None:
    override_settings(
        Settings(
            github_client_id="github-client-id",
            github_client_secret="github-client-secret",
            pa_eval_frontend_url="http://localhost:5173",
        )
    )

    try:
        response = TestClient(app).get(
            "/api/auth/github/callback?code=abc&state=wrong",
            follow_redirects=False,
        )
    finally:
        clear_overrides()

    assert response.status_code == 302
    assert response.headers["location"] == (
        "http://localhost:5173/login?error=github_auth_failed"
    )


def test_access_token_requires_valid_signature() -> None:
    settings = Settings(pa_eval_auth_secret="test-secret")
    token = create_access_token(
        {
            "provider": "github",
            "login": "octocat",
            "langfuseUserId": "user-1",
            "email": "octocat@example.com",
        },
        settings,
    )

    payload = parse_access_token(token, settings)
    assert payload is not None
    assert payload["langfuseUserId"] == "user-1"
    assert payload["email"] == "octocat@example.com"

    prefix, payload_segment, signature = token.split(".")
    replacement = "A" if signature[-1] != "A" else "B"
    tampered_signature = f"{signature[:-1]}{replacement}"
    tampered = f"{prefix}.{payload_segment}.{tampered_signature}"
    assert parse_access_token(tampered, settings) is None
