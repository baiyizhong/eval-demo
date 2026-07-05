import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse

from app.auth_context import create_access_token
from app.config import Settings, get_settings
from app.errors import AuthConfigError, AuthSessionConfigError, AuthUpstreamError
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader

router = APIRouter(prefix="/api/auth", tags=["auth"])

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
OAUTH_STATE_COOKIE = "pa_eval_github_oauth_state"


def _frontend_url(settings: Settings, path: str) -> str:
    base_url = settings.pa_eval_frontend_url.rstrip("/")
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{base_url}{normalized_path}"


def _ensure_github_config(settings: Settings) -> None:
    if not settings.github_client_id or not settings.github_client_secret:
        raise AuthConfigError()


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


def _create_access_token(
    github_user: dict[str, Any],
    langfuse_user: dict[str, Any],
    settings: Settings,
) -> str:
    payload = {
        "provider": "github",
        "sub": str(github_user.get("id") or ""),
        "login": github_user.get("login") or "",
        "langfuseUserId": langfuse_user["id"],
        "email": langfuse_user["email"],
        "name": langfuse_user.get("name"),
        "nonce": secrets.token_urlsafe(24),
    }
    return create_access_token(payload, settings)


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
        access_token = _create_access_token(github_user, langfuse_user, settings)
    except AuthSessionConfigError:
        response = RedirectResponse(
            _frontend_url(settings, "/login?error=session_config_missing"),
            status_code=302,
        )
        response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return response

    response = RedirectResponse(_frontend_url(settings, "/apps"), status_code=302)
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    response.set_cookie(
        settings.pa_eval_auth_cookie_name,
        access_token,
        httponly=False,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return response
