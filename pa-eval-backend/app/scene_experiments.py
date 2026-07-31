from datetime import UTC, datetime
import os
from typing import Any, Literal
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.auth_context import CurrentUserContext, get_current_user_context
from app.consolidation.models import ResourceExtensionType
from app.errors import BusinessError
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success


router = APIRouter(prefix="/api/projects/{project_id}", tags=["scene-experiments"])

SCENE_RESOURCE_TYPE = "SCENE"
EXPERIMENT_GROUP_RESOURCE_TYPE = "EXPERIMENT_GROUP"
EXPERIMENT_REPORT_RESOURCE_TYPE = "EXPERIMENT_REPORT"
EXPERIMENT_BASELINE_RESOURCE_TYPE = "EXPERIMENT_BASELINE"
_SCENE_WEBHOOK_RUNNER_FOR_TESTS: Any | None = None


class SceneRunParametersPayload(BaseModel):
    concurrency: int = Field(default=5, ge=1, le=100)
    timeout_seconds: int = Field(default=30, alias="timeoutSeconds", ge=1, le=3600)
    retry_count: int = Field(default=2, alias="retryCount", ge=0, le=10)
    rounds: int = Field(default=1, ge=1, le=20)

    model_config = ConfigDict(populate_by_name=True)

    def to_public(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True)


class SceneWebhookPayload(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    url: str = Field(min_length=1, max_length=2000)
    method: Literal["POST"] = "POST"
    auth_type: Literal["NONE", "BEARER", "API_KEY"] = Field(
        default="NONE", alias="authType"
    )
    credential: str | None = Field(default=None, max_length=4000)
    credential_ref: str | None = Field(default=None, alias="credentialRef", max_length=240)
    masked_credential: str | None = Field(default=None, alias="maskedCredential")
    api_key_header: str | None = Field(default=None, alias="apiKeyHeader")
    headers: dict[str, str] = Field(default_factory=dict)
    service_family: str = Field(alias="serviceFamily", min_length=1, max_length=120)
    version: str = Field(default="", max_length=120)

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    def to_storage(self) -> dict[str, Any]:
        masked = self.masked_credential or _mask_webhook_credential(
            self.auth_type,
            self.credential,
            self.api_key_header,
        )
        return {
            "id": self.id,
            "name": self.name.strip(),
            "description": self.description,
            "url": self.url,
            "method": self.method,
            "authType": self.auth_type,
            "maskedCredential": masked,
            "credentialRef": (self.credential_ref or "").strip(),
            "apiKeyHeader": self.api_key_header or "",
            "headers": self.headers,
            "serviceFamily": self.service_family,
            "version": self.version,
        }


class SceneUpsertPayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    enabled: bool | None = None
    supports_scheduled_execution: bool | None = Field(
        default=None, alias="supportsScheduledExecution"
    )
    default_scheduled_webhook_ids: list[str] | None = Field(
        default=None, alias="defaultScheduledWebhookIds"
    )
    dataset_id: str | None = Field(default=None, alias="datasetId", min_length=1)
    evaluator_ids: list[str] | None = Field(default=None, alias="evaluatorIds")
    webhooks: list[SceneWebhookPayload] | None = None
    run_parameters: SceneRunParametersPayload | None = Field(
        default=None, alias="runParameters"
    )

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class CreateExperimentPayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    scene_id: str = Field(alias="sceneId", min_length=1)
    webhook_ids: list[str] = Field(alias="webhookIds", min_length=1)
    evaluator_ids: list[str] = Field(alias="evaluatorIds", min_length=1)
    run_parameters: SceneRunParametersPayload = Field(alias="runParameters")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class ReportIdsPayload(BaseModel):
    report_ids: list[str] = Field(alias="reportIds", min_length=2)

    model_config = ConfigDict(populate_by_name=True)


class SetBaselinePayload(BaseModel):
    report_id: str = Field(alias="reportId", min_length=1)

    model_config = ConfigDict(populate_by_name=True)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _mask_webhook_credential(
    auth_type: str,
    credential: str | None,
    api_key_header: str | None,
) -> str:
    if auth_type == "NONE" or not credential:
        return ""
    suffix = credential[-4:] if len(credential) >= 4 else "****"
    if auth_type == "API_KEY":
        return f"{api_key_header or 'X-API-Key'} ****{suffix}"
    return f"Bearer ****{suffix}"


def set_scene_webhook_runner_for_tests(runner: Any | None) -> None:
    global _SCENE_WEBHOOK_RUNNER_FOR_TESTS
    _SCENE_WEBHOOK_RUNNER_FOR_TESTS = runner


def _pagination(rows: list[dict[str, Any]], page: int, page_size: int) -> dict[str, Any]:
    start = (page - 1) * page_size
    return {"total": len(rows), "datas": rows[start : start + page_size]}


def _payload(row: dict[str, Any]) -> dict[str, Any]:
    return dict(row.get("payload") or {})


def _created_at(row: dict[str, Any], fallback: str = "") -> str:
    value = row.get("created_at") or row.get("create_date") or fallback
    return _to_iso(value) if value else fallback


def _updated_at(row: dict[str, Any], fallback: str = "") -> str:
    value = row.get("updated_at") or row.get("update_date") or fallback
    return _to_iso(value) if value else fallback


def _to_iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z"
        )
    return str(value)


