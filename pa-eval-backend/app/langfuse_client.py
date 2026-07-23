from typing import Any

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.errors import BusinessError, LangfuseConfigError, LangfuseUpstreamError


class LangfuseAdminClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.langfuse_base_url.rstrip("/")
        self._admin_api_key = settings.effective_langfuse_admin_api_key
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
            message = LangfuseAdminClient._extract_error_message(exc.response)
            raise LangfuseUpstreamError(message=message, status_code=502) from exc
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError(message="Langfuse 服务暂不可用") from exc

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


async def get_langfuse_client(
    settings: Settings = Depends(get_settings),
) -> LangfuseAdminClient:
    return LangfuseAdminClient(settings)
