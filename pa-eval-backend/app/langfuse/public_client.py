from base64 import b64encode
import json
from typing import Any

import httpx

from app.errors import (
    LangfuseConfigError,
    LangfuseOrganizationConfigError,
    LangfuseUpstreamError,
)


LANGFUSE_LLM_ADAPTERS = {
    "anthropic",
    "openai",
    "azure",
    "bedrock",
    "google-vertex-ai",
    "google-ai-studio",
}
LLM_ADAPTER_ALIASES = {"openai-compatible": "openai"}


def normalize_llm_adapter(adapter: str) -> str:
    normalized = LLM_ADAPTER_ALIASES.get(adapter.strip().lower(), adapter.strip().lower())
    if normalized not in LANGFUSE_LLM_ADAPTERS:
        raise ValueError(f"Langfuse 不支持 LLM adapter：{adapter}")
    return normalized


class LangfusePublicClient:
    """Small typed-boundary client for documented Langfuse public resources."""

    def __init__(
        self,
        *,
        base_url: str,
        public_key: str = "",
        secret_key: str = "",
        organization_api_key: str = "",
        timeout: float = 20,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._public_key = public_key
        self._secret_key = secret_key
        self._organization_api_key = organization_api_key
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            transport=transport,
        )

    async def __aenter__(self) -> "LangfusePublicClient":
        return self

    async def __aexit__(self, *_args: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def list_llm_connections(
        self,
        *,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            "/api/public/llm-connections",
            params={"page": max(1, page), "limit": min(100, max(1, limit))},
        )

    async def upsert_llm_connection(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._project_request(
            "PUT",
            "/api/public/llm-connections",
            json=payload,
        )

    async def list_all_llm_connections(self) -> list[dict[str, Any]]:
        return await self._list_all_pages(self.list_llm_connections)

    async def delete_llm_connection(self, connection_id: str) -> dict[str, Any]:
        return await self._project_request(
            "DELETE",
            f"/api/public/llm-connections/{connection_id}",
            allow_not_found=True,
        )

    async def list_models(
        self,
        *,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            "/api/public/models",
            params={"page": max(1, page), "limit": min(100, max(1, limit))},
        )

    async def create_model(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            "/api/public/models",
            json=payload,
        )

    async def get_model(self, model_id: str) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            f"/api/public/models/{model_id}",
        )

    async def list_all_models(self) -> list[dict[str, Any]]:
        return await self._list_all_pages(self.list_models)

    async def delete_model(self, model_id: str) -> dict[str, Any]:
        return await self._project_request(
            "DELETE",
            f"/api/public/models/{model_id}",
            allow_not_found=True,
        )

    async def list_evaluators(
        self,
        *,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            "/api/public/unstable/evaluators",
            params={"page": max(1, page), "limit": min(100, max(1, limit))},
        )

    async def create_evaluator(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            "/api/public/unstable/evaluators",
            json=payload,
        )

    async def get_evaluator(self, evaluator_id: str) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            f"/api/public/unstable/evaluators/{evaluator_id}",
        )

    async def delete_evaluator(self, evaluator_id: str) -> dict[str, Any]:
        return await self._project_request(
            "DELETE",
            f"/api/public/unstable/evaluators/{evaluator_id}",
            allow_not_found=True,
        )

    async def list_traces(
        self,
        *,
        page: int = 1,
        limit: int = 50,
        fields: str | None = None,
        filter: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "page": max(1, page),
            "limit": min(100, max(1, limit)),
        }
        if fields:
            params["fields"] = fields
        if filter is not None:
            params["filter"] = self._json_query_value(filter)
        return await self._project_request(
            "GET",
            "/api/public/traces",
            params=params,
        )

    async def get_trace(
        self,
        trace_id: str,
        *,
        fields: str | None = None,
    ) -> dict[str, Any]:
        params = {"fields": fields} if fields else None
        return await self._project_request(
            "GET",
            f"/api/public/traces/{trace_id}",
            params=params,
        )

    async def upsert_trace(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            "/api/public/traces",
            json=payload,
        )

    async def list_observations(
        self,
        *,
        cursor: str | None = None,
        limit: int = 50,
        fields: str | None = None,
        filter: list[dict[str, Any]] | None = None,
        expand_metadata: list[str] | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": min(1000, max(1, limit))}
        if cursor:
            params["cursor"] = cursor
        if fields:
            params["fields"] = fields
        if filter is not None:
            params["filter"] = self._json_query_value(filter)
        if expand_metadata:
            params["expandMetadata"] = ",".join(expand_metadata)
        return await self._project_request(
            "GET",
            "/api/public/v2/observations",
            params=params,
        )

    async def query_metrics(self, query: dict[str, Any]) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            "/api/public/v2/metrics",
            params={"query": self._json_query_value(query)},
        )

    async def list_annotation_queues(
        self,
        *,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            "/api/public/annotation-queues",
            params={"page": max(1, page), "limit": min(100, max(1, limit))},
        )

    async def create_annotation_queue(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            "/api/public/annotation-queues",
            json=payload,
        )

    async def get_annotation_queue(self, queue_id: str) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            f"/api/public/annotation-queues/{queue_id}",
        )

    async def list_annotation_queue_items(
        self,
        queue_id: str,
        *,
        page: int = 1,
        limit: int = 50,
        status: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "queueId": queue_id,
            "page": max(1, page),
            "limit": min(100, max(1, limit)),
        }
        if status is not None:
            params["status"] = status
        return await self._project_request(
            "GET",
            f"/api/public/annotation-queues/{queue_id}/items",
            params=params,
        )

    async def create_annotation_queue_item(
        self,
        queue_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            f"/api/public/annotation-queues/{queue_id}/items",
            json=payload,
        )

    async def get_annotation_queue_item(
        self,
        queue_id: str,
        item_id: str,
    ) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            f"/api/public/annotation-queues/{queue_id}/items/{item_id}",
        )

    async def update_annotation_queue_item(
        self,
        queue_id: str,
        item_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._project_request(
            "PATCH",
            f"/api/public/annotation-queues/{queue_id}/items/{item_id}",
            json=payload,
        )

    async def delete_annotation_queue_item(
        self,
        queue_id: str,
        item_id: str,
    ) -> dict[str, Any]:
        return await self._project_request(
            "DELETE",
            f"/api/public/annotation-queues/{queue_id}/items/{item_id}",
            allow_not_found=True,
        )

    async def list_annotation_queue_assignments(
        self,
        queue_id: str,
        *,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            f"/api/public/annotation-queues/{queue_id}/assignments",
            params={"page": max(1, page), "limit": min(100, max(1, limit))},
        )

    async def create_annotation_queue_assignment(
        self,
        queue_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            f"/api/public/annotation-queues/{queue_id}/assignments",
            json={"userId": user_id},
        )

    async def delete_annotation_queue_assignment(
        self,
        queue_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        return await self._project_request(
            "DELETE",
            f"/api/public/annotation-queues/{queue_id}/assignments",
            json={"userId": user_id},
            allow_not_found=True,
        )

    async def list_all_annotation_queues(self) -> list[dict[str, Any]]:
        return await self._list_all_pages(self.list_annotation_queues)

    async def list_all_annotation_queue_items(
        self,
        queue_id: str,
        *,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        page = 1
        items: list[dict[str, Any]] = []
        while True:
            response = await self.list_annotation_queue_items(
                queue_id, page=page, limit=100, status=status
            )
            data = response.get("data") or []
            if not isinstance(data, list):
                break
            items.extend(item for item in data if isinstance(item, dict))
            meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
            total_pages = int(meta.get("totalPages") or 0)
            if not data or len(data) < 100 or (total_pages and page >= total_pages):
                break
            page += 1
        return items

    async def list_all_annotation_queue_assignments(
        self,
        queue_id: str,
    ) -> list[dict[str, Any]]:
        page = 1
        assignments: list[dict[str, Any]] = []
        while True:
            response = await self.list_annotation_queue_assignments(
                queue_id, page=page, limit=100
            )
            data = response.get("data") or []
            if not isinstance(data, list):
                break
            assignments.extend(item for item in data if isinstance(item, dict))
            meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
            total_pages = int(meta.get("totalPages") or 0)
            if not data or len(data) < 100 or (total_pages and page >= total_pages):
                break
            page += 1
        return assignments

    async def list_score_configs(
        self,
        *,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            "/api/public/score-configs",
            params={"page": max(1, page), "limit": min(100, max(1, limit))},
        )

    async def create_score_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            "/api/public/score-configs",
            json=payload,
        )

    async def get_score_config(self, config_id: str) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            f"/api/public/score-configs/{config_id}",
        )

    async def update_score_config(
        self,
        config_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._project_request(
            "PATCH",
            f"/api/public/score-configs/{config_id}",
            json=payload,
        )

    async def list_all_score_configs(self) -> list[dict[str, Any]]:
        return await self._list_all_pages(self.list_score_configs)

    async def list_scores(
        self,
        *,
        cursor: str | None = None,
        limit: int = 50,
        fields: str | None = None,
        name: str | None = None,
        data_type: str | None = None,
        value: str | None = None,
        value_min: float | None = None,
        value_max: float | None = None,
        queue_id: str | None = None,
        trace_id: str | None = None,
        observation_id: str | None = None,
        source: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": min(100, max(1, limit))}
        optional_params = {
            "cursor": cursor,
            "fields": fields,
            "name": name,
            "dataType": data_type,
            "value": value,
            "valueMin": value_min,
            "valueMax": value_max,
            "queueId": queue_id,
            "traceId": trace_id,
            "observationId": observation_id,
            "source": source,
        }
        params.update(
            {key: value for key, value in optional_params.items() if value is not None}
        )
        return await self._project_request(
            "GET",
            "/api/public/v3/scores",
            params=params,
        )

    async def list_datasets(
        self,
        *,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            "/api/public/v2/datasets",
            params={"page": max(1, page), "limit": min(100, max(1, limit))},
        )

    async def create_dataset(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            "/api/public/v2/datasets",
            json=payload,
        )

    async def get_dataset(self, dataset_name: str) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            f"/api/public/v2/datasets/{dataset_name}",
        )

    async def list_dataset_items(
        self,
        *,
        dataset_name: str | None = None,
        page: int = 1,
        limit: int = 50,
        source_trace_id: str | None = None,
        source_observation_id: str | None = None,
        version: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "page": max(1, page),
            "limit": min(100, max(1, limit)),
        }
        optional_params = {
            "datasetName": dataset_name,
            "sourceTraceId": source_trace_id,
            "sourceObservationId": source_observation_id,
            "version": version,
        }
        params.update(
            {key: value for key, value in optional_params.items() if value is not None}
        )
        return await self._project_request(
            "GET",
            "/api/public/dataset-items",
            params=params,
        )

    async def upsert_dataset_item(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._project_request(
            "POST",
            "/api/public/dataset-items",
            json=payload,
        )

    async def get_dataset_item(self, item_id: str) -> dict[str, Any]:
        return await self._project_request(
            "GET",
            f"/api/public/dataset-items/{item_id}",
        )

    async def delete_dataset_item(self, item_id: str) -> dict[str, Any]:
        return await self._project_request(
            "DELETE",
            f"/api/public/dataset-items/{item_id}",
            allow_not_found=True,
        )

    # -- Organization-scoped resources --

    async def list_organization_projects(self) -> dict[str, Any]:
        return await self._organization_request(
            "GET",
            "/api/public/organizations/projects",
        )

    async def list_all_organization_projects(self) -> list[dict[str, Any]]:
        response = await self.list_organization_projects()
        data = response.get("data") or []
        return [item for item in data if isinstance(item, dict)]

    async def create_project(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._organization_request(
            "POST",
            "/api/public/projects",
            json=payload,
        )

    async def update_project(
        self,
        project_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._organization_request(
            "PUT",
            f"/api/public/projects/{project_id}",
            json=payload,
        )

    async def delete_project(self, project_id: str) -> dict[str, Any]:
        return await self._organization_request(
            "DELETE",
            f"/api/public/projects/{project_id}",
            allow_not_found=True,
        )

    async def list_organization_memberships(self) -> dict[str, Any]:
        return await self._organization_request(
            "GET",
            "/api/public/organizations/memberships",
        )

    async def list_all_organization_memberships(self) -> list[dict[str, Any]]:
        response = await self.list_organization_memberships()
        data = response.get("data") or []
        return [item for item in data if isinstance(item, dict)]

    async def upsert_organization_membership(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._organization_request(
            "PUT",
            "/api/public/organizations/memberships",
            json=payload,
        )

    async def delete_organization_membership(
        self,
        user_id: str,
    ) -> dict[str, Any]:
        return await self._organization_request(
            "DELETE",
            "/api/public/organizations/memberships",
            json={"userId": user_id},
            allow_not_found=True,
        )

    async def list_project_memberships(self, project_id: str) -> dict[str, Any]:
        return await self._organization_request(
            "GET",
            f"/api/public/projects/{project_id}/memberships",
        )

    async def list_all_project_memberships(
        self,
        project_id: str,
    ) -> list[dict[str, Any]]:
        response = await self.list_project_memberships(project_id)
        data = response.get("data") or []
        return [item for item in data if isinstance(item, dict)]

    async def upsert_project_membership(
        self,
        project_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._organization_request(
            "PUT",
            f"/api/public/projects/{project_id}/memberships",
            json=payload,
        )

    async def delete_project_membership(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        return await self._organization_request(
            "DELETE",
            f"/api/public/projects/{project_id}/memberships",
            json={"userId": user_id},
            allow_not_found=True,
        )

    async def list_project_api_keys(self, project_id: str) -> dict[str, Any]:
        return await self._organization_request(
            "GET",
            f"/api/public/projects/{project_id}/apiKeys",
        )

    async def create_project_api_key(
        self,
        project_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._organization_request(
            "POST",
            f"/api/public/projects/{project_id}/apiKeys",
            json=payload,
        )

    async def delete_project_api_key(
        self,
        project_id: str,
        api_key_id: str,
    ) -> dict[str, Any]:
        return await self._organization_request(
            "DELETE",
            f"/api/public/projects/{project_id}/apiKeys/{api_key_id}",
            allow_not_found=True,
        )

    async def _project_request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        allow_not_found: bool = False,
    ) -> dict[str, Any]:
        if not self._public_key or not self._secret_key:
            raise LangfuseConfigError()
        encoded = b64encode(
            f"{self._public_key}:{self._secret_key}".encode("utf-8")
        ).decode("ascii")
        return await self._request(
            method,
            path,
            headers={"Authorization": f"Basic {encoded}"},
            params=params,
            json=json,
            allow_not_found=allow_not_found,
        )

    async def _list_all_pages(self, fetch_page: Any) -> list[dict[str, Any]]:
        page = 1
        resources: list[dict[str, Any]] = []
        while True:
            response = await fetch_page(page=page, limit=100)
            data = response.get("data") or []
            if not isinstance(data, list):
                raise LangfuseUpstreamError("Langfuse 返回了无效分页数据")
            resources.extend(item for item in data if isinstance(item, dict))
            meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
            total_pages = int(meta.get("totalPages") or meta.get("total_pages") or 0)
            if not data or len(data) < 100 or (total_pages and page >= total_pages):
                return resources
            page += 1

    @staticmethod
    def _json_query_value(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    async def _organization_request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        allow_not_found: bool = False,
    ) -> dict[str, Any]:
        if not self._organization_api_key:
            raise LangfuseOrganizationConfigError()
        return await self._request(
            method,
            path,
            headers={"Authorization": f"Bearer {self._organization_api_key}"},
            json=json,
            allow_not_found=allow_not_found,
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        headers: dict[str, str],
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        allow_not_found: bool = False,
    ) -> dict[str, Any]:
        try:
            response = await self._client.request(
                method,
                path,
                headers=headers,
                params=params,
                json=json,
            )
            if allow_not_found and response.status_code == 404:
                return {}
            response.raise_for_status()
            if not response.content:
                return {}
            payload = response.json()
            return payload if isinstance(payload, dict) else {"data": payload}
        except httpx.HTTPStatusError as exc:
            raise LangfuseUpstreamError(
                message="Langfuse 服务请求失败",
                status_code=502,
            ) from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise LangfuseUpstreamError(
                message="Langfuse 服务暂不可用",
                status_code=502,
            ) from exc
