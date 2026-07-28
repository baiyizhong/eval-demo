"""Langfuse Public API adapter for the existing PA datasets contract.

Reads and writes flow through ``LangfusePublicClient`` when Langfuse exposes a
mutation. Dataset metadata update/delete have no Public API equivalent, so PA
stores display overlays and soft-delete markers in ``pa_resource_extensions``.
"""

from typing import Any, Protocol

from app.consolidation.models import ResourceExtensionType
from app.errors import BusinessError


_DATASET_NOT_FOUND_CODE = 1011
_DATASET_NOT_FOUND_MESSAGE = "数据集不存在或无访问权限"


class _ProjectClientProvider(Protocol):
    async def project_public_client_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> Any: ...

    async def get_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType | str,
    ) -> dict[str, Any] | None: ...

    async def upsert_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType | str,
        payload: dict[str, Any],
        actor: str,
        schema_version: int = 1,
    ) -> dict[str, Any]: ...


class LangfuseDatasetsAdapter:
    def __init__(self, project_clients: _ProjectClientProvider) -> None:
        self._project_clients = project_clients

    async def list_datasets(
        self,
        project_id: str,
        user_id: str,
        *,
        page: int = 1,
        page_size: int = 10,
        keyword: str | None = None,
        dataset_type: str | None = None,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            datasets = await client.list_datasets(page=1, limit=100)
            mapped = []
            for item in _page_data(datasets):
                if await self._is_dataset_deleted(project_id, item.get("id", "")):
                    continue
                mapped.append(
                    await self._apply_dataset_overlay(
                        project_id,
                        _to_dataset_payload(item, project_id),
                    )
                )
            if keyword:
                mapped = [item for item in mapped if keyword in item["name"]]
            if dataset_type:
                mapped = [item for item in mapped if item["type"] == dataset_type]
            for item in mapped:
                item["itemCount"] = await self._item_count(
                    client, item["name"]
                )
                item["runCount"] = 0
            mapped.sort(
                key=lambda value: (value["updatedAt"], value["createdAt"], value["id"]),
                reverse=True,
            )
            total = len(mapped)
            start = (page - 1) * page_size
            return {"total": total, "datas": mapped[start : start + page_size]}

    async def get_dataset(
        self,
        project_id: str,
        user_id: str,
        dataset_id: str,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            dataset = await self._get_dataset_by_id(client, dataset_id)
            await self._raise_if_dataset_deleted(project_id, dataset_id)
            payload = await self._apply_dataset_overlay(
                project_id,
                _to_dataset_payload(dataset, project_id),
            )
            payload["itemCount"] = await self._item_count(client, dataset["name"])
            payload["runCount"] = 0
            return payload

    async def create_dataset(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            create_payload = {
                "name": payload["name"],
                "description": payload.get("description") or "",
                "metadata": payload.get("metadata") or {},
            }
            if _is_json_schema(payload.get("inputSchema")):
                create_payload["inputSchema"] = payload["inputSchema"]
            if _is_json_schema(payload.get("expectedOutputSchema")):
                create_payload["expectedOutputSchema"] = payload[
                    "expectedOutputSchema"
                ]
            created = await client.create_dataset(create_payload)
            result = _to_dataset_payload(created, project_id)
            result["itemCount"] = 0
            result["runCount"] = 0
            return result

    async def is_dataset_name_available(
        self,
        project_id: str,
        user_id: str,
        name: str,
    ) -> bool:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            response = await client.list_datasets(page=1, limit=100)
            existing = {
                dataset.get("name")
                for dataset in _page_data(response)
                if isinstance(dataset, dict)
            }
            return name not in existing

    async def update_dataset(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            dataset = await self._get_dataset_by_id(client, dataset_id)
        await self._raise_if_dataset_deleted(project_id, dataset_id)

        native_payload = _to_dataset_payload(dataset, project_id)
        metadata = dict(native_payload.get("metadata") or {})
        if payload.get("metadata") and isinstance(payload["metadata"], dict):
            metadata.update(payload["metadata"])
        if payload.get("type"):
            metadata["type"] = payload["type"]
        overlay_payload: dict[str, Any] = {"metadata": metadata}
        for key in ("name", "description", "type"):
            if key in payload and payload.get(key) is not None:
                overlay_payload[key] = payload[key]
        await self._upsert_resource_extension(
            project_id=project_id,
            resource_type="DATASET",
            resource_id=dataset_id,
            extension_type=ResourceExtensionType.RESOURCE_DISPLAY_OVERRIDE,
            payload=overlay_payload,
            actor=user_id,
        )
        return await self._apply_dataset_overlay(project_id, native_payload)

    async def delete_dataset(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> None:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await self._get_dataset_by_id(client, dataset_id)
        await self._upsert_resource_extension(
            project_id=project_id,
            resource_type="DATASET",
            resource_id=dataset_id,
            extension_type=ResourceExtensionType.RESOURCE_SOFT_DELETE,
            payload={"deleted": True},
            actor=user_id,
        )

    async def get_dataset_metrics(
        self,
        project_id: str,
        user_id: str,
        dataset_id: str,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await self._raise_if_dataset_deleted(project_id, dataset_id)
            dataset = await self._get_dataset_by_id(client, dataset_id)
            counts = await self._status_counts(client, dataset["name"], keyword=None)
            return {
                "total": counts["total"],
                "active": counts["active"],
                "archived": counts["archived"],
                "updatedAt": _to_dataset_payload(dataset, project_id)["updatedAt"],
                "specific": [
                    {"label": "来源", "value": "Langfuse"},
                    {"label": "运行数", "value": "0"},
                ],
            }

    async def count_dataset_item_statuses(
        self,
        project_id: str,
        user_id: str,
        dataset_id: str,
        *,
        keyword: str | None = None,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await self._raise_if_dataset_deleted(project_id, dataset_id)
            dataset = await self._get_dataset_by_id(client, dataset_id)
            return await self._status_counts(client, dataset["name"], keyword=keyword)

    async def list_dataset_items(
        self,
        project_id: str,
        user_id: str,
        dataset_id: str,
        *,
        page: int = 1,
        page_size: int = 10,
        keyword: str | None = None,
        status: list[str] | None = None,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await self._raise_if_dataset_deleted(project_id, dataset_id)
            dataset = await self._get_dataset_by_id(client, dataset_id)
            dataset_name = dataset["name"]
            items = await self._all_dataset_items(client, dataset_name)
            mapped = [_to_dataset_item_payload(item, project_id) for item in items]
            if keyword:
                mapped = [item for item in mapped if _item_matches_keyword(item, keyword)]
            if status:
                status_set = set(status)
                mapped = [item for item in mapped if item["status"] in status_set]
            total = len(mapped)
            start = (page - 1) * page_size
            return {"total": total, "datas": mapped[start : start + page_size]}

    async def create_dataset_item(
        self,
        project_id: str,
        user_id: str,
        dataset_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await self._raise_if_dataset_deleted(project_id, dataset_id)
            dataset_name = (await self._get_dataset_by_id(client, dataset_id))["name"]
            created = await client.upsert_dataset_item(
                _dataset_item_payload(dataset_name, dataset_id, payload)
            )
            return _to_dataset_item_payload(created, project_id)

    async def update_dataset_item(
        self,
        project_id: str,
        user_id: str,
        dataset_id: str,
        item_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await self._raise_if_dataset_deleted(project_id, dataset_id)
            dataset_name = (await self._get_dataset_by_id(client, dataset_id))["name"]
            updated = await client.upsert_dataset_item(
                _dataset_item_payload(dataset_name, dataset_id, payload, item_id=item_id)
            )
            return _to_dataset_item_payload(updated, project_id)

    async def archive_dataset_item(
        self,
        project_id: str,
        user_id: str,
        dataset_id: str,
        item_id: str,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await self._raise_if_dataset_deleted(project_id, dataset_id)
            dataset_name = (await self._get_dataset_by_id(client, dataset_id))["name"]
            archived = await client.upsert_dataset_item(
                _dataset_item_payload(
                    dataset_name,
                    dataset_id,
                    {"status": "ARCHIVED"},
                    item_id=item_id,
                )
            )
            return _to_dataset_item_payload(archived, project_id)

    async def delete_dataset_item(
        self,
        project_id: str,
        user_id: str,
        dataset_id: str,
        item_id: str,
    ) -> None:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await self._raise_if_dataset_deleted(project_id, dataset_id)
            await client.delete_dataset_item(item_id)

    async def _get_dataset_by_id(
        self,
        client: Any,
        dataset_id: str,
    ) -> dict[str, Any]:
        response = await client.list_datasets(page=1, limit=100)
        for dataset in _page_data(response):
            if dataset.get("id") == dataset_id:
                return dataset
        raise BusinessError(
            code=_DATASET_NOT_FOUND_CODE,
            message=_DATASET_NOT_FOUND_MESSAGE,
            status_code=404,
        )

    async def _apply_dataset_overlay(
        self,
        project_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        extension = await self._get_resource_extension(
            project_id=project_id,
            resource_type="DATASET",
            resource_id=payload["id"],
            extension_type=ResourceExtensionType.RESOURCE_DISPLAY_OVERRIDE,
        )
        overlay = extension.get("payload") if extension else None
        if not isinstance(overlay, dict):
            return payload
        result = dict(payload)
        for key in ("name", "description", "type"):
            if overlay.get(key) is not None:
                result[key] = overlay[key]
        metadata = dict(result.get("metadata") or {})
        if isinstance(overlay.get("metadata"), dict):
            metadata.update(overlay["metadata"])
        if result.get("type"):
            metadata["type"] = result["type"]
        result["metadata"] = metadata
        return result

    async def _is_dataset_deleted(self, project_id: str, dataset_id: str) -> bool:
        if not dataset_id:
            return False
        extension = await self._get_resource_extension(
            project_id=project_id,
            resource_type="DATASET",
            resource_id=dataset_id,
            extension_type=ResourceExtensionType.RESOURCE_SOFT_DELETE,
        )
        payload = extension.get("payload") if extension else None
        return isinstance(payload, dict) and payload.get("deleted") is True

    async def _raise_if_dataset_deleted(self, project_id: str, dataset_id: str) -> None:
        if await self._is_dataset_deleted(project_id, dataset_id):
            raise BusinessError(
                code=_DATASET_NOT_FOUND_CODE,
                message=_DATASET_NOT_FOUND_MESSAGE,
                status_code=404,
            )

    async def _get_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType,
    ) -> dict[str, Any] | None:
        getter = getattr(self._project_clients, "get_resource_extension", None)
        if getter is None:
            return None
        return await getter(
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
            extension_type=extension_type,
        )

    async def _upsert_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType,
        payload: dict[str, Any],
        actor: str,
    ) -> dict[str, Any]:
        upsert = getattr(self._project_clients, "upsert_resource_extension")
        return await upsert(
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
            extension_type=extension_type,
            payload=payload,
            actor=actor,
        )

    async def _all_dataset_items(
        self,
        client: Any,
        dataset_name: str,
    ) -> list[dict[str, Any]]:
        page = 1
        items: list[dict[str, Any]] = []
        while True:
            response = await client.list_dataset_items(
                dataset_name=dataset_name,
                page=page,
                limit=100,
            )
            data = _page_data(response)
            items.extend(data)
            meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
            total_pages = int(meta.get("totalPages") or 0)
            if not data or len(data) < 100 or (total_pages and page >= total_pages):
                return items
            page += 1

    async def _item_count(
        self,
        client: Any,
        dataset_name: str,
    ) -> int:
        response = await client.list_dataset_items(
            dataset_name=dataset_name,
            page=1,
            limit=1,
        )
        meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
        return int(meta.get("totalItems") or 0)

    async def _status_counts(
        self,
        client: Any,
        dataset_name: str,
        *,
        keyword: str | None,
    ) -> dict[str, int]:
        items = await self._all_dataset_items(client, dataset_name)
        if keyword:
            mapped = [
                _to_dataset_item_payload(item, "")
                for item in items
                if _item_matches_keyword(
                    _to_dataset_item_payload(item, ""), keyword
                )
            ]
        else:
            mapped = [_to_dataset_item_payload(item, "") for item in items]
        active = sum(1 for item in mapped if item["status"] == "ACTIVE")
        archived = sum(1 for item in mapped if item["status"] == "ARCHIVED")
        return {"total": len(mapped), "active": active, "archived": archived}


def _dataset_item_payload(
    dataset_name: str,
    dataset_id: str,
    payload: dict[str, Any],
    *,
    item_id: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "datasetName": dataset_name,
        "datasetId": dataset_id,
        "input": payload.get("input"),
        "expectedOutput": payload.get("expectedOutput") or payload.get("expected_output"),
        "metadata": payload.get("metadata") or {},
    }
    if item_id is not None:
        result["id"] = item_id
    status = payload.get("status")
    if status is not None:
        result["status"] = status
    source_trace_id = payload.get("sourceTraceId") or payload.get("source_trace_id")
    if source_trace_id:
        result["sourceTraceId"] = source_trace_id
    source_observation_id = (
        payload.get("sourceObservationId") or payload.get("source_observation_id")
    )
    if source_observation_id:
        result["sourceObservationId"] = source_observation_id
    return result


def _to_dataset_payload(item: dict[str, Any], project_id: str) -> dict[str, Any]:
    metadata = item.get("metadata") or {}
    dataset_type = "evaluation"
    if isinstance(metadata, dict):
        raw_type = metadata.get("type")
        if raw_type in {"evaluation", "badcase", "golden", "anomaly"}:
            dataset_type = raw_type

    return {
        "id": item.get("id", ""),
        "projectId": item.get("projectId", project_id),
        "name": item.get("name", ""),
        "description": item.get("description") or "",
        "type": dataset_type,
        "metadata": {**metadata, "type": dataset_type} if isinstance(metadata, dict) else {"type": dataset_type},
        "inputSchema": item.get("inputSchema") or {},
        "expectedOutputSchema": item.get("expectedOutputSchema") or {},
        "itemCount": item.get("itemCount") or 0,
        "runCount": item.get("runCount") or 0,
        "createdAt": _iso(item.get("createdAt")),
        "updatedAt": _iso(item.get("updatedAt")),
    }


def _to_dataset_item_payload(item: dict[str, Any], project_id: str) -> dict[str, Any]:
    return {
        "id": item.get("id", ""),
        "projectId": item.get("projectId", project_id),
        "datasetId": item.get("datasetId", ""),
        "status": item.get("status") or "ACTIVE",
        "input": item.get("input"),
        "expectedOutput": item.get("expectedOutput"),
        "metadata": item.get("metadata") or {},
        "sourceTraceId": item.get("sourceTraceId") or "",
        "sourceObservationId": item.get("sourceObservationId") or "",
        "createdAt": _iso(item.get("createdAt")),
        "updatedAt": _iso(item.get("updatedAt")),
    }


def _item_matches_keyword(item: dict[str, Any], keyword: str) -> bool:
    haystack = [
        _stringify(item.get("input")),
        _stringify(item.get("expectedOutput")),
        _stringify(item.get("metadata")),
        item.get("sourceTraceId") or "",
        item.get("sourceObservationId") or "",
    ]
    return any(keyword in part for part in haystack)


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        import json

        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


def _iso(value: Any) -> str:
    if not value:
        return ""
    text = value.isoformat() if hasattr(value, "isoformat") else str(value)
    if text.endswith("+00:00"):
        text = text[:-6] + ".000Z" if "." not in text else text[:-6] + "Z"
    return text


def _page_data(response: dict[str, Any]) -> list[dict[str, Any]]:
    data = response.get("data")
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _is_json_schema(value: Any) -> bool:
    if not isinstance(value, dict) or not value:
        return False
    schema_type = value.get("type")
    return isinstance(schema_type, str) or "$schema" in value or "properties" in value
