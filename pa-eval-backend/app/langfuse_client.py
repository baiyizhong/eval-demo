from collections.abc import AsyncIterator
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import math
from typing import Any
from base64 import b64encode

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.errors import (
    BusinessError,
    LangfuseConfigError,
    LangfuseProjectAuthenticationError,
    LangfuseProjectCredentialsError,
    LangfuseTransientUpstreamError,
    LangfuseUpstreamError,
)
from app.score_configs import (
    PA_BOOLEAN_SCORE_CONFIG_REPAIR_MARKER,
    langfuse_boolean_categories,
)


class LangfuseRateLimitError(LangfuseUpstreamError):
    retryable = True
    error_code = "PROVIDER_RATE_LIMIT"

    def __init__(self, *, retry_after_seconds: float) -> None:
        super().__init__(
            message="Langfuse 服务请求过于频繁",
            status_code=429,
            upstream_status_code=429,
        )
        self.retry_after_seconds = _safe_retry_after_seconds(retry_after_seconds)
        self.response = httpx.Response(429)


class _LangfuseConflictError(RuntimeError):
    pass


class LangfuseAdminClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.langfuse_base_url.rstrip("/")
        self._admin_api_key = settings.effective_langfuse_admin_api_key
        self._timeout = settings.pa_eval_api_timeout
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
        )

    async def __aenter__(self) -> "LangfuseAdminClient":
        return self

    async def __aexit__(self, *_args: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def list_organizations(self) -> dict[str, Any]:
        return await self._request("GET", "/api/admin/organizations")

    async def create_organization(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "/api/admin/organizations", json=payload)

    async def get_organization(self, organization_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/admin/organizations/{organization_id}")

    async def update_organization(
        self, organization_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._request(
            "PUT",
            f"/api/admin/organizations/{organization_id}",
            json=payload,
        )

    async def create_score(
        self,
        public_key: str,
        secret_key: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            "/api/public/scores",
            public_key,
            secret_key,
            payload,
        )

    async def update_score_config(
        self,
        public_key: str,
        secret_key: str,
        config_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._project_request(
            "PATCH",
            f"/api/public/score-configs/{config_id}",
            public_key,
            secret_key,
            payload,
        )

    async def _project_request(
        self,
        method: str,
        path: str,
        public_key: str,
        secret_key: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        credentials = b64encode(f"{public_key}:{secret_key}".encode("utf-8")).decode(
            "ascii"
        )
        headers = {"Authorization": f"Basic {credentials}"}
        try:
            response = await self._client.request(
                method,
                path,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            if response.content:
                return response.json()
            return {}
        except httpx.HTTPStatusError as exc:
            message = self._extract_error_message(exc.response)
            raise LangfuseUpstreamError(message=message, status_code=502) from exc
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError(message="Langfuse 服务暂不可用") from exc

    async def _request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | None = None,
        allow_not_found: bool = False,
    ) -> dict[str, Any] | None:
        if not self._admin_api_key:
            raise LangfuseConfigError()

        headers = {"Authorization": f"Bearer {self._admin_api_key}"}
        try:
            response = await self._client.request(
                method,
                path,
                headers=headers,
                json=json,
            )
            response.raise_for_status()
            if response.content:
                return response.json()
            return {}
        except httpx.HTTPStatusError as exc:
            if allow_not_found and exc.response.status_code == 404:
                return None
            message = self._extract_error_message(exc.response)
            raise LangfuseUpstreamError(message=message, status_code=502) from exc
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError(message="Langfuse 服务暂不可用") from exc

    @staticmethod
    def _extract_error_message(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict):
            value = payload.get("message") or payload.get("error")
            if value:
                return str(value)

        return f"Langfuse 请求失败：HTTP {response.status_code}"


class LangfuseProjectApiClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.langfuse_base_url.rstrip("/")
        self._admin_api_key = settings.effective_langfuse_admin_api_key
        self._timeout = settings.pa_eval_api_timeout

    async def list_llm_connections(self, project_id: str) -> list[dict[str, Any]]:
        payload = await self._request(
            "GET",
            "/api/public/llm-connections",
            project_id=project_id,
            params={"page": 1, "limit": 100},
        )
        return [
            self._to_llm_connection_payload(item)
            for item in payload.get("data", [])
            if isinstance(item, dict)
        ]

    async def upsert_llm_connection(
        self,
        project_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        secret_key = payload.get("secretKey")
        if not secret_key:
            raise BusinessError(
                code=1015,
                message="创建或更新 LLM 连接需要填写密钥",
                status_code=400,
            )

        response = await self._request(
            "PUT",
            "/api/public/llm-connections",
            project_id=project_id,
            json={
                "provider": payload["provider"],
                "adapter": payload["adapter"],
                "secretKey": secret_key,
                "baseURL": payload.get("baseUrl") or None,
                "customModels": payload.get("customModels") or [],
                "withDefaultModels": bool(payload.get("withDefaultModels", True)),
            },
        )
        return self._to_llm_connection_payload(response)

    async def delete_llm_connection(
        self,
        project_id: str,
        connection_id: str,
    ) -> dict[str, str]:
        await self._request(
            "DELETE",
            f"/api/public/llm-connections/{connection_id}",
            project_id=project_id,
        )
        return {"id": connection_id}

    async def create_score(
        self,
        public_key: str,
        secret_key: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not public_key.strip() or not secret_key.strip():
            raise LangfuseProjectCredentialsError()
        score_id = payload.get("id")
        if not isinstance(score_id, str) or not score_id:
            raise ValueError("score payload id is required")
        try:
            return await self._public_request(
                "POST",
                "/api/public/scores",
                public_key=public_key,
                secret_key=secret_key,
                json=payload,
            )
        except _LangfuseConflictError as conflict:
            try:
                existing = await self._public_request(
                    "GET",
                    f"/api/public/scores/{score_id}",
                    public_key=public_key,
                    secret_key=secret_key,
                )
            except (
                LangfuseRateLimitError,
                LangfuseTransientUpstreamError,
                LangfuseProjectAuthenticationError,
            ):
                raise
            except (LangfuseUpstreamError, _LangfuseConflictError) as error:
                raise LangfuseUpstreamError(
                    message="Langfuse Score 冲突无法确认",
                    status_code=502,
                ) from error
            if existing.get("id") == score_id:
                return {"id": score_id, "duplicate": True}
            raise LangfuseUpstreamError(
                message="Langfuse Score 冲突无法确认",
                status_code=502,
            ) from conflict

    async def _request(
        self,
        method: str,
        path: str,
        project_id: str,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self._admin_api_key:
            raise LangfuseConfigError()

        headers = {
            "Authorization": f"Bearer {self._admin_api_key}",
            "x-langfuse-admin-api-key": self._admin_api_key,
            "x-langfuse-project-id": project_id,
        }
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url,
                headers=headers,
                timeout=self._timeout,
            ) as client:
                response = await client.request(
                    method,
                    path,
                    json=json,
                    params=params,
                )
                response.raise_for_status()
                if response.content:
                    return response.json()
                return {}
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise LangfuseRateLimitError(
                    retry_after_seconds=_retry_after_seconds(exc.response)
                ) from exc
            message = LangfuseAdminClient._extract_error_message(exc.response)
            raise LangfuseUpstreamError(message=message, status_code=502) from exc
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError(message="Langfuse 服务暂不可用") from exc

    async def _public_request(
        self,
        method: str,
        path: str,
        *,
        public_key: str,
        secret_key: str,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url,
                auth=httpx.BasicAuth(public_key, secret_key),
                timeout=self._timeout,
            ) as client:
                response = await client.request(method, path, json=json)
                response.raise_for_status()
                if response.content:
                    return response.json()
                return {}
        except httpx.HTTPStatusError as exc:
            upstream_status = exc.response.status_code
            if upstream_status == 409:
                raise _LangfuseConflictError("Langfuse Score conflict") from exc
            if upstream_status == 429:
                raise LangfuseRateLimitError(
                    retry_after_seconds=_retry_after_seconds(exc.response)
                ) from exc
            if upstream_status in {401, 403}:
                raise LangfuseProjectAuthenticationError(
                    upstream_status_code=upstream_status
                ) from exc
            if 500 <= upstream_status < 600:
                raise LangfuseTransientUpstreamError(
                    error_code="PROVIDER_UNAVAILABLE",
                    upstream_status_code=upstream_status,
                ) from exc
            raise LangfuseUpstreamError(
                message="Langfuse Score 请求被拒绝",
                upstream_status_code=upstream_status,
            ) from exc
        except httpx.TimeoutException as exc:
            raise LangfuseTransientUpstreamError(
                error_code="PROVIDER_TIMEOUT"
            ) from exc
        except httpx.ConnectError as exc:
            raise LangfuseTransientUpstreamError(
                error_code="PROVIDER_UNAVAILABLE"
            ) from exc
        except (httpx.NetworkError, httpx.RemoteProtocolError) as exc:
            raise LangfuseTransientUpstreamError(
                error_code="PROVIDER_UNAVAILABLE"
            ) from exc
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError(
                message="Langfuse Score 请求失败"
            ) from exc

    @staticmethod
    def _to_llm_connection_payload(row: dict[str, Any]) -> dict[str, Any]:
        custom_models = row.get("customModels") or []
        return {
            "id": row["id"],
            "provider": row["provider"],
            "adapter": row["adapter"],
            "displaySecretKey": row.get("displaySecretKey") or "",
            "baseUrl": row.get("baseURL") or "",
            "customModels": custom_models if isinstance(custom_models, list) else [],
            "withDefaultModels": bool(row.get("withDefaultModels")),
        }


def _retry_after_seconds(response: httpx.Response) -> float:
    value = response.headers.get("Retry-After", "").strip()
    try:
        return _safe_retry_after_seconds(float(value))
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return 1.0
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())


def _safe_retry_after_seconds(value: float) -> float:
    if not math.isfinite(value) or value < 0:
        return 1.0
    return value


async def get_langfuse_client(
    settings: Settings = Depends(get_settings),
) -> AsyncIterator[LangfuseAdminClient]:
    client = LangfuseAdminClient(settings)
    try:
        yield client
    finally:
        await client.aclose()


async def repair_legacy_boolean_score_configs(
    langfuse_client: LangfuseAdminClient,
    public_key: str,
    secret_key: str,
    score_requests: list[dict[str, Any]],
) -> None:
    config_ids = list(
        dict.fromkeys(
            str(score_request.get("configId") or "")
            for score_request in score_requests
            if score_request.get(PA_BOOLEAN_SCORE_CONFIG_REPAIR_MARKER)
            and score_request.get("configId")
        )
    )
    for config_id in config_ids:
        await langfuse_client.update_score_config(
            public_key,
            secret_key,
            config_id,
            {"categories": langfuse_boolean_categories()},
        )