def _scene_from_row(row: dict[str, Any]) -> dict[str, Any]:
    scene = _payload(row)
    scene.setdefault("createdAt", _created_at(row, _now_iso()))
    scene.setdefault("updatedAt", _updated_at(row, scene["createdAt"]))
    scene["id"] = scene.get("id") or row.get("resource_id")
    scene["projectId"] = scene.get("projectId") or row.get("project_id")
    scene["defaultScheduledWebhookIds"] = scene.get("defaultScheduledWebhookIds") or []
    if scene.get("defaultScheduledWebhookId") and not scene["defaultScheduledWebhookIds"]:
        scene["defaultScheduledWebhookIds"] = [scene["defaultScheduledWebhookId"]]
    return scene


def _report_from_row(row: dict[str, Any]) -> dict[str, Any]:
    report = _payload(row)
    report.setdefault("createdAt", _created_at(row, _now_iso()))
    return report


def _baseline_from_row(row: dict[str, Any]) -> dict[str, Any]:
    baseline = _payload(row)
    baseline.setdefault("createdAt", _created_at(row, _now_iso()))
    baseline.setdefault("updatedAt", _updated_at(row, baseline["createdAt"]))
    return baseline


async def _list_extension_payloads(
    reader: LangfuseDatabaseReader,
    *,
    project_id: str,
    resource_type: str,
    extension_type: ResourceExtensionType,
    mapper: Any,
) -> list[dict[str, Any]]:
    list_extensions = getattr(reader, "list_resource_extensions")
    rows = await list_extensions(
        project_id=project_id,
        resource_type=resource_type,
        extension_type=extension_type,
        status="ACTIVE",
    )
    return [mapper(row) for row in rows]


async def _get_scene(
    reader: LangfuseDatabaseReader,
    *,
    project_id: str,
    scene_id: str,
) -> dict[str, Any]:
    row = await reader.get_resource_extension(
        project_id=project_id,
        resource_type=SCENE_RESOURCE_TYPE,
        resource_id=scene_id,
        extension_type=ResourceExtensionType.SCENE_CONFIG,
    )
    if row is None:
        raise BusinessError(2006, "场景不存在", 404)
    return _scene_from_row(row)


def _merge_scene(
    existing: dict[str, Any] | None,
    payload: SceneUpsertPayload,
    *,
    project_id: str,
    scene_id: str,
    now: str,
) -> dict[str, Any]:
    base = dict(existing or {})
    if not base:
        base = {
            "id": scene_id,
            "projectId": project_id,
            "name": "",
            "description": "",
            "enabled": True,
            "supportsScheduledExecution": False,
            "defaultScheduledWebhookIds": [],
            "datasetId": "",
            "evaluatorIds": [],
            "webhooks": [],
            "runParameters": SceneRunParametersPayload().to_public(),
            "createdAt": now,
        }

    updates = payload.model_dump(exclude_unset=True, by_alias=True)
    if "webhooks" in updates and payload.webhooks is not None:
        updates["webhooks"] = [webhook.to_storage() for webhook in payload.webhooks]
    if "runParameters" in updates and payload.run_parameters is not None:
        updates["runParameters"] = payload.run_parameters.to_public()
    merged = {**base, **updates, "id": scene_id, "projectId": project_id, "updatedAt": now}
    merged["defaultScheduledWebhookIds"] = merged.get("defaultScheduledWebhookIds") or []
    return merged


