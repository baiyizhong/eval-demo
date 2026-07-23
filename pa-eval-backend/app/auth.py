import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from starlette.responses import Response

from app.auth_providers import AuthenticatedIdentity, authenticate_enterprise_password
from app.auth_context import create_access_token
from app.config import Settings, get_settings
from app.errors import (
    AuthConfigError,
    AuthInvalidCredentialsError,
    AuthProviderConfigError,
    AuthSessionConfigError,
    AuthUpstreamError,
)
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success

router = APIRouter(prefix="/api/auth", tags=["auth"])

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
OAUTH_STATE_COOKIE = "pa_eval_github_oauth_state"
OIDC_STATE_COOKIE = "pa_eval_oidc_oauth_state"

AUTH_PROVIDER_OPTIONS = [
    {"id": "enterprise_password", "label": "企业账号登录", "type": "form"},
    {"id": "oidc", "label": "企业 SSO", "type": "redirect"},
    {"id": "github", "label": "GitHub OAuth", "type": "redirect"},
]


class EnterprisePasswordLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=1, max_length=2048)


def _frontend_url(settings: Settings, path: str) -> str:
    base_url = settings.pa_eval_frontend_url.rstrip("/")
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{base_url}{normalized_path}"


def _ensure_github_config(settings: Settings) -> None:
    if not settings.github_client_id or not settings.github_client_secret:
        raise AuthConfigError()


def _ensure_oidc_config(settings: Settings) -> None:
    if (
        not settings.pa_eval_oidc_client_id
        or not settings.pa_eval_oidc_client_secret
        or not settings.pa_eval_oidc_authorize_url
        or not settings.pa_eval_oidc_token_url
        or not settings.pa_eval_oidc_userinfo_url
    ):
        raise AuthProviderConfigError("企业 SSO 未配置")


def _build_github_authorize_url(settings: Settings, state: str) -> str:
    query = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": settings.github_oauth_redirect_uri,
            "scope": "read:user user:email",
            "state": state,
        }
    )
    return f"{GITHUB_AUTHORIZE_URL}?{query}"


def _build_oidc_authorize_url(settings: Settings, state: str) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.pa_eval_oidc_client_id,
            "redirect_uri": settings.pa_eval_oidc_redirect_uri,
            "scope": settings.pa_eval_oidc_scope,
            "state": state,
        }
    )
    return f"{settings.pa_eval_oidc_authorize_url}?{query}"


def create_pa_access_token(
    identity: AuthenticatedIdentity,
    langfuse_user: dict[str, Any],
    settings: Settings,
) -> str:
    payload = {
        "provider": identity.provider,
        "sub": identity.external_id,
        "login": identity.login or "",
        "langfuseUserId": langfuse_user["id"],
        "email": langfuse_user["email"],
        "name": langfuse_user.get("name") or identity.name,
        "nonce": secrets.token_urlsafe(24),
    }
    return create_access_token(payload, settings)


