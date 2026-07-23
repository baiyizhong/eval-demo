from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app import auth
from app.auth_context import create_access_token, parse_access_token
from app.config import Settings, get_settings
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


def override_settings(settings: Settings) -> None:
    app.dependency_overrides[get_settings] = lambda: settings


def clear_overrides() -> None:
    app.dependency_overrides.clear()


class FakeAuthDatabaseReader:
    async def get_user_by_email(self, email: str) -> dict:
        return {
            "id": "langfuse-user-1",
            "email": email,
            "name": "测试用户",
        }


def override_reader(fake_reader: FakeAuthDatabaseReader) -> None:
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override


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
    assert query["redirect_uri"] == ["http://localhost:8000/api/auth/github/callback"]
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


def test_github_callback_redirects_to_environment_after_success(
    monkeypatch,
) -> None:
    async def fake_exchange_code_for_token(code, settings, client) -> str:
        assert code == "github-code"
        return "github-token"

    async def fake_fetch_github_identity(access_token, client):
        assert access_token == "github-token"
        return {"id": 123, "login": "octocat"}, "octocat@example.com"

    monkeypatch.setattr(
        auth,
        "_exchange_code_for_token",
        fake_exchange_code_for_token,
    )
    monkeypatch.setattr(
        auth,
        "_fetch_github_identity",
        fake_fetch_github_identity,
    )
    override_settings(
        Settings(
            github_client_id="github-client-id",
            github_client_secret="github-client-secret",
            pa_eval_frontend_url="http://localhost:5173",
            pa_eval_auth_secret="test-secret",
        )
    )
    override_reader(FakeAuthDatabaseReader())

    client = TestClient(app)
    client.cookies.set("pa_eval_github_oauth_state", "expected-state")

    try:
        response = client.get(
            "/api/auth/github/callback?code=github-code&state=expected-state",
            follow_redirects=False,
        )
    finally:
        clear_overrides()

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:5173/environment"
    assert "thisisjustarandomstring=" in response.headers["set-cookie"]


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


def test_auth_options_exposes_enabled_providers() -> None:
    override_settings(
        Settings(
            github_client_id="github-client-id",
            github_client_secret="github-client-secret",
            pa_eval_auth_providers="github,enterprise_password,oidc",
            pa_eval_enterprise_auth_url="https://iam.example.com/login",
            pa_eval_oidc_client_id="oidc-client-id",
            pa_eval_oidc_client_secret="oidc-client-secret",
            pa_eval_oidc_authorize_url="https://sso.example.com/oauth2/authorize",
            pa_eval_oidc_token_url="https://sso.example.com/oauth2/token",
            pa_eval_oidc_userinfo_url="https://sso.example.com/oauth2/userinfo",
        )
    )

    try:
        response = TestClient(app).get("/api/auth/options")
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["providers"] == [
        {"id": "enterprise_password", "label": "企业账号登录", "type": "form"},
        {"id": "oidc", "label": "企业 SSO", "type": "redirect"},
        {"id": "github", "label": "GitHub OAuth", "type": "redirect"},
    ]


def test_auth_options_hides_providers_with_missing_config() -> None:
    override_settings(
        Settings(
            github_client_id="github-client-id",
            github_client_secret="github-client-secret",
            pa_eval_auth_providers="github,enterprise_password,oidc",
            pa_eval_enterprise_auth_url="",
            pa_eval_oidc_client_id="",
            pa_eval_oidc_client_secret="",
            pa_eval_oidc_authorize_url="",
            pa_eval_oidc_token_url="",
            pa_eval_oidc_userinfo_url="",
        )
    )

    try:
        response = TestClient(app).get("/api/auth/options")
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["providers"] == [
        {"id": "github", "label": "GitHub OAuth", "type": "redirect"},
    ]