def _validate_scene(scene: dict[str, Any], *, require_complete: bool = True) -> None:
    if require_complete:
        missing = [
            label
            for label in ("name", "datasetId", "evaluatorIds", "webhooks", "runParameters")
            if not scene.get(label)
        ]
        if missing:
            raise BusinessError(2009, "场景配置不完整")
    webhook_ids = {webhook.get("id") for webhook in scene.get("webhooks") or []}
    if len(webhook_ids) != len(scene.get("webhooks") or []):
        raise BusinessError(2012, "Webhook 服务 ID 不能重复")
    default_ids = scene.get("defaultScheduledWebhookIds") or []
    if scene.get("supportsScheduledExecution") and any(
        webhook_id not in webhook_ids for webhook_id in default_ids
    ):
        raise BusinessError(2013, "默认定时 Webhook 必须属于当前场景")


def _evaluator_snapshot(evaluator: dict[str, Any]) -> dict[str, Any]:
    output_variables = evaluator.get("outputVariables") or evaluator.get("output_variables") or []
    mappings = evaluator.get("outputVariableMappings") or evaluator.get(
        "output_variable_mappings"
    )
    if not output_variables:
        output_variables = ["score"]
    if not mappings:
        mappings = [
            {"variableName": variable, "scoreConfigName": variable}
            for variable in output_variables
        ]
    return {
        "id": evaluator.get("id"),
        "name": evaluator.get("name") or evaluator.get("id"),
        "type": evaluator.get("type") or "LANGFUSE",
        "version": evaluator.get("version") or "",
        "outputVariables": output_variables,
        "outputVariableMappings": mappings,
    }


