"""Langfuse Public API adapter for annotation-related PA contracts.

Queue metadata update/delete have no Langfuse Public API equivalent, so PA
stores display overlays and soft-delete markers in ``pa_resource_extensions``.
"""

from typing import Any, Protocol

from app.consolidation.models import ResourceExtensionType
from app.errors import BusinessError, LangfuseUpstreamError
from app.score_configs import langfuse_boolean_categories


_SCORE_CONFIG_NOT_FOUND_CODE = 1024
_SCORE_CONFIG_NOT_FOUND_MESSAGE = "评分指标不存在或无访问权限"

_DEFAULT_SCORE_CONFIG_PAYLOAD = {
    "name": "人工质量评分",
    "dataType": "NUMERIC",
    "description": "Trace 人工标注默认评分指标",
    "minValue": 1,
    "maxValue": 5,
}


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


class LangfuseAnnotationsAdapter:
    def __init__(self, project_clients: _ProjectClientProvider) -> None:
        self._project_clients = project_clients

    async def list_score_configs(
        self,
        project_id: str,
        user_id: str,
        *,
        include_archived: bool = False,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            configs = await client.list_all_score_configs()
            mapped = [_to_score_config_payload(cfg) for cfg in configs]
            if not include_archived:
                mapped = [cfg for cfg in mapped if not cfg["archived"]]
            normalized_keyword = (keyword or "").strip()
            if normalized_keyword:
                mapped = [cfg for cfg in mapped if normalized_keyword in cfg["name"]]
            mapped.sort(
                key=lambda value: (
                    value["archived"],
                    value["updatedAt"],
                    value["createdAt"],
                    value["id"],
                ),
                reverse=False,
            )
            # archived=False first (False < True), then newest first within group
            mapped.sort(
                key=lambda value: (value["archived"],),
            )
            total = len(mapped)
            start = (page - 1) * page_size
            return {"total": total, "datas": mapped[start : start + page_size]}

    async def ensure_default_score_config(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            configs = await client.list_all_score_configs()
            active = [cfg for cfg in configs if not cfg.get("isArchived")]
            if active:
                first = sorted(
                    active, key=lambda c: (c.get("createdAt", ""), c.get("id", ""))
                )[0]
                return _to_score_config_payload(first)
            created = await client.create_score_config(_DEFAULT_SCORE_CONFIG_PAYLOAD)
            return _to_score_config_payload(created)

    async def create_score_config(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            created = await client.create_score_config(
                _score_config_api_payload(payload)
            )
            return _to_score_config_payload(created)

    async def update_score_config(
        self,
        project_id: str,
        user_id: str,
        config_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            updated = await client.update_score_config(
                config_id,
                _score_config_api_payload(payload),
            )
            return _to_score_config_payload(updated)

    async def set_score_config_archived(
        self,
        project_id: str,
        user_id: str,
        config_id: str,
        archived: bool,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            updated = await client.update_score_config(
                config_id, {"isArchived": archived}
            )
            return _to_score_config_payload(updated)

    # -- Annotation queues --

    async def list_annotation_queues(
        self,
        project_id: str,
        user_id: str,
        *,
        keyword: str | None = None,
        assignee_ids: list[str] | None = None,
        pending_state: list[str] | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            queues = await client.list_all_annotation_queues()
            payloads = []
            for queue in queues:
                if await self._is_annotation_queue_deleted(
                    project_id, queue.get("id", "")
                ):
                    continue
                payload = await _build_queue_payload(client, queue, project_id)
                payloads.append(
                    await self._apply_annotation_queue_overlay(
                        client,
                        project_id,
                        payload,
                    )
                )
            if keyword:
                payloads = [q for q in payloads if keyword in q["name"]]
            if assignee_ids:
                wanted = set(assignee_ids)
                payloads = [
                    q
                    for q in payloads
                    if wanted.intersection(set(q.get("assigneeIds") or []))
                ]
            if pending_state:
                states = set(pending_state)
                if "hasPending" in states:
                    payloads = [q for q in payloads if q["pendingCount"] > 0]
                elif "completed" in states:
                    payloads = [q for q in payloads if q["pendingCount"] == 0]
            payloads.sort(
                key=lambda q: (q["updatedAt"], q["createdAt"], q["id"]),
                reverse=True,
            )
            total = len(payloads)
            start = (page - 1) * page_size
            return {"total": total, "datas": payloads[start : start + page_size]}

    async def get_annotation_queue(
        self,
        project_id: str,
        user_id: str,
        queue_id: str,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            try:
                queue = await client.get_annotation_queue(queue_id)
            except Exception:
                queue = None
            if not queue:
                raise BusinessError(
                    code=_QUEUE_NOT_FOUND_CODE,
                    message=_QUEUE_NOT_FOUND_MESSAGE,
                    status_code=404,
                )
            await self._raise_if_annotation_queue_deleted(project_id, queue_id)
            return await self._apply_annotation_queue_overlay(
                client,
                project_id,
                await _build_queue_payload(client, queue, project_id),
            )

    async def create_annotation_queue(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        from app.errors import LangfuseResourceConflictError

        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            existing = await client.list_all_annotation_queues()
            names = {q.get("name") for q in existing if isinstance(q, dict)}
            if payload.get("name") in names:
                raise LangfuseResourceConflictError("人工标注任务名称已存在")
            created = await client.create_annotation_queue(
                {
                    "name": payload["name"],
                    "description": payload.get("description") or "",
                    "scoreConfigIds": payload.get("scoreConfigIds") or [],
                }
            )
            return await _build_queue_payload(client, created, project_id)

    async def is_annotation_queue_name_available(
        self,
        project_id: str,
        user_id: str,
        name: str,
    ) -> bool:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            existing = await client.list_all_annotation_queues()
            names = {q.get("name") for q in existing if isinstance(q, dict)}
            return name not in names

    async def get_annotation_queue_metrics(
        self,
        project_id: str,
        user_id: str,
        queue_id: str,
    ) -> dict[str, Any]:
        queue = await self.get_annotation_queue(project_id, user_id, queue_id)
        total = queue["completedCount"] + queue["pendingCount"]
        return {
            "total": total,
            "pendingCount": queue["pendingCount"],
            "completedCount": queue["completedCount"],
            "updatedAt": queue["updatedAt"],
        }

    async def update_annotation_queue(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            try:
                queue = await client.get_annotation_queue(queue_id)
            except Exception:
                queue = None
            if not queue:
                raise BusinessError(
                    code=_QUEUE_NOT_FOUND_CODE,
                    message=_QUEUE_NOT_FOUND_MESSAGE,
                    status_code=404,
                )
            await self._raise_if_annotation_queue_deleted(project_id, queue_id)
            native_payload = await _build_queue_payload(client, queue, project_id)

        overlay_payload: dict[str, Any] = {}
        for key in ("name", "description", "scoreConfigIds"):
            if key in payload and payload.get(key) is not None:
                overlay_payload[key] = payload[key]
        await self._upsert_resource_extension(
            project_id=project_id,
            resource_type="ANNOTATION_QUEUE",
            resource_id=queue_id,
            extension_type=ResourceExtensionType.RESOURCE_DISPLAY_OVERRIDE,
            payload=overlay_payload,
            actor=user_id,
        )

        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            return await self._apply_annotation_queue_overlay(
                client,
                project_id,
                native_payload,
            )

    async def delete_annotation_queue(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> None:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            try:
                await client.get_annotation_queue(queue_id)
            except Exception as exc:
                raise BusinessError(
                    code=_QUEUE_NOT_FOUND_CODE,
                    message=_QUEUE_NOT_FOUND_MESSAGE,
                    status_code=404,
                ) from exc
        await self._upsert_resource_extension(
            project_id=project_id,
            resource_type="ANNOTATION_QUEUE",
            resource_id=queue_id,
            extension_type=ResourceExtensionType.RESOURCE_SOFT_DELETE,
            payload={"deleted": True},
            actor=user_id,
        )

    async def _apply_annotation_queue_overlay(
        self,
        client: Any,
        project_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        extension = await self._get_resource_extension(
            project_id=project_id,
            resource_type="ANNOTATION_QUEUE",
            resource_id=payload["id"],
            extension_type=ResourceExtensionType.RESOURCE_DISPLAY_OVERRIDE,
        )
        overlay = extension.get("payload") if extension else None
        if not isinstance(overlay, dict):
            return payload
        result = dict(payload)
        for key in ("name", "description"):
            if overlay.get(key) is not None:
                result[key] = overlay[key]
        if isinstance(overlay.get("scoreConfigIds"), list):
            score_config_ids = overlay["scoreConfigIds"]
            all_configs = await client.list_all_score_configs()
            config_map = {cfg["id"]: cfg for cfg in all_configs if isinstance(cfg, dict)}
            result["scoreConfigIds"] = score_config_ids
            result["scoreConfigs"] = [
                _to_score_config_payload(config_map[cid])
                for cid in score_config_ids
                if cid in config_map
            ]
        return result

    async def _is_annotation_queue_deleted(self, project_id: str, queue_id: str) -> bool:
        if not queue_id:
            return False
        extension = await self._get_resource_extension(
            project_id=project_id,
            resource_type="ANNOTATION_QUEUE",
            resource_id=queue_id,
            extension_type=ResourceExtensionType.RESOURCE_SOFT_DELETE,
        )
        payload = extension.get("payload") if extension else None
        return isinstance(payload, dict) and payload.get("deleted") is True

    async def _raise_if_annotation_queue_deleted(
        self,
        project_id: str,
        queue_id: str,
    ) -> None:
        if await self._is_annotation_queue_deleted(project_id, queue_id):
            raise BusinessError(
                code=_QUEUE_NOT_FOUND_CODE,
                message=_QUEUE_NOT_FOUND_MESSAGE,
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

    # -- Annotation queue items --

    async def create_annotation_queue_item(
        self,
        project_id: str,
        user_id: str,
        queue_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            created = await client.create_annotation_queue_item(
                queue_id,
                {
                    "objectId": payload["objectId"],
                    "objectType": payload["objectType"],
                },
            )
            return _to_queue_item_payload(created, project_id)

    async def complete_annotation_queue_items(
        self,
        project_id: str,
        user_id: str,
        queue_id: str,
        item_ids: list[str],
    ) -> list[dict[str, Any]]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            completed: list[dict[str, Any]] = []
            for item_id in item_ids:
                updated = await client.update_annotation_queue_item(
                    queue_id, item_id, {"status": "COMPLETED"}
                )
                completed.append(_to_queue_item_payload(updated, project_id))
            return completed

    async def complete_annotation_queue_item(
        self,
        project_id: str,
        user_id: str,
        queue_id: str,
        item_id: str,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            updated = await client.update_annotation_queue_item(
                queue_id, item_id, {"status": "COMPLETED"}
            )
            return _to_queue_item_payload(updated, project_id)

    async def delete_annotation_queue_items(
        self,
        project_id: str,
        user_id: str,
        queue_id: str,
        item_ids: list[str],
    ) -> list[str]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            deleted: list[str] = []
            for item_id in item_ids:
                await client.delete_annotation_queue_item(queue_id, item_id)
                deleted.append(item_id)
            return deleted

    async def add_traces_to_dataset(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            dataset_id = payload["datasetId"]
            dataset_name = await _resolve_dataset_name(client, dataset_id)
            traces = payload.get("traces") or []
            success_count = 0
            failures: list[dict[str, Any]] = []
            for trace in traces:
                trace_id = str(trace.get("traceId") or "")
                if not trace_id:
                    failures.append({"traceId": "", "reason": "缺少 traceId"})
                    continue
                try:
                    await client.upsert_dataset_item(
                        {
                            "datasetName": dataset_name,
                            "datasetId": dataset_id,
                            "input": trace.get("input"),
                            "expectedOutput": trace.get("output"),
                            "metadata": trace.get("metadata") or {},
                            "sourceTraceId": trace_id,
                            "status": "ACTIVE",
                        }
                    )
                    success_count += 1
                except Exception:
                    failures.append({"traceId": trace_id, "reason": "写入失败"})
            return {
                "successCount": success_count,
                "failureCount": len(failures),
                "failures": failures,
            }

    async def add_annotation_item_to_dataset(
        self,
        project_id: str,
        user_id: str,
        queue_id: str,
        item_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            item = await client.get_annotation_queue_item(queue_id, item_id)
            dataset_id = payload["datasetId"]
            dataset_name = await _resolve_dataset_name(client, dataset_id)
            source_trace_id = (
                item.get("objectId", "") if item.get("objectType") == "TRACE" else ""
            )
            source_observation_id = (
                item.get("objectId", "")
                if item.get("objectType") == "OBSERVATION"
                else ""
            )
            created = await client.upsert_dataset_item(
                {
                    "datasetName": dataset_name,
                    "datasetId": dataset_id,
                    "input": payload.get("input"),
                    "expectedOutput": payload.get("expectedOutput"),
                    "metadata": payload.get("metadata") or {},
                    "sourceTraceId": source_trace_id or None,
                    "sourceObservationId": source_observation_id or None,
                    "status": "ACTIVE",
                }
            )
            return created


async def _resolve_dataset_name(client: Any, dataset_id: str) -> str:
    """Resolve a PA dataset id to its Langfuse dataset name via list."""
    response = await client.list_datasets(page=1, limit=100)
    for dataset in response.get("data") or []:
        if isinstance(dataset, dict) and dataset.get("id") == dataset_id:
            return dataset.get("name", "")
    raise BusinessError(
        code=_DATASET_NOT_FOUND_CODE,
        message=_DATASET_NOT_FOUND_MESSAGE,
        status_code=404,
    )


def _to_queue_item_payload(item: dict[str, Any], project_id: str) -> dict[str, Any]:
    return {
        "id": item.get("id", ""),
        "projectId": project_id,
        "queueId": item.get("queueId", ""),
        "objectId": item.get("objectId", ""),
        "objectType": item.get("objectType", ""),
        "status": item.get("status", ""),
        "completedAt": _iso(item.get("completedAt")) if item.get("completedAt") else "",
        "completedBy": None,
        "assignee": None,
        "scores": [],
        "createdAt": _iso(item.get("createdAt")),
        "updatedAt": _iso(item.get("updatedAt")),
    }


def _score_config_api_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data_type = payload.get("dataType") or payload.get("data_type")
    result: dict[str, Any] = {
        "name": payload.get("name"),
        "dataType": data_type,
        "description": payload.get("description") or "",
    }
    if data_type == "NUMERIC":
        result["minValue"] = payload.get("minValue")
        result["maxValue"] = payload.get("maxValue")
    elif data_type == "BOOLEAN":
        result["minValue"] = None
        result["maxValue"] = None
        result["categories"] = langfuse_boolean_categories()
    elif data_type == "CATEGORICAL":
        result["minValue"] = None
        result["maxValue"] = None
        result["categories"] = payload.get("categories") or []
    elif data_type == "TEXT":
        result["minValue"] = None
        result["maxValue"] = None
    # Langfuse 3.224 rejects categories for non-categorical numeric/text scores.
    result = {k: v for k, v in result.items() if v is not None}
    return result


def _to_score_config_payload(item: dict[str, Any]) -> dict[str, Any]:
    data_type = item.get("dataType") or item.get("data_type") or "NUMERIC"
    categories = item.get("categories")
    if data_type == "BOOLEAN":
        categories = langfuse_boolean_categories()
    elif not categories:
        categories = []
    return {
        "id": item.get("id", ""),
        "projectId": item.get("projectId", ""),
        "name": item.get("name", ""),
        "dataType": data_type,
        "description": item.get("description") or "",
        "minValue": _to_float_or_none(item.get("minValue")),
        "maxValue": _to_float_or_none(item.get("maxValue")),
        "categories": categories,
        "archived": bool(item.get("isArchived") or item.get("is_archived")),
        "createdAt": _iso(item.get("createdAt")),
        "updatedAt": _iso(item.get("updatedAt")),
    }


def _to_float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _iso(value: Any) -> str:
    if not value:
        return ""
    text = value.isoformat() if hasattr(value, "isoformat") else str(value)
    if text.endswith("+00:00"):
        text = text[:-6] + ".000Z" if "." not in text else text[:-6] + "Z"
    return text


# ---------------------------------------------------------------------------
# Annotation queue sub-domain
# ---------------------------------------------------------------------------

_DATASET_NOT_FOUND_CODE = 1011
_DATASET_NOT_FOUND_MESSAGE = "数据集不存在或无访问权限"
_QUEUE_NOT_FOUND_CODE = 1021
_QUEUE_NOT_FOUND_MESSAGE = "人工标注任务不存在或无访问权限"


async def _build_queue_payload(
    client: Any,
    queue: dict[str, Any],
    project_id: str,
) -> dict[str, Any]:
    """Aggregate a Langfuse annotation queue into the PA contract payload."""
    queue_id = queue.get("id", "")
    score_config_ids = queue.get("scoreConfigIds") or []
    all_configs = await client.list_all_score_configs()
    config_map = {cfg["id"]: cfg for cfg in all_configs if isinstance(cfg, dict)}
    score_configs = [
        _to_score_config_payload(config_map[cid])
        for cid in score_config_ids
        if cid in config_map
    ]

    try:
        assignments = await client.list_all_annotation_queue_assignments(queue_id)
    except LangfuseUpstreamError:
        assignments = []
    assignee_ids = [a.get("userId") for a in assignments if a.get("userId")]
    assignees = [{"id": uid, "name": uid, "email": ""} for uid in assignee_ids]

    items = await client.list_all_annotation_queue_items(queue_id)
    pending = sum(1 for item in items if item.get("status") != "COMPLETED")
    completed = sum(1 for item in items if item.get("status") == "COMPLETED")

    return {
        "id": queue_id,
        "projectId": project_id,
        "name": queue.get("name", ""),
        "description": queue.get("description") or "",
        "scoreConfigIds": score_config_ids,
        "assigneeIds": assignee_ids,
        "assignmentStrategy": "average",
        "assignmentWeights": {},
        "completedCount": completed,
        "pendingCount": pending,
        "scoreConfigs": score_configs,
        "assignees": assignees,
        "createdAt": _iso(queue.get("createdAt")),
        "updatedAt": _iso(queue.get("updatedAt")),
    }
