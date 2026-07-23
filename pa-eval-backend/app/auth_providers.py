from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings
from app.errors import (
    AuthInvalidCredentialsError,
    AuthProviderConfigError,
    AuthUpstreamError,
)


@dataclass(frozen=True)
class AuthenticatedIdentity:
    provider: str
    external_id: str
    email: str
    name: str | None = None
    login: str | None = None


def _read_json_path(payload: dict[str, Any], path: str) -> Any:
    current: Any = payload
    for part in path.split("."):
        key = part.strip()
        if not key:
            continue
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def _present_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


async def authenticate_enterprise_password(
    username: str,
    password: str,
    settings: Settings,
    client: httpx.AsyncClient,
) -> AuthenticatedIdentity:
    if not settings.pa_eval_enterprise_auth_url:
        raise AuthProviderConfigError()

    if settings.pa_eval_enterprise_auth_method.upper() != "POST":
        raise AuthProviderConfigError("企业认证 API 仅支持 POST")

    try:
        response = await client.post(
            settings.pa_eval_enterprise_auth_url,
            json={
                settings.pa_eval_enterprise_auth_username_field: username,
                settings.pa_eval_enterprise_auth_password_field: password,
            },
            headers=settings.enterprise_auth_headers,
        )
    except httpx.HTTPError as exc:
        raise AuthUpstreamError("企业认证服务不可用") from exc

    if response.status_code in {400, 401, 403}:
        raise AuthInvalidCredentialsError()
    if response.status_code >= 400:
        raise AuthUpstreamError("企业认证服务不可用")

    try:
        payload = response.json()
    except ValueError as exc:
        raise AuthUpstreamError("企业认证服务返回异常") from exc

    if not isinstance(payload, dict):
        raise AuthUpstreamError("企业认证服务返回异常")

    email = _present_string(
        _read_json_path(payload, settings.pa_eval_enterprise_auth_email_json_path)
    )
    if not email:
        raise AuthInvalidCredentialsError()

    external_id = _present_string(
        _read_json_path(payload, settings.pa_eval_enterprise_auth_user_id_json_path)
    )
    login = _present_string(
        _read_json_path(payload, settings.pa_eval_enterprise_auth_login_json_path)
    )
    name = _present_string(
        _read_json_path(payload, settings.pa_eval_enterprise_auth_name_json_path)
    )

    return AuthenticatedIdentity(
        provider="enterprise_password",
        external_id=external_id or login or email,
        email=email,
        name=name,
        login=login or username,
    )