def _set_access_token_cookie(
    response: Response,
    settings: Settings,
    access_token: str,
) -> None:
    response.set_cookie(
        settings.pa_eval_auth_cookie_name,
        access_token,
        httponly=False,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


def _enabled_provider_options(settings: Settings) -> list[dict[str, str]]:
    enabled = set(settings.auth_providers)
    return [
        provider
        for provider in AUTH_PROVIDER_OPTIONS
        if provider["id"] in enabled and _provider_has_required_config(provider["id"], settings)
    ]


def _provider_has_required_config(provider_id: str, settings: Settings) -> bool:
    if provider_id == "github":
        return bool(settings.github_client_id and settings.github_client_secret)
    if provider_id == "enterprise_password":
        return bool(settings.pa_eval_enterprise_auth_url)
    if provider_id == "oidc":
        return bool(
            settings.pa_eval_oidc_client_id
            and settings.pa_eval_oidc_client_secret
            and settings.pa_eval_oidc_authorize_url
            and settings.pa_eval_oidc_token_url
            and settings.pa_eval_oidc_userinfo_url
        )
    return False


def _github_headers(access_token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {access_token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def _exchange_code_for_token(
    code: str,
    settings: Settings,
    client: httpx.AsyncClient,
) -> str:
    response = await client.post(
        GITHUB_TOKEN_URL,
        json={
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "code": code,
            "redirect_uri": settings.github_oauth_redirect_uri,
        },
        headers={"Accept": "application/json"},
    )
    response.raise_for_status()
    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise AuthUpstreamError()
    return str(access_token)


async def _fetch_github_identity(
    access_token: str,
    client: httpx.AsyncClient,
) -> tuple[dict[str, Any], str | None]:
    user_response = await client.get(
        GITHUB_USER_URL,
        headers=_github_headers(access_token),
    )
    user_response.raise_for_status()
    user = user_response.json()

    emails_response = await client.get(
        GITHUB_EMAILS_URL,
        headers=_github_headers(access_token),
    )
    emails_response.raise_for_status()
    emails = emails_response.json()
    primary_email = next(
        (
            item.get("email")
            for item in emails
            if item.get("primary") and item.get("verified")
        ),
        None,
    )

    return user, primary_email


async def _exchange_oidc_code_for_token(
    code: str,
    settings: Settings,
    client: httpx.AsyncClient,
) -> str:
    response = await client.post(
        settings.pa_eval_oidc_token_url,
        data={
            "grant_type": "authorization_code",
            "client_id": settings.pa_eval_oidc_client_id,
            "client_secret": settings.pa_eval_oidc_client_secret,
            "code": code,
            "redirect_uri": settings.pa_eval_oidc_redirect_uri,
        },
        headers={"Accept": "application/json"},
    )
    response.raise_for_status()
    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise AuthUpstreamError("企业 SSO 登录失败")
    return str(access_token)


async def _fetch_oidc_identity(
    access_token: str,
    settings: Settings,
    client: httpx.AsyncClient,
) -> AuthenticatedIdentity:
    response = await client.get(
        settings.pa_eval_oidc_userinfo_url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
        },
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise AuthUpstreamError("企业 SSO 登录失败")

    email = payload.get("email")
    if not isinstance(email, str) or not email:
        raise AuthInvalidCredentialsError()

    external_id = payload.get("sub")
    login = payload.get("preferred_username")
    name = payload.get("name")
    return AuthenticatedIdentity(
        provider="oidc",
        external_id=str(external_id or login or email),
        email=email,
        name=str(name) if isinstance(name, str) and name else None,
        login=str(login) if isinstance(login, str) and login else email,
    )


@router.get("/github/login")
async def github_login(
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    _ensure_github_config(settings)
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(
        _build_github_authorize_url(settings, state),
        status_code=302,
    )
    response.set_cookie(
        OAUTH_STATE_COOKIE,
        state,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=600,
        path="/",
    )
    return response


@router.get("/options")
async def auth_options(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    return success({"providers": _enabled_provider_options(settings)})


@router.get("/oidc/login")
async def oidc_login(
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    _ensure_oidc_config(settings)
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(
        _build_oidc_authorize_url(settings, state),
        status_code=302,
    )
    response.set_cookie(
        OIDC_STATE_COOKIE,
        state,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=600,
        path="/",
    )
    return response


@router.post("/enterprise-password/login")
async def enterprise_password_login(
    payload: EnterprisePasswordLoginRequest,
    settings: Settings = Depends(get_settings),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> JSONResponse:
    async with httpx.AsyncClient(timeout=settings.pa_eval_api_timeout) as client:
        identity = await authenticate_enterprise_password(
            payload.username,
            payload.password,
            settings,
            client,
        )

    langfuse_user = await reader.get_user_by_email(identity.email)
    if langfuse_user is None:
        raise AuthInvalidCredentialsError()

    try:
        access_token = create_pa_access_token(identity, langfuse_user, settings)
    except AuthSessionConfigError:
        raise

    access_token_response = JSONResponse(
        content=success({"redirectTo": "/environment"})
    )
    _set_access_token_cookie(access_token_response, settings, access_token)
    return access_token_response


@router.get("/oidc/callback")
async def oidc_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> RedirectResponse:
    _ensure_oidc_config(settings)
    expected_state = request.cookies.get(OIDC_STATE_COOKIE)
    login_error_url = _frontend_url(settings, "/login?error=sso_auth_failed")
    user_not_found_url = _frontend_url(settings, "/login?error=user_not_found")

    if not code or not state or not expected_state or state != expected_state:
        response = RedirectResponse(login_error_url, status_code=302)
        response.delete_cookie(OIDC_STATE_COOKIE, path="/")
        return response

    try:
        async with httpx.AsyncClient(timeout=settings.pa_eval_api_timeout) as client:
            oidc_token = await _exchange_oidc_code_for_token(code, settings, client)
            identity = await _fetch_oidc_identity(oidc_token, settings, client)
    except (httpx.HTTPError, AuthUpstreamError):
        response = RedirectResponse(login_error_url, status_code=302)
        response.delete_cookie(OIDC_STATE_COOKIE, path="/")
        return response

    langfuse_user = await reader.get_user_by_email(identity.email)
    if langfuse_user is None:
        response = RedirectResponse(user_not_found_url, status_code=302)
        response.delete_cookie(OIDC_STATE_COOKIE, path="/")
        return response

    try:
        access_token = create_pa_access_token(identity, langfuse_user, settings)
    except AuthSessionConfigError:
        response = RedirectResponse(
            _frontend_url(settings, "/login?error=session_config_missing"),
            status_code=302,
        )
        response.delete_cookie(OIDC_STATE_COOKIE, path="/")
        return response

    response = RedirectResponse(
        _frontend_url(settings, "/environment"), status_code=302
    )
    response.delete_cookie(OIDC_STATE_COOKIE, path="/")
    _set_access_token_cookie(response, settings, access_token)
    return response


@router.get("/github/callback")
async def github_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> RedirectResponse:
    _ensure_github_config(settings)
    expected_state = request.cookies.get(OAUTH_STATE_COOKIE)
    login_error_url = _frontend_url(settings, "/login?error=github_auth_failed")
    user_not_found_url = _frontend_url(settings, "/login?error=user_not_found")

    if not code or not state or not expected_state or state != expected_state:
        response = RedirectResponse(login_error_url, status_code=302)
        response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return response

    try:
        async with httpx.AsyncClient(timeout=settings.pa_eval_api_timeout) as client:
            github_token = await _exchange_code_for_token(code, settings, client)
            github_user, primary_email = await _fetch_github_identity(
                github_token, client
            )
    except (httpx.HTTPError, AuthUpstreamError):
        response = RedirectResponse(login_error_url, status_code=302)
        response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return response

    verified_email = primary_email or github_user.get("email")
    if not verified_email:
        response = RedirectResponse(user_not_found_url, status_code=302)
        response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return response

    langfuse_user = await reader.get_user_by_email(str(verified_email))
    if langfuse_user is None:
        response = RedirectResponse(user_not_found_url, status_code=302)
        response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return response

    try:
        identity = AuthenticatedIdentity(
            provider="github",
            external_id=str(github_user.get("id") or ""),
            email=str(verified_email),
            name=github_user.get("name"),
            login=github_user.get("login") or "",
        )
        access_token = create_pa_access_token(identity, langfuse_user, settings)
    except AuthSessionConfigError:
        response = RedirectResponse(
            _frontend_url(settings, "/login?error=session_config_missing"),
            status_code=302,
        )
        response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return response

    response = RedirectResponse(
        _frontend_url(settings, "/environment"), status_code=302
    )
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    _set_access_token_cookie(response, settings, access_token)
    return response