def test_enterprise_password_login_returns_config_error_when_api_missing() -> None:
    override_settings(
        Settings(
            pa_eval_auth_secret="test-secret",
            pa_eval_auth_providers="enterprise_password",
            pa_eval_enterprise_auth_url="",
        )
    )

    try:
        response = TestClient(app).post(
            "/api/auth/enterprise-password/login",
            json={"username": "user-1", "password": "secret"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 500
    body = response.json()
    assert body["code"] == 3005
    assert body["message"] == "企业认证 API 未配置"


def test_enterprise_password_login_sets_pa_cookie_after_success(monkeypatch) -> None:
    from app import auth_providers

    async def fake_authenticate_enterprise_password(
        username,
        password,
        settings,
        client,
    ):
        assert username == "employee-1"
        assert password == "secret"
        return auth_providers.AuthenticatedIdentity(
            provider="enterprise_password",
            external_id="employee-1",
            email="employee-1@example.com",
            name="企业用户",
            login="employee-1",
        )

    monkeypatch.setattr(
        auth,
        "authenticate_enterprise_password",
        fake_authenticate_enterprise_password,
    )
    override_settings(
        Settings(
            pa_eval_frontend_url="http://localhost:5173",
            pa_eval_auth_secret="test-secret",
            pa_eval_auth_providers="enterprise_password",
            pa_eval_enterprise_auth_url="https://iam.example.com/login",
        )
    )
    override_reader(FakeAuthDatabaseReader())

    try:
        response = TestClient(app).post(
            "/api/auth/enterprise-password/login",
            json={"username": "employee-1", "password": "secret"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"] == {"redirectTo": "/environment"}
    assert "thisisjustarandomstring=" in response.headers["set-cookie"]
    token = response.cookies.get("thisisjustarandomstring")
    payload = parse_access_token(token, Settings(pa_eval_auth_secret="test-secret"))
    assert payload is not None
    assert payload["provider"] == "enterprise_password"
    assert payload["login"] == "employee-1"


def test_enterprise_password_login_normalizes_invalid_credentials(monkeypatch) -> None:
    from app.errors import AuthInvalidCredentialsError

    async def fake_authenticate_enterprise_password(
        username,
        password,
        settings,
        client,
    ):
        raise AuthInvalidCredentialsError()

    monkeypatch.setattr(
        auth,
        "authenticate_enterprise_password",
        fake_authenticate_enterprise_password,
    )
    override_settings(
        Settings(
            pa_eval_auth_secret="test-secret",
            pa_eval_auth_providers="enterprise_password",
            pa_eval_enterprise_auth_url="https://iam.example.com/login",
        )
    )

    try:
        response = TestClient(app).post(
            "/api/auth/enterprise-password/login",
            json={"username": "employee-1", "password": "wrong"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == 3006
    assert body["message"] == "账号或密码错误"


def test_oidc_login_redirects_to_provider_with_state_cookie() -> None:
    override_settings(
        Settings(
            pa_eval_auth_providers="oidc",
            pa_eval_oidc_client_id="oidc-client-id",
            pa_eval_oidc_client_secret="oidc-client-secret",
            pa_eval_oidc_authorize_url="https://sso.example.com/oauth2/authorize",
            pa_eval_oidc_token_url="https://sso.example.com/oauth2/token",
            pa_eval_oidc_userinfo_url="https://sso.example.com/oauth2/userinfo",
            pa_eval_oidc_redirect_uri="http://localhost:8000/api/auth/oidc/callback",
        )
    )

    try:
        response = TestClient(app).get(
            "/api/auth/oidc/login",
            follow_redirects=False,
        )
    finally:
        clear_overrides()

    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == (
        "https://sso.example.com/oauth2/authorize"
    )
    assert query["response_type"] == ["code"]
    assert query["client_id"] == ["oidc-client-id"]
    assert query["redirect_uri"] == ["http://localhost:8000/api/auth/oidc/callback"]
    assert query["scope"] == ["openid email profile"]
    assert query["state"][0]
    assert "pa_eval_oidc_oauth_state=" in response.headers["set-cookie"]


def test_oidc_callback_redirects_to_environment_after_success(monkeypatch) -> None:
    from app import auth_providers

    async def fake_exchange_oidc_code_for_token(code, settings, client) -> str:
        assert code == "oidc-code"
        return "oidc-access-token"

    async def fake_fetch_oidc_identity(access_token, settings, client):
        assert access_token == "oidc-access-token"
        return auth_providers.AuthenticatedIdentity(
            provider="oidc",
            external_id="employee-oidc-1",
            email="employee-oidc-1@example.com",
            name="SSO 用户",
            login="employee-oidc-1",
        )

    monkeypatch.setattr(
        auth,
        "_exchange_oidc_code_for_token",
        fake_exchange_oidc_code_for_token,
    )
    monkeypatch.setattr(
        auth,
        "_fetch_oidc_identity",
        fake_fetch_oidc_identity,
    )
    override_settings(
        Settings(
            pa_eval_frontend_url="http://localhost:5173",
            pa_eval_auth_secret="test-secret",
            pa_eval_auth_providers="oidc",
            pa_eval_oidc_client_id="oidc-client-id",
            pa_eval_oidc_client_secret="oidc-client-secret",
            pa_eval_oidc_authorize_url="https://sso.example.com/oauth2/authorize",
            pa_eval_oidc_token_url="https://sso.example.com/oauth2/token",
            pa_eval_oidc_userinfo_url="https://sso.example.com/oauth2/userinfo",
            pa_eval_oidc_redirect_uri="http://localhost:8000/api/auth/oidc/callback",
        )
    )
    override_reader(FakeAuthDatabaseReader())

    client = TestClient(app)
    client.cookies.set("pa_eval_oidc_oauth_state", "expected-state")

    try:
        response = client.get(
            "/api/auth/oidc/callback?code=oidc-code&state=expected-state",
            follow_redirects=False,
        )
    finally:
        clear_overrides()

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:5173/environment"
    assert "thisisjustarandomstring=" in response.headers["set-cookie"]
    token = response.cookies.get("thisisjustarandomstring")
    payload = parse_access_token(token, Settings(pa_eval_auth_secret="test-secret"))
    assert payload is not None
    assert payload["provider"] == "oidc"
    assert payload["login"] == "employee-oidc-1"