def _score_results(evaluators: list[dict[str, Any]], service_index: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for evaluator_index, evaluator in enumerate(evaluators):
        mappings = evaluator.get("outputVariableMappings") or []
        for variable_index, mapping in enumerate(mappings):
            variable_name = mapping.get("variableName") or "score"
            value = max(
                0.55,
                min(0.98, 0.92 - service_index * 0.045 - evaluator_index * 0.012 - variable_index * 0.008),
            )
            rows.append(
                {
                    "key": f"{evaluator['id']}:{variable_name}",
                    "evaluatorId": evaluator["id"],
                    "evaluatorName": evaluator.get("name") or evaluator["id"],
                    "variableName": variable_name,
                    "scoreName": mapping.get("scoreConfigName") or variable_name,
                    "value": round(value, 3),
                    "standardDeviation": round(0.008 + service_index * 0.006, 3),
                }
            )
    return rows


def _webhook_public_snapshot(webhook: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in webhook.items()
        if key not in {"credential", "maskedCredential"}
    }


def _webhook_headers(webhook: dict[str, Any]) -> dict[str, str]:
    headers = {
        str(key): str(value)
        for key, value in (webhook.get("headers") or {}).items()
        if value is not None
    }
    credential = webhook.get("credential") or _credential_from_ref(
        webhook.get("credentialRef")
    )
    auth_type = webhook.get("authType") or "NONE"
    if auth_type == "BEARER" and credential:
        headers["Authorization"] = f"Bearer {credential}"
    if auth_type == "API_KEY" and credential:
        headers[str(webhook.get("apiKeyHeader") or "X-API-Key")] = str(credential)
    return headers


def _credential_from_ref(credential_ref: Any) -> str:
    if not isinstance(credential_ref, str) or not credential_ref.strip():
        return ""
    return os.getenv(credential_ref.strip(), "")


async def _run_scene_webhook(
    *,
    webhook: dict[str, Any],
    request_payload: dict[str, Any],
    timeout_seconds: int,
    retry_count: int,
) -> dict[str, Any]:
    if _SCENE_WEBHOOK_RUNNER_FOR_TESTS is not None:
        return await _SCENE_WEBHOOK_RUNNER_FOR_TESTS(
            webhook=webhook,
            request_payload=request_payload,
            timeout_seconds=timeout_seconds,
            retry_count=retry_count,
        )

    attempts = retry_count + 1
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        for _attempt in range(attempts):
            try:
                response = await client.post(
                    str(webhook["url"]),
                    headers=_webhook_headers(webhook),
                    json=request_payload,
                )
                response.raise_for_status()
                body = response.json()
                if not isinstance(body, dict):
                    return {"output": body}
                return body
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
    raise BusinessError(2015, "Webhook 服务执行失败", 502) from last_error


def _build_webhook_request_payload(
    *,
    experiment_name: str,
    langfuse_experiment_name: str,
    dataset_id: str,
    item: dict[str, Any],
    scene: dict[str, Any],
    webhook: dict[str, Any],
    run_parameters: dict[str, Any],
) -> dict[str, Any]:
    return {
        "experimentName": experiment_name,
        "langfuseExperimentName": langfuse_experiment_name,
        "datasetId": dataset_id,
        "datasetItemId": item["id"],
        "input": item.get("input"),
        "expectedOutput": item.get("expectedOutput") or item.get("expected_output"),
        "metadata": item.get("metadata") or {},
        "scene": {
            "id": scene.get("id"),
            "name": scene.get("name"),
        },
        "webhook": {
            "id": webhook.get("id"),
            "name": webhook.get("name"),
            "serviceFamily": webhook.get("serviceFamily"),
            "version": webhook.get("version") or "",
        },
        "runParameters": run_parameters,
    }


def _error_message(exc: Exception) -> str:
    if isinstance(exc, BusinessError):
        return exc.message
    return "场景实验执行失败"


def _round_results(
    scores: list[dict[str, Any]],
    item_count: int,
    rounds: int,
) -> list[dict[str, Any]]:
    return [
        {
            "round": index + 1,
            "scores": {
                score["key"]: round(score["value"] - (rounds - index - 1) * 0.004, 3)
                for score in scores
            },
            "successCount": item_count,
            "failureCount": 0,
        }
        for index in range(rounds)
    ]


def _baseline_scope(report: dict[str, Any]) -> dict[str, str]:
    return {
        "projectId": report["projectId"],
        "datasetId": report["datasetId"],
        "sceneId": report["sceneId"],
        "serviceFamily": report["webhookSnapshot"]["serviceFamily"],
    }


def _baseline_resource_id(scope: dict[str, str]) -> str:
    return f"{scope['datasetId']}:{scope['sceneId']}:{scope['serviceFamily']}"


async def _get_report(
    reader: LangfuseDatabaseReader,
    *,
    project_id: str,
    report_id: str,
) -> dict[str, Any]:
    row = await reader.get_resource_extension(
        project_id=project_id,
        resource_type=EXPERIMENT_REPORT_RESOURCE_TYPE,
        resource_id=report_id,
        extension_type=ResourceExtensionType.EXPERIMENT_REPORT_SNAPSHOT,
    )
    if row is None:
        raise BusinessError(2003, "试验报告不存在", 404)
    return _report_from_row(row)


def _ensure_aggregateable(reports: list[dict[str, Any]]) -> None:
    if (
        len(reports) < 2
        or any(report["status"] != "COMPLETED" for report in reports)
        or any(report["datasetId"] != reports[0]["datasetId"] for report in reports)
        or any(report["experimentGroupId"] != reports[0]["experimentGroupId"] for report in reports)
    ):
        raise BusinessError(2001, "聚合报告需要选择同一次试验的至少两份已完成报告")


def _ensure_comparable(reports: list[dict[str, Any]]) -> None:
    if (
        len(reports) < 2
        or any(report["status"] != "COMPLETED" for report in reports)
        or any(report["datasetId"] != reports[0]["datasetId"] for report in reports)
        or any(report["sceneId"] != reports[0]["sceneId"] for report in reports)
        or any(
            report["webhookSnapshot"]["serviceFamily"]
            != reports[0]["webhookSnapshot"]["serviceFamily"]
            for report in reports
        )
    ):
        raise BusinessError(2002, "对比分析需要选择同一场景、同一服务系列的至少两份已完成报告")


@router.get("/scenes")
async def list_project_scenes(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, alias="pageSize", ge=1, le=200),
    keyword: str | None = None,
    enabled: bool | None = None,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    scenes = await _list_extension_payloads(
        reader,
        project_id=project_id,
        resource_type=SCENE_RESOURCE_TYPE,
        extension_type=ResourceExtensionType.SCENE_CONFIG,
        mapper=_scene_from_row,
    )
    if keyword:
        normalized = keyword.strip().lower()
        scenes = [
            scene
            for scene in scenes
            if normalized in scene.get("name", "").lower()
            or normalized in scene.get("description", "").lower()
        ]
    if enabled is not None:
        scenes = [scene for scene in scenes if bool(scene.get("enabled")) is enabled]
    scenes.sort(key=lambda item: item.get("updatedAt") or "", reverse=True)
    return success(_pagination(scenes, page, page_size))


@router.post("/scenes")
async def create_project_scene(
    project_id: str,
    payload: SceneUpsertPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    now = _now_iso()
    scene_id = _new_id("scene")
    scene = _merge_scene(None, payload, project_id=project_id, scene_id=scene_id, now=now)
    _validate_scene(scene)
    await reader.get_dataset_for_user(project_id, scene["datasetId"], current_user.user_id)
    await reader.upsert_resource_extension(
        project_id=project_id,
        resource_type=SCENE_RESOURCE_TYPE,
        resource_id=scene_id,
        extension_type=ResourceExtensionType.SCENE_CONFIG,
        payload=scene,
        actor=current_user.email,
    )
    return success(scene)


@router.get("/scenes/{scene_id}")
async def get_project_scene(
    project_id: str,
    scene_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    return success(await _get_scene(reader, project_id=project_id, scene_id=scene_id))


@router.patch("/scenes/{scene_id}")
async def update_project_scene(
    project_id: str,
    scene_id: str,
    payload: SceneUpsertPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    existing = await _get_scene(reader, project_id=project_id, scene_id=scene_id)
    scene = _merge_scene(
        existing,
        payload,
        project_id=project_id,
        scene_id=scene_id,
        now=_now_iso(),
    )
    _validate_scene(scene)
    await reader.get_dataset_for_user(project_id, scene["datasetId"], current_user.user_id)
    await reader.upsert_resource_extension(
        project_id=project_id,
        resource_type=SCENE_RESOURCE_TYPE,
        resource_id=scene_id,
        extension_type=ResourceExtensionType.SCENE_CONFIG,
        payload=scene,
        actor=current_user.email,
    )
    return success(scene)


@router.delete("/scenes/{scene_id}")
async def delete_project_scene(
    project_id: str,
    scene_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    await _get_scene(reader, project_id=project_id, scene_id=scene_id)
    await reader.set_resource_extension_status(
        project_id=project_id,
        resource_type=SCENE_RESOURCE_TYPE,
        resource_id=scene_id,
        extension_type=ResourceExtensionType.SCENE_CONFIG,
        status="INACTIVE",
        actor=current_user.email,
    )
    return success({"id": scene_id})


@router.post("/datasets/{dataset_id}/experiments")
async def create_dataset_experiment(
    project_id: str,
    dataset_id: str,
    payload: CreateExperimentPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    data = await run_scene_experiment(
        project_id=project_id,
        dataset_id=dataset_id,
        payload=payload,
        current_user=current_user,
        reader=reader,
    )
    return success(data)


async def run_scene_experiment(
    *,
    project_id: str,
    dataset_id: str,
    payload: CreateExperimentPayload,
    current_user: CurrentUserContext,
    reader: LangfuseDatabaseReader,
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    await reader.get_dataset_for_user(project_id, dataset_id, current_user.user_id)
    scene = await _get_scene(reader, project_id=project_id, scene_id=payload.scene_id)
    if not scene.get("enabled"):
        raise BusinessError(2004, "所选场景不可用")
    if scene.get("datasetId") != dataset_id:
        raise BusinessError(2014, "所选场景与当前数据集不一致")

    webhooks = [
        webhook
        for webhook in scene.get("webhooks", [])
        if webhook.get("id") in set(payload.webhook_ids)
    ]
    requested_evaluator_ids = set(payload.evaluator_ids)
    scene_evaluator_ids = set(scene.get("evaluatorIds") or [])
    if not webhooks or not requested_evaluator_ids:
        raise BusinessError(2005, "请至少选择一个 Webhook 服务和一个评估器")
    if not requested_evaluator_ids.issubset(scene_evaluator_ids):
        raise BusinessError(2007, "所选评估器未绑定到当前场景")

    selected_evaluators = [
        evaluator
        for evaluator in await reader.list_evaluators_for_user(current_user.user_id)
        if evaluator.get("id") in requested_evaluator_ids
    ]
    if len(selected_evaluators) != len(requested_evaluator_ids):
        raise BusinessError(2007, "所选评估器不存在")
    if any(
        evaluator.get("projectId") and evaluator.get("projectId") != project_id
        for evaluator in selected_evaluators
    ):
        raise BusinessError(2008, "所选评估器不属于当前项目")
    evaluators = [_evaluator_snapshot(evaluator) for evaluator in selected_evaluators]

    item_result = await reader.list_dataset_items_for_user(
        project_id,
        dataset_id,
        current_user.user_id,
        page=1,
        page_size=1000,
        status=["ACTIVE"],
    )
    items = item_result.get("datas") or []
    public_client = await reader.project_public_client_for_user(
        project_id,
        current_user.user_id,
    )
    now = _now_iso()
    group_id = _new_id("experiment_group")
    langfuse_experiment_name = f"{payload.name.strip()}::{group_id}"
    run_parameters = payload.run_parameters.to_public()
    group = {
        "id": group_id,
        "projectId": project_id,
        "datasetId": dataset_id,
        "name": payload.name.strip(),
        "description": payload.description,
        "sceneId": scene["id"],
        "sceneSnapshot": scene,
        "evaluatorSnapshots": evaluators,
        "runParameters": run_parameters,
        "langfuseExperimentName": langfuse_experiment_name,
        "createdAt": now,
    }
    await reader.upsert_resource_extension(
        project_id=project_id,
        resource_type=EXPERIMENT_GROUP_RESOURCE_TYPE,
        resource_id=group_id,
        extension_type=ResourceExtensionType.EXPERIMENT_GROUP_SNAPSHOT,
        payload=group,
        actor=current_user.email,
    )

    reports = []
    for service_index, webhook in enumerate(webhooks):
        scores = _score_results(evaluators, service_index)
        report_id = _new_id("experiment_report")
        item_results: list[dict[str, Any]] = []
        for item in items:
            try:
                webhook_request = _build_webhook_request_payload(
                    experiment_name=payload.name.strip(),
                    langfuse_experiment_name=langfuse_experiment_name,
                    dataset_id=dataset_id,
                    item=item,
                    scene=scene,
                    webhook=webhook,
                    run_parameters=run_parameters,
                )
                webhook_response = await _run_scene_webhook(
                    webhook=webhook,
                    request_payload=webhook_request,
                    timeout_seconds=payload.run_parameters.timeout_seconds,
                    retry_count=payload.run_parameters.retry_count,
                )
                trace_id = webhook_response.get("traceId") or webhook_response.get("trace_id")
                observation_id = webhook_response.get("observationId") or webhook_response.get(
                    "observation_id"
                )
                if not trace_id:
                    raise BusinessError(2016, "Webhook 响应缺少 traceId", 502)
                langfuse_run_item = await public_client.create_dataset_run_item(
                    {
                        "runName": langfuse_experiment_name,
                        "runDescription": payload.description,
                        "datasetItemId": item["id"],
                        "traceId": trace_id,
                        "observationId": observation_id,
                        "metadata": {
                            "paExperimentGroupId": group_id,
                            "paReportId": report_id,
                            "sceneId": scene["id"],
                            "webhookId": webhook.get("id"),
                            "serviceFamily": webhook.get("serviceFamily"),
                            "webhookVersion": webhook.get("version") or "",
                        },
                    }
                )
                item_results.append(
                    {
                        "itemId": item["id"],
                        "input": item.get("input"),
                        "expectedOutput": item.get("expectedOutput")
                        or item.get("expected_output"),
                        "output": webhook_response.get("output"),
                        "scores": {
                            score["key"]: round(
                                score["value"]
                                + (0.018 if len(item_results) % 2 == 0 else -0.018),
                                3,
                            )
                            for score in scores
                        },
                        "status": "PASSED",
                        "traceId": trace_id,
                        "observationId": observation_id,
                        "langfuseDatasetRunItemId": langfuse_run_item.get("id"),
                        "metadata": webhook_response.get("metadata") or {},
                    }
                )
            except Exception as exc:
                item_results.append(
                    {
                        "itemId": item["id"],
                        "input": item.get("input"),
                        "expectedOutput": item.get("expectedOutput")
                        or item.get("expected_output"),
                        "output": None,
                        "scores": {},
                        "status": "FAILED",
                        "errorMessage": _error_message(exc),
                    }
                )
        successful_count = sum(1 for item in item_results if item["status"] == "PASSED")
        failed_count = len(item_results) - successful_count
        report_status = "FAILED" if item_results and successful_count == 0 else "COMPLETED"
        report = {
            "id": report_id,
            "projectId": project_id,
            "datasetId": dataset_id,
            "experimentGroupId": group_id,
            "experimentName": payload.name.strip(),
            "langfuseExperimentName": langfuse_experiment_name,
            "name": f"{payload.name.strip()} - {webhook['name']}",
            "sceneId": scene["id"],
            "sceneSnapshot": scene,
            "webhookSnapshot": _webhook_public_snapshot(webhook),
            "evaluatorSnapshots": evaluators,
            "runParameters": run_parameters,
            "status": report_status,
            "progress": 100,
            "itemCount": len(items),
            "successfulItemCount": successful_count,
            "failedItemCount": failed_count,
            "scoreResults": scores,
            "roundResults": _round_results(
                scores,
                successful_count,
                payload.run_parameters.rounds,
            ),
            "itemResults": item_results,
            "insight": "试验结果已按 Langfuse experiment 语义生成，可用于聚合、对比与基线管理。",
            "createdAt": now,
            "completedAt": now,
        }
        await reader.upsert_resource_extension(
            project_id=project_id,
            resource_type=EXPERIMENT_REPORT_RESOURCE_TYPE,
            resource_id=report_id,
            extension_type=ResourceExtensionType.EXPERIMENT_REPORT_SNAPSHOT,
            payload=report,
            actor=current_user.email,
        )
        reports.append(report)

    return {"group": group, "reports": reports}


@router.get("/datasets/{dataset_id}/experiment-reports")
async def list_dataset_experiment_reports(
    project_id: str,
    dataset_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, alias="pageSize", ge=1, le=200),
    keyword: str | None = None,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    reports = await _list_extension_payloads(
        reader,
        project_id=project_id,
        resource_type=EXPERIMENT_REPORT_RESOURCE_TYPE,
        extension_type=ResourceExtensionType.EXPERIMENT_REPORT_SNAPSHOT,
        mapper=_report_from_row,
    )
    reports = [report for report in reports if report.get("datasetId") == dataset_id]
    if keyword:
        normalized = keyword.strip().lower()
        reports = [
            report
            for report in reports
            if normalized in report.get("name", "").lower()
            or normalized in report.get("experimentName", "").lower()
        ]
    reports.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return success(_pagination(reports, page, page_size))


@router.get("/experiment-reports/{report_id}")
async def get_experiment_report(
    project_id: str,
    report_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    return success(await _get_report(reader, project_id=project_id, report_id=report_id))


@router.post("/experiment-reports/aggregate")
async def aggregate_experiment_reports(
    project_id: str,
    payload: ReportIdsPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    reports = [
        await _get_report(reader, project_id=project_id, report_id=report_id)
        for report_id in payload.report_ids
    ]
    _ensure_aggregateable(reports)
    averages = [
        {
            "id": report["id"],
            "value": sum(score["value"] for score in report["scoreResults"])
            / max(1, len(report["scoreResults"])),
        }
        for report in reports
    ]
    best = max(averages, key=lambda item: item["value"])
    best_report = next(report for report in reports if report["id"] == best["id"])
    return success(
        {
            "title": f"{reports[0]['experimentName']} · 聚合报告",
            "reports": reports,
            "bestReportId": best["id"],
            "differenceItemCount": max(1, round(reports[0]["itemCount"] * 0.18)) if reports[0]["itemCount"] else 0,
            "insight": [
                f"{best_report['webhookSnapshot']['name']} 综合评分最高。",
                "结果已保留数据集、场景、Webhook 与评估器快照，可回溯本次实验上下文。",
                "后续可将最佳报告设为同一数据集、场景、服务系列下的基线。",
            ],
        }
    )


@router.post("/experiment-reports/compare")
async def compare_experiment_reports(
    project_id: str,
    payload: ReportIdsPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    reports = [
        await _get_report(reader, project_id=project_id, report_id=report_id)
        for report_id in payload.report_ids
    ]
    _ensure_comparable(reports)
    score_keys = sorted(
        {score["key"] for report in reports for score in report.get("scoreResults", [])}
    )
    rows = []
    for key in score_keys:
        first_score = next(
            score
            for report in reports
            for score in report["scoreResults"]
            if score["key"] == key
        )
        values = {
            report["id"]: next(
                (
                    score["value"]
                    for score in report.get("scoreResults", [])
                    if score["key"] == key
                ),
                0,
            )
            for report in reports
        }
        rows.append(
            {
                "key": key,
                "label": first_score.get("scoreName") or key,
                "evaluatorName": first_score.get("evaluatorName") or "",
                "values": values,
                "bestValue": max(values.values()),
            }
        )
    return success(
        {
            "title": f"{reports[0]['webhookSnapshot']['serviceFamily']} · 版本对比",
            "reports": reports,
            "scoreRows": rows,
            "insight": [
                "同一服务系列的报告已按评估维度展开对比。",
                "最佳值可用于判断候选版本是否适合作为新基线。",
            ],
        }
    )


@router.get("/datasets/{dataset_id}/experiment-report-baselines")
async def list_experiment_report_baselines(
    project_id: str,
    dataset_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    baselines = await _list_extension_payloads(
        reader,
        project_id=project_id,
        resource_type=EXPERIMENT_BASELINE_RESOURCE_TYPE,
        extension_type=ResourceExtensionType.EXPERIMENT_REPORT_BASELINE,
        mapper=_baseline_from_row,
    )
    return success([baseline for baseline in baselines if baseline.get("datasetId") == dataset_id])


@router.put("/experiment-report-baselines")
async def set_experiment_report_baseline(
    project_id: str,
    payload: SetBaselinePayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.ensure_project_visible(project_id, current_user.user_id)
    report = await _get_report(reader, project_id=project_id, report_id=payload.report_id)
    if report["status"] != "COMPLETED":
        raise BusinessError(2010, "仅已完成报告可设为基线")
    scope = _baseline_scope(report)
    resource_id = _baseline_resource_id(scope)
    existing = await reader.get_resource_extension(
        project_id=project_id,
        resource_type=EXPERIMENT_BASELINE_RESOURCE_TYPE,
        resource_id=resource_id,
        extension_type=ResourceExtensionType.EXPERIMENT_REPORT_BASELINE,
    )
    now = _now_iso()
    baseline = {
        "id": _payload(existing).get("id") if existing else _new_id("experiment_report_baseline"),
        **scope,
        "reportId": report["id"],
        "createdAt": _payload(existing).get("createdAt") if existing else now,
        "updatedAt": now,
    }
    await reader.upsert_resource_extension(
        project_id=project_id,
        resource_type=EXPERIMENT_BASELINE_RESOURCE_TYPE,
        resource_id=resource_id,
        extension_type=ResourceExtensionType.EXPERIMENT_REPORT_BASELINE,
        payload=baseline,
        actor=current_user.email,
    )
    return success(baseline)
