import hashlib
import hmac
import json
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, Request

from app.config import Settings, get_settings
from app.errors import AuthRequiredError, AuthSessionConfigError


@dataclass(frozen=True)
class CurrentUserContext:
    user_id: str
    email: str
    name: str | None = None
    login: str | None = None
    provider: str | None = None


def _base64url_encode(value: bytes) -> str:
    return urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return urlsafe_b64decode(padded.encode("ascii"))


def _sign(segment: str, settings: Settings) -> str:
    if not settings.pa_eval_auth_secret:
        raise AuthSessionConfigError()

    digest = hmac.new(
        settings.pa_eval_auth_secret.encode("utf-8"),
        segment.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _base64url_encode(digest)


def create_access_token(payload: dict[str, Any], settings: Settings) -> str:
    signed_payload = {**payload, "iat": int(time.time())}
    encoded = _base64url_encode(
        json.dumps(
            signed_payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    )
    signature = _sign(encoded, settings)
    return f"pa.{encoded}.{signature}"


def parse_access_token(
    access_token: str | None,
    settings: Settings,
) -> dict[str, Any] | None:
    if not access_token or not access_token.startswith("pa."):
        return None

    parts = access_token.split(".")
    if len(parts) != 3:
        return None

    _, encoded, signature = parts
    expected_signature = _sign(encoded, settings)
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        decoded = _base64url_decode(encoded).decode("utf-8")
        payload = json.loads(decoded)
    except (ValueError, json.JSONDecodeError):
        return None

    return payload if isinstance(payload, dict) else None


async def get_current_user_context(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> CurrentUserContext:
    token = request.cookies.get(settings.pa_eval_auth_cookie_name)
    payload = parse_access_token(token, settings)
    user_id = payload.get("langfuseUserId") if payload else None
    email = payload.get("email") if payload else None

    if isinstance(user_id, str) and user_id and isinstance(email, str) and email:
        return CurrentUserContext(
            user_id=user_id,
            email=email,
            name=payload.get("name") if payload else None,
            login=payload.get("login") if payload else None,
            provider=payload.get("provider") if payload else None,
        )

    raise AuthRequiredError()
