from typing import Any

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.errors import LangfuseConfigError, LangfuseUpstreamError


class LangfuseAdminClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.langfuse_base_url.rstrip("/")
        self._admin_api_key = settings.langfuse_admin_api_key
        self._timeout = settings.pa_eval_api_timeout

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

    async def _request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self._admin_api_key:
            raise LangfuseConfigError()

        headers = {"Authorization": f"Bearer {self._admin_api_key}"}
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url,
                headers=headers,
                timeout=self._timeout,
            ) as client:
                response = await client.request(method, path, json=json)
                response.raise_for_status()
                if response.content:
                    return response.json()
                return {}
        except httpx.HTTPStatusError as exc:
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
) -> LangfuseAdminClient:
    return LangfuseAdminClient(settings)
