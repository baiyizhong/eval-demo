from collections.abc import AsyncIterator
from typing import Any
from base64 import b64encode

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.errors import LangfuseConfigError, LangfuseUpstreamError
from app.score_configs import (
    PA_BOOLEAN_SCORE_CONFIG_REPAIR_MARKER,
    langfuse_boolean_categories,
)


class LangfuseAdminClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.langfuse_base_url.rstrip("/")
        self._admin_api_key = settings.langfuse_admin_api_key
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
