import json
import math
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
import psycopg
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.errors import BusinessError
from app.langfuse_db import LangfuseDatabaseConfigError
from app.response import success

router = APIRouter(prefix="/api/projects/{project_id}", tags=["auto-evaluations"])


class CreateAutoEvaluationPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    score_name: str = Field(alias="scoreName", default="dify_score", min_length=1)
    evaluator_id: str = Field(alias="evaluatorId", min_length=1)
    input: str = "用户问：怎么申请退款？"
    output: str = "您可以在订单详情页提交退款申请。"
    expected_output: str = Field(default="退款申请", alias="expectedOutput")
    context: str = "客服场景"
    sample_rate: int = Field(default=100, alias="sampleRate", ge=1, le=100)
    variable_mapping: dict[str, Any] = Field(
        default_factory=dict,
        alias="variableMapping",
    )
    data_source: dict[str, Any] = Field(
        default_factory=lambda: {"type": "TRACE_FILTER"},
        alias="dataSource",
    )


class TraceCountPayload(BaseModel):
    trace_filter: dict[str, Any] = Field(default_factory=dict, alias="traceFilter")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _format_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        formatted = value.isoformat(timespec="milliseconds")
        return formatted.replace("+00:00", "Z")
    return str(value)


async def _connect(settings: Settings) -> psycopg.AsyncConnection:
    if not settings.langfuse_database_url:
        raise LangfuseDatabaseConfigError()
    return await psycopg.AsyncConnection.connect(
        settings.langfuse_database_url,
        row_factory=dict_row,
    )


async def _ensure_project_access(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    user_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        SELECT p.id, p.name
        FROM projects p
        WHERE p.id = %(project_id)s
          AND EXISTS (
            SELECT 1
            FROM organization_memberships om
            WHERE om.org_id = p.org_id
              AND om.user_id = %(user_id)s
          )
        LIMIT 1
        """,
        {"project_id": project_id, "user_id": user_id},
    )
    project = await cursor.fetchone()
    if project is None:
        raise BusinessError(1005, "项目不存在或无访问权限", 404)
    return project


async def _get_pa_evaluator(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    evaluator_id: str,
    user_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        SELECT pe.id, pe.name, pe.type, pe.provider, pe.version, pe.variables, pe.config
        FROM pa_evaluators pe
        JOIN projects p ON p.id = pe.project_id
        WHERE pe.id = %(evaluator_id)s
          AND pe.status = 'ACTIVE'
          AND p.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM organization_memberships om
            WHERE om.org_id = p.org_id
              AND om.user_id = %(user_id)s
          )
        LIMIT 1
        """,
        {"evaluator_id": evaluator_id, "user_id": user_id},
    )
    evaluator = await cursor.fetchone()
    if evaluator is None:
        raise BusinessError(1006, "评估器不存在或无访问权限", 404)
    if evaluator["provider"] not in {"DIFY", "N8N"} or evaluator["type"] != "WORKFLOW":
        raise BusinessError(4001, "当前自动评测仅支持 Dify/n8n 工作流评估器")
    return evaluator


async def _get_dataset_for_user(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    dataset_id: str,
    user_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        SELECT d.id, d.project_id, d.name
        FROM datasets d
        JOIN projects p ON p.id = d.project_id
        WHERE d.id = %(dataset_id)s
          AND d.project_id = %(project_id)s
          AND p.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM organization_memberships om
            WHERE om.org_id = p.org_id
              AND om.user_id = %(user_id)s
          )
        LIMIT 1
        """,
        {
            "project_id": project_id,
            "dataset_id": dataset_id,
            "user_id": user_id,
        },
    )
    dataset = await cursor.fetchone()
    if dataset is None:
        raise BusinessError(1011, "数据集不存在或无访问权限", 404)
    return dataset


async def _list_active_dataset_items(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    dataset_id: str,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        SELECT
            di.id,
            di.project_id,
            di.dataset_id,
            di.input,
            di.expected_output,
            di.metadata,
            di.source_trace_id,
            di.source_observation_id,
            di.created_at,
            di.updated_at
        FROM dataset_items di
        WHERE di.project_id = %(project_id)s
          AND di.dataset_id = %(dataset_id)s
          AND di.valid_to IS NULL
          AND di.is_deleted IS FALSE
          AND COALESCE(di.status::text, 'ACTIVE') != 'ARCHIVED'
        ORDER BY di.updated_at DESC, di.created_at DESC, di.id DESC
        """,
        {"project_id": project_id, "dataset_id": dataset_id},
    )
    return list(await cursor.fetchall())


async def _list_trace_generation_samples(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    data_source_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    trace_name = _stringify_value(data_source_payload.get("traceName")).strip()
    user_id = _stringify_value(data_source_payload.get("userId")).strip()
    session_id = _stringify_value(data_source_payload.get("sessionId")).strip()
    tags = data_source_payload.get("tags")
    tag_values = [str(tag) for tag in tags] if isinstance(tags, list) else []

    await cursor.execute(
        """
        WITH latest_generations AS (
            SELECT DISTINCT ON (t.id)
                t.id AS trace_id,
                t.project_id,
                t.name AS trace_name,
                t.input AS trace_input,
                t.output AS trace_output,
                t.metadata AS trace_metadata,
                t.user_id,
                t.session_id,
                t.tags,
                t.timestamp AS trace_timestamp,
                o.id AS observation_id,
                o.name AS observation_name,
                o.input AS observation_input,
                o.output AS observation_output,
                o.metadata AS observation_metadata,
                o.start_time AS observation_start_time,
                o.created_at AS observation_created_at
            FROM traces t
            JOIN observations o
              ON o.trace_id = t.id
             AND o.project_id = t.project_id
            WHERE t.project_id = %(project_id)s
              AND o.type = 'GENERATION'
              AND (%(trace_name)s = '' OR t.name ILIKE %(trace_name_like)s)
              AND (%(user_id)s = '' OR t.user_id ILIKE %(user_id_like)s)
              AND (%(session_id)s = '' OR t.session_id ILIKE %(session_id_like)s)
              AND (
                cardinality(%(tags)s::text[]) = 0
                OR COALESCE(t.tags, ARRAY[]::text[]) @> %(tags)s::text[]
              )
            ORDER BY
                t.id,
                o.start_time DESC NULLS LAST,
                o.created_at DESC NULLS LAST,
                o.id DESC
        )
        SELECT *
        FROM latest_generations
        ORDER BY observation_start_time DESC NULLS LAST, trace_timestamp DESC NULLS LAST, trace_id DESC
        LIMIT 500
        """,
        {
            "project_id": project_id,
            "trace_name": trace_name,
            "trace_name_like": f"%{trace_name}%",
            "user_id": user_id,
            "user_id_like": f"%{user_id}%",
            "session_id": session_id,
            "session_id_like": f"%{session_id}%",
            "tags": tag_values,
        },
    )
    return [_to_trace_generation_sample(row) for row in await cursor.fetchall()]


async def _count_trace_generation_samples(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    data_source_payload: dict[str, Any],
) -> int:
    samples = await _list_trace_generation_samples(
        cursor,
        project_id,
        data_source_payload,
    )
    return len(samples)


def _sample_dataset_items(
    items: list[dict[str, Any]],
    sample_rate: int,
) -> list[dict[str, Any]]:
    if not items:
        return []

    sample_count = max(1, math.ceil(len(items) * sample_rate / 100))
    return items[:sample_count]


def _stringify_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _build_dify_inputs_from_dataset_item(item: dict[str, Any]) -> dict[str, str]:
    raw_input = item.get("input")
    input_payload = raw_input if isinstance(raw_input, dict) else {}

    return {
        "input": _stringify_value(input_payload.get("input", raw_input)),
        "output": _stringify_value(input_payload.get("output", "")),
        "expected_output": _stringify_value(item.get("expected_output")),
        "context": _stringify_value(input_payload.get("context", "")),
    }


def _normalize_dataset_item_sample(item: dict[str, Any]) -> dict[str, Any]:
    raw_input = item.get("input")
    input_payload = raw_input if isinstance(raw_input, dict) else {}
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}

    return {
        "sourceType": "DATASET_ITEM",
        "sourceId": _stringify_value(item.get("id")),
        "input": _stringify_value(input_payload.get("input", raw_input)),
        "output": _stringify_value(input_payload.get("output", "")),
        "expectedOutput": _stringify_value(item.get("expected_output")),
        "context": _stringify_value(
            input_payload.get("context", metadata.get("context", ""))
        ),
        "metadata": metadata,
        "trace": {"id": _stringify_value(item.get("source_trace_id"))},
        "observation": {
            "id": _stringify_value(item.get("source_observation_id")),
        },
        "datasetItem": item,
    }


def _to_trace_generation_sample(row: dict[str, Any]) -> dict[str, Any]:
    trace_metadata = (
        row.get("trace_metadata") if isinstance(row.get("trace_metadata"), dict) else {}
    )
    observation_metadata = (
        row.get("observation_metadata")
        if isinstance(row.get("observation_metadata"), dict)
        else {}
    )
    context = trace_metadata.get("context", observation_metadata.get("context", ""))

    return {
        "sourceType": "TRACE_GENERATION",
        "sourceId": _stringify_value(row.get("trace_id")),
        "id": _stringify_value(row.get("observation_id") or row.get("trace_id")),
        "project_id": _stringify_value(row.get("project_id")),
        "dataset_id": "",
        "input": {
            "input": _stringify_value(row.get("observation_input")),
            "output": _stringify_value(row.get("observation_output")),
            "context": _stringify_value(context),
        },
        "expected_output": "",
        "metadata": {
            "sourceType": "TRACE_GENERATION",
            "traceName": _stringify_value(row.get("trace_name")),
            "observationName": _stringify_value(row.get("observation_name")),
            "userId": _stringify_value(row.get("user_id")),
            "sessionId": _stringify_value(row.get("session_id")),
            "tags": row.get("tags") or [],
            "trace": {
                "input": row.get("trace_input"),
                "output": row.get("trace_output"),
                "metadata": trace_metadata,
            },
            "observation": {
                "metadata": observation_metadata,
            },
        },
        "source_trace_id": _stringify_value(row.get("trace_id")),
        "source_observation_id": _stringify_value(row.get("observation_id")),
    }


def _get_path_value(source: dict[str, Any], path: str) -> Any:
    current: Any = source
    for segment in path.split("."):
        if isinstance(current, dict) and segment in current:
            current = current[segment]
        else:
            return ""
    return current


def _resolve_mapping_template(template: str, sample: dict[str, Any]) -> str:
    result = template
    while "{{" in result and "}}" in result:
        start = result.index("{{")
        end = result.index("}}", start) + 2
        expression = result[start + 2 : end - 2].strip()
        value = _get_path_value({"sample": sample}, expression)
        result = f"{result[:start]}{_stringify_value(value)}{result[end:]}"
    return result


def _default_input_mapping(evaluator: dict[str, Any]) -> dict[str, str]:
    variables = (
        evaluator.get("variables") if isinstance(evaluator.get("variables"), list) else []
    )
    defaults = {
        "input": "{{ sample.input }}",
        "output": "{{ sample.output }}",
        "expected_output": "{{ sample.expectedOutput }}",
        "context": "{{ sample.context }}",
    }
    return {variable: defaults.get(variable, "") for variable in variables}


def _build_workflow_inputs(
    sample: dict[str, Any],
    evaluator: dict[str, Any],
    task_mapping: dict[str, Any] | None,
) -> dict[str, str]:
    mapping = _get_effective_input_mapping(evaluator, task_mapping)
    return {
        key: _resolve_mapping_template(str(value), sample)
        for key, value in mapping.items()
    }


def _get_effective_input_mapping(
    evaluator: dict[str, Any],
    task_mapping: dict[str, Any] | None,
) -> dict[str, Any]:
    config = evaluator.get("config") or {}
    evaluator_mapping = (
        config.get("inputMapping") if isinstance(config.get("inputMapping"), dict) else {}
    )
    mapping = {**_default_input_mapping(evaluator), **evaluator_mapping}
    if task_mapping:
        mapping.update(task_mapping)
    return mapping


def _build_single_sample(payload: CreateAutoEvaluationPayload) -> dict[str, Any]:
    return {
        "id": "dify-sample-1",
        "project_id": "",
        "dataset_id": "",
        "input": {
            "input": payload.input,
            "output": payload.output,
            "context": payload.context,
        },
        "expected_output": payload.expected_output,
        "metadata": {},
        "source_trace_id": "dify-trace-1",
        "source_observation_id": "dify-observation-1",
    }


async def _run_dify_evaluator(
    evaluator: dict[str, Any],
    inputs: dict[str, str],
    settings: Settings,
) -> dict[str, Any]:
    config = evaluator.get("config") or {}
    endpoint_url = config.get("endpointUrl")
    auth_token = config.get("authToken")
    if not endpoint_url or not auth_token:
        raise BusinessError(4002, "Dify 评估器缺少工作流地址或 API Key")

    request_payload = {
        "inputs": inputs,
        "response_mode": "blocking",
        "user": "pa-eval",
    }
    async with httpx.AsyncClient(timeout=settings.pa_eval_api_timeout) as client:
        response = await client.post(
            str(endpoint_url),
            json=request_payload,
            headers={"Authorization": f"Bearer {auth_token}"},
        )
    if response.status_code >= 400:
        raise BusinessError(4003, "Dify 工作流调用失败", 502)

    body = response.json()
    data = body.get("data") if isinstance(body, dict) else {}
    outputs = data.get("outputs") if isinstance(data, dict) else {}
    score = float(outputs.get("score") or 0)
    passed = str(outputs.get("passed") or "false").lower() == "true"
    reason = str(outputs.get("reason") or "")
    return {
        "raw": body,
        "score": score,
        "passed": passed,
        "reason": reason,
    }


async def _run_workflow_evaluator(
    evaluator: dict[str, Any],
    inputs: dict[str, str],
    settings: Settings,
) -> dict[str, Any]:
    config = evaluator.get("config") or {}
    endpoint_url = config.get("endpointUrl")
    if not endpoint_url:
        raise BusinessError(4002, "工作流评估器缺少工作流地址")

    provider = evaluator.get("provider")
    request_payload: dict[str, Any] = {"inputs": inputs}
    if provider == "DIFY":
        request_payload.update(
            {
                "response_mode": "blocking",
                "user": "pa-eval",
            }
        )

    async with httpx.AsyncClient(timeout=settings.pa_eval_api_timeout) as client:
        response = await client.post(
            str(endpoint_url),
            json=request_payload,
            headers=_build_workflow_headers(evaluator),
        )
    if response.status_code >= 400:
        raise BusinessError(4003, "工作流调用失败", 502)

    return _parse_workflow_result(evaluator, response.json())


def _build_workflow_headers(evaluator: dict[str, Any]) -> dict[str, str]:
    config = evaluator.get("config") or {}
    auth_type = str(config.get("authType") or "NONE").upper()
    auth_token = config.get("authToken")
    if not auth_token:
        return {}

    token = str(auth_token)
    if auth_type == "BEARER":
        return {"Authorization": f"Bearer {token}"}
    if auth_type == "API_KEY":
        return {"X-API-Key": token}
    if auth_type == "BASIC":
        return {"Authorization": f"Basic {token}"}
    return {}


def _parse_workflow_result(
    evaluator: dict[str, Any],
    body: dict[str, Any],
) -> dict[str, Any]:
    provider = evaluator.get("provider")
    if provider == "DIFY":
        data = body.get("data") if isinstance(body, dict) else {}
        outputs = data.get("outputs") if isinstance(data, dict) else {}
    else:
        outputs = body

    score = float(outputs.get("score") or 0)
    passed_value = outputs.get("passed")
    passed = (
        passed_value
        if isinstance(passed_value, bool)
        else str(passed_value or "false").lower() == "true"
    )
    reason = str(outputs.get("reason") or "")
    return {
        "raw": body,
        "score": score,
        "passed": passed,
        "reason": reason,
    }


def _bucket_scores(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets = [
        {"label": "0-0.4", "count": 0},
        {"label": "0.4-0.6", "count": 0},
        {"label": "0.6-0.8", "count": 0},
        {"label": "0.8-1.0", "count": 0},
    ]
    for result in results:
        score = result["score"]
        if score < 0.4:
            buckets[0]["count"] += 1
        elif score < 0.6:
            buckets[1]["count"] += 1
        elif score < 0.8:
            buckets[2]["count"] += 1
        else:
            buckets[3]["count"] += 1
    return buckets


@router.post("/auto-evaluations")
async def create_auto_evaluation(
    project_id: str,
    payload: CreateAutoEvaluationPayload,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    task_id = _new_id("paautoeval")
    run_id = _new_id("parun")

    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            evaluator = await _get_pa_evaluator(
                cursor,
                payload.evaluator_id,
                current_user.user_id,
            )
            data_source, samples = await _resolve_auto_evaluation_samples(
                cursor,
                project_id,
                payload,
                current_user.user_id,
            )
            sample_count = len(samples)
            execution_stats = {
                "pending": sample_count,
                "running": 0,
                "completed": 0,
                "failed": 0,
                "cancelled": 0,
            }
            await _insert_running_auto_evaluation(
                cursor,
                task_id=task_id,
                run_id=run_id,
                project_id=project_id,
                name=payload.name,
                description=payload.description,
                score_name=payload.score_name,
                evaluator=evaluator,
                data_source=data_source,
                sample_rate=payload.sample_rate,
                sample_count=sample_count,
                created_by=current_user.email,
                now=now,
            )

    background_tasks.add_task(
        _run_auto_evaluation_background,
        settings,
        project_id,
        task_id,
        run_id,
        payload,
        evaluator,
        samples,
        data_source,
    )

    return success(
        {
            "id": task_id,
            "projectId": project_id,
            "name": payload.name,
            "description": payload.description,
            "scoreName": payload.score_name,
            "status": "RUNNING",
            "evaluator": {
                "id": evaluator["id"],
                "name": evaluator["name"],
                "type": evaluator["type"],
                "version": f"v{evaluator['version']}",
            },
            "dataSource": data_source,
            "sampleRate": payload.sample_rate,
            "executionStats": execution_stats,
            "badcaseCount": 0,
            "createdBy": current_user.email,
            "createdAt": _format_datetime(now),
            "lastRunAt": _format_datetime(now),
            "updatedAt": _format_datetime(now),
        }
    )


@router.post("/traces/count")
async def count_trace_generation_samples(
    project_id: str,
    payload: TraceCountPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            count = await _count_trace_generation_samples(
                cursor,
                project_id,
                payload.trace_filter,
            )
    return success({"count": count})


async def _resolve_auto_evaluation_samples(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    payload: CreateAutoEvaluationPayload,
    user_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    data_source_payload = payload.data_source or {}
    samples = [_build_single_sample(payload)]
    data_source = {
        "type": "TRACE_FILTER",
        "name": "Trace 过滤",
        "sampleCount": 1,
    }

    if data_source_payload.get("type") == "DATASET":
        dataset_id = data_source_payload.get("datasetId")
        dataset_project_id = data_source_payload.get("projectId") or project_id
        if not isinstance(dataset_id, str) or not dataset_id:
            raise BusinessError(4005, "请选择数据集")
        if not isinstance(dataset_project_id, str) or not dataset_project_id:
            raise BusinessError(4005, "请选择数据集所属项目")

        dataset = await _get_dataset_for_user(
            cursor,
            dataset_project_id,
            dataset_id,
            user_id,
        )
        dataset_items = await _list_active_dataset_items(
            cursor,
            dataset_project_id,
            dataset_id,
        )
        samples = _sample_dataset_items(dataset_items, payload.sample_rate)
        if not samples:
            raise BusinessError(4006, "数据集没有可用样本")

        data_source = {
            "type": "DATASET",
            "name": dataset["name"],
            "datasetId": dataset["id"],
            "datasetProjectId": dataset["project_id"],
            "sampleCount": len(samples),
            "totalItemCount": len(dataset_items),
                }

    if data_source_payload.get("type") == "TRACE_FILTER":
        trace_samples = await _list_trace_generation_samples(
            cursor,
            project_id,
            data_source_payload,
        )
        samples = _sample_dataset_items(trace_samples, payload.sample_rate)
        if not samples:
            raise BusinessError(4007, "Trace 过滤没有可用样本")

        data_source = {
            "type": "TRACE_FILTER",
            "name": "Trace 过滤",
            "sampleStrategy": data_source_payload.get(
                "sampleStrategy",
                "LAST_GENERATION",
            ),
            "traceFilter": {
                "timeRange": data_source_payload.get("timeRange"),
                "traceName": data_source_payload.get("traceName"),
                "userId": data_source_payload.get("userId"),
                "sessionId": data_source_payload.get("sessionId"),
                "tags": data_source_payload.get("tags") or [],
            },
            "sampleCount": len(samples),
            "matchedTraceCount": len(trace_samples),
        }

    return data_source, samples


async def _insert_running_auto_evaluation(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    task_id: str,
    run_id: str,
    project_id: str,
    name: str,
    description: str,
    score_name: str,
    evaluator: dict[str, Any],
    data_source: dict[str, Any],
    sample_rate: int,
    sample_count: int,
    created_by: str,
    now: datetime | None,
) -> None:
    current_time = now or datetime.now(timezone.utc)
    execution_stats = {
        "pending": sample_count,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
    }
    await cursor.execute(
        """
        INSERT INTO pa_auto_evaluation_tasks (
            id, project_id, name, description, score_name, status,
            evaluator_id, evaluator_name, evaluator_type, evaluator_version,
            data_source, sample_rate, execution_stats, badcase_count,
            latest_report_id, created_by, last_run_at, created_at, updated_at
        )
        VALUES (
            %(id)s, %(project_id)s, %(name)s, %(description)s, %(score_name)s, %(status)s,
            %(evaluator_id)s, %(evaluator_name)s, %(evaluator_type)s, %(evaluator_version)s,
            %(data_source)s, %(sample_rate)s, %(execution_stats)s, 0,
            %(latest_report_id)s, %(created_by)s, %(last_run_at)s, %(created_at)s, %(updated_at)s
        )
        """,
        {
            "id": task_id,
            "project_id": project_id,
            "name": name,
            "description": description,
            "score_name": score_name,
            "status": "RUNNING",
            "evaluator_id": evaluator["id"],
            "evaluator_name": evaluator["name"],
            "evaluator_type": evaluator["type"],
            "evaluator_version": f"v{evaluator['version']}",
            "data_source": Jsonb(data_source),
            "sample_rate": sample_rate,
            "execution_stats": Jsonb(execution_stats),
            "latest_report_id": None,
            "created_by": created_by,
            "last_run_at": current_time,
            "created_at": current_time,
            "updated_at": current_time,
        },
    )
    await cursor.execute(
        """
        INSERT INTO pa_auto_evaluation_runs (
            id, project_id, task_id, status, sample_count, completed_count,
            failed_count, badcase_count, started_at, ended_at, duration_text
        )
        VALUES (
            %(id)s, %(project_id)s, %(task_id)s, %(status)s, %(sample_count)s, 0,
            0, 0, %(started_at)s, %(ended_at)s, %(duration_text)s
        )
        """,
        {
            "id": run_id,
            "project_id": project_id,
            "task_id": task_id,
            "status": "RUNNING",
            "sample_count": sample_count,
            "started_at": current_time,
            "ended_at": None,
            "duration_text": "运行中",
        },
    )


async def _run_auto_evaluation_background(
    settings: Settings,
    project_id: str,
    task_id: str,
    run_id: str,
    payload: CreateAutoEvaluationPayload,
    evaluator: dict[str, Any],
    samples: list[dict[str, Any]],
    data_source: dict[str, Any],
) -> None:
    try:
        results: list[dict[str, Any]] = []
        for sample in samples:
            normalized_sample = _normalize_dataset_item_sample(sample)
            inputs = _build_workflow_inputs(
                normalized_sample,
                evaluator,
                payload.variable_mapping,
            )
            result = await _run_workflow_evaluator(evaluator, inputs, settings)
            results.append(
                {
                    "sample": sample,
                    "normalizedSample": normalized_sample,
                    **result,
                }
            )

        async with await _connect(settings) as connection:
            async with connection.cursor() as cursor:
                await _complete_auto_evaluation_success(
                    cursor,
                    project_id=project_id,
                    task_id=task_id,
                    run_id=run_id,
                    payload=payload,
                    evaluator=evaluator,
                    data_source=data_source,
                    results=results,
                )
    except Exception as exc:
        message = _background_error_message(exc)
        async with await _connect(settings) as connection:
            async with connection.cursor() as cursor:
                await _mark_auto_evaluation_failed(
                    cursor,
                    project_id=project_id,
                    task_id=task_id,
                    run_id=run_id,
                    sample_count=len(samples),
                    message=message,
                )


async def _complete_auto_evaluation_success(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    payload: CreateAutoEvaluationPayload,
    evaluator: dict[str, Any],
    data_source: dict[str, Any],
    results: list[dict[str, Any]],
) -> None:
    await cursor.execute(
        """
        SELECT created_at
        FROM pa_auto_evaluation_tasks
        WHERE project_id = %(project_id)s
          AND id = %(task_id)s
          AND deleted_at IS NULL
        LIMIT 1
        """,
        {"project_id": project_id, "task_id": task_id},
    )
    task_row = await cursor.fetchone()
    if task_row is None:
        return

    now = datetime.now(timezone.utc)
    started_at = task_row.get("created_at") or now
    report_id = _new_id("pareport")
    sample_count = len(results)
    badcase_count = sum(1 for result in results if not result["passed"])
    completed_count = sample_count - badcase_count
    execution_stats = {
        "pending": 0,
        "running": 0,
        "completed": completed_count,
        "failed": badcase_count,
        "cancelled": 0,
    }
    report_title = f"{payload.name}报告"
    average_score = sum(result["score"] for result in results) / sample_count
    pass_rate = completed_count / sample_count
    badcase_rate = badcase_count / sample_count
    summary = (
        f"Dify 工作流评估完成，共运行 {sample_count} 条样本，"
        f"平均得分 {average_score:.2f}，通过率 {pass_rate:.0%}。"
    )
    metrics = {
        "averageScore": average_score,
        "passRate": pass_rate,
        "failureRate": badcase_rate,
        "badcaseRate": badcase_rate,
    }
    distribution = _bucket_scores(results)
    group_analysis = [
        {
            "group": data_source["name"],
            "sampleCount": sample_count,
            "averageScore": average_score,
        }
    ]
    recommendations = ["可结合 Badcase 明细定位低分样本，并回流到数据集复测。"]
    risks = ["当前报告由 Dify 工作流后台运行生成，工作流输出质量会影响评分稳定性。"]
    reproduction = {
        "reportId": report_id,
        "sourceTaskId": task_id,
        "scoreName": payload.score_name,
        "evaluatorId": evaluator["id"],
        "workflowRunIds": [
            (result["raw"].get("data") or {}).get("workflow_run_id")
            for result in results
        ],
        "dataSource": data_source,
        "inputMapping": _get_effective_input_mapping(
            evaluator,
            payload.variable_mapping,
        ),
    }

    await cursor.execute(
        """
        INSERT INTO pa_evaluation_reports (
            id, project_id, title, source_type, source_task_id, source_task_name,
            status, sample_count, badcase_count, flowback_count, generated_at,
            summary, metrics, distribution, group_analysis, recommendations,
            risks, reproduction
        )
        VALUES (
            %(id)s, %(project_id)s, %(title)s, 'AUTO_EVAL', %(source_task_id)s, %(source_task_name)s,
            'READY', %(sample_count)s, %(badcase_count)s, 0, %(generated_at)s,
            %(summary)s, %(metrics)s, %(distribution)s, %(group_analysis)s, %(recommendations)s,
            %(risks)s, %(reproduction)s
        )
        """,
        {
            "id": report_id,
            "project_id": project_id,
            "title": report_title,
            "source_task_id": task_id,
            "source_task_name": payload.name,
            "sample_count": sample_count,
            "badcase_count": badcase_count,
            "generated_at": now,
            "summary": summary,
            "metrics": Jsonb(metrics),
            "distribution": Jsonb(distribution),
            "group_analysis": Jsonb(group_analysis),
            "recommendations": Jsonb(recommendations),
            "risks": Jsonb(risks),
            "reproduction": Jsonb(reproduction),
        },
    )
    for result in results:
        sample = result["sample"]
        await cursor.execute(
            """
            INSERT INTO pa_evaluation_report_items (
                id, project_id, report_id, source_id, score_summary, result_type,
                execution_status, dataset_flowback_status
            )
            VALUES (%(id)s, %(project_id)s, %(report_id)s, %(source_id)s, %(score_summary)s, %(result_type)s, 'COMPLETED', 'NONE')
            """,
            {
                "id": _new_id("paitem"),
                "project_id": project_id,
                "report_id": report_id,
                "source_id": sample["id"],
                "score_summary": f"{payload.score_name}: {result['score']:.2f}",
                "result_type": "normal" if result["passed"] else "badcase",
            },
        )
        if not result["passed"]:
            await cursor.execute(
                """
                INSERT INTO pa_evaluation_report_badcases (
                    id, project_id, report_id, trace_id, observation_id, dataset_item_id,
                    score_name, score_value, reason, comment, source_type, flowback_status
                )
                VALUES (%(id)s, %(project_id)s, %(report_id)s, %(trace_id)s, %(observation_id)s, %(dataset_item_id)s,
                        %(score_name)s, %(score_value)s, %(reason)s, %(comment)s, 'AUTO_EVAL', 'NONE')
                """,
                {
                    "id": _new_id("pabadcase"),
                    "project_id": project_id,
                    "report_id": report_id,
                    "trace_id": sample.get("source_trace_id") or "",
                    "observation_id": sample.get("source_observation_id") or "",
                    "dataset_item_id": sample["id"],
                    "score_name": payload.score_name,
                    "score_value": result["score"],
                    "reason": result["reason"],
                    "comment": "Dify 工作流判定未通过。",
                },
            )

    await cursor.execute(
        """
        UPDATE pa_auto_evaluation_tasks
        SET status = 'COMPLETED',
            execution_stats = %(execution_stats)s,
            badcase_count = %(badcase_count)s,
            latest_report_id = %(latest_report_id)s,
            updated_at = %(updated_at)s
        WHERE project_id = %(project_id)s
          AND id = %(task_id)s
          AND deleted_at IS NULL
        """,
        {
            "project_id": project_id,
            "task_id": task_id,
            "execution_stats": Jsonb(execution_stats),
            "badcase_count": badcase_count,
            "latest_report_id": report_id,
            "updated_at": now,
        },
    )
    await cursor.execute(
        """
        UPDATE pa_auto_evaluation_runs
        SET status = 'COMPLETED',
            completed_count = %(completed_count)s,
            failed_count = %(failed_count)s,
            badcase_count = %(badcase_count)s,
            ended_at = %(ended_at)s,
            duration_text = %(duration_text)s
        WHERE project_id = %(project_id)s
          AND task_id = %(task_id)s
          AND id = %(run_id)s
        """,
        {
            "project_id": project_id,
            "task_id": task_id,
            "run_id": run_id,
            "completed_count": completed_count,
            "failed_count": badcase_count,
            "badcase_count": badcase_count,
            "ended_at": now,
            "duration_text": _duration_text(started_at, now),
        },
    )


async def _mark_auto_evaluation_failed(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    sample_count: int,
    message: str,
) -> None:
    now = datetime.now(timezone.utc)
    execution_stats = {
        "pending": 0,
        "running": 0,
        "completed": 0,
        "failed": sample_count,
        "cancelled": 0,
    }
    await cursor.execute(
        """
        UPDATE pa_auto_evaluation_tasks
        SET status = %(status)s,
            execution_stats = %(execution_stats)s,
            updated_at = %(updated_at)s
        WHERE project_id = %(project_id)s
          AND id = %(task_id)s
          AND deleted_at IS NULL
        """,
        {
            "project_id": project_id,
            "task_id": task_id,
            "status": "FAILED",
            "execution_stats": Jsonb(execution_stats),
            "updated_at": now,
        },
    )
    await cursor.execute(
        """
        UPDATE pa_auto_evaluation_runs
        SET status = %(status)s,
            failed_count = %(failed_count)s,
            ended_at = %(ended_at)s,
            duration_text = %(duration_text)s,
            error_message = %(error_message)s
        WHERE project_id = %(project_id)s
          AND task_id = %(task_id)s
          AND id = %(run_id)s
        """,
        {
            "project_id": project_id,
            "task_id": task_id,
            "run_id": run_id,
            "status": "FAILED",
            "failed_count": sample_count,
            "ended_at": now,
            "duration_text": "执行失败",
            "error_message": message,
        },
    )


def _background_error_message(exc: Exception) -> str:
    if isinstance(exc, BusinessError):
        return exc.detail
    if isinstance(exc, httpx.TimeoutException):
        return "Dify 工作流调用超时"
    if isinstance(exc, httpx.HTTPError):
        return "Dify 工作流网络调用失败"
    return "自动评测任务执行失败"


def _duration_text(started_at: datetime, ended_at: datetime) -> str:
    seconds = max(0, int((ended_at - started_at).total_seconds()))
    if seconds < 60:
        return f"{seconds} 秒"
    minutes, remaining_seconds = divmod(seconds, 60)
    return f"{minutes} 分 {remaining_seconds} 秒"


@router.get("/auto-evaluations")
async def list_auto_evaluations(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            like = f"%{keyword or ''}%"
            await cursor.execute(
                """
                SELECT COUNT(*)::int AS total
                FROM pa_auto_evaluation_tasks
                WHERE project_id = %(project_id)s
                  AND deleted_at IS NULL
                  AND (%(keyword)s = '' OR name ILIKE %(like)s OR description ILIKE %(like)s)
                """,
                {"project_id": project_id, "keyword": keyword or "", "like": like},
            )
            total = (await cursor.fetchone() or {}).get("total", 0)
            await cursor.execute(
                """
                SELECT *
                FROM pa_auto_evaluation_tasks
                WHERE project_id = %(project_id)s
                  AND deleted_at IS NULL
                  AND (%(keyword)s = '' OR name ILIKE %(like)s OR description ILIKE %(like)s)
                ORDER BY updated_at DESC, id DESC
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                {
                    "project_id": project_id,
                    "keyword": keyword or "",
                    "like": like,
                    "limit": page_size,
                    "offset": (page - 1) * page_size,
                },
            )
            rows = await cursor.fetchall()
    return success({"total": total, "datas": [_to_task(row) for row in rows]})


@router.get("/auto-evaluations/summary")
async def get_auto_evaluation_summary(
    project_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await cursor.execute(
                """
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS running,
                    COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
                    COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
                    COUNT(*) FILTER (WHERE status IN ('DRAFT', 'READY'))::int AS not_started,
                    COALESCE(SUM(badcase_count), 0)::int AS badcase
                FROM pa_auto_evaluation_tasks
                WHERE project_id = %(project_id)s
                  AND deleted_at IS NULL
                """,
                {"project_id": project_id},
            )
            row = await cursor.fetchone() or {}
    return success(
        {
            "total": row.get("total") or 0,
            "running": row.get("running") or 0,
            "completed": row.get("completed") or 0,
            "failed": row.get("failed") or 0,
            "notStarted": row.get("not_started") or 0,
            "badcase": row.get("badcase") or 0,
        }
    )


@router.get("/auto-evaluations/{task_id}")
async def get_auto_evaluation(
    project_id: str,
    task_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    task = await _fetch_task(project_id, task_id, current_user.user_id, settings)
    return success(task)


@router.delete("/auto-evaluations/{task_id}")
async def delete_auto_evaluation(
    project_id: str,
    task_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await _soft_delete_auto_evaluation_task(cursor, project_id, task_id)
    return success({"id": task_id})


@router.get("/auto-evaluations/{task_id}/latest-report")
async def get_auto_evaluation_latest_report(
    project_id: str,
    task_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    task = await _fetch_task(project_id, task_id, current_user.user_id, settings)
    report_id = task.get("latestReport", {}).get("id")
    if not report_id:
        return success(None)
    return success(task["latestReport"])


@router.get("/auto-evaluations/{task_id}/runs")
async def list_auto_evaluation_runs(
    project_id: str,
    task_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await cursor.execute(
                """
                SELECT *
                FROM pa_auto_evaluation_runs
                WHERE project_id = %(project_id)s AND task_id = %(task_id)s
                ORDER BY started_at DESC, id DESC
                """,
                {"project_id": project_id, "task_id": task_id},
            )
            rows = await cursor.fetchall()
    return success([_to_run(row) for row in rows])


@router.get("/evaluation-reports")
async def list_evaluation_reports(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            like = f"%{keyword or ''}%"
            await cursor.execute(
                """
                SELECT COUNT(*)::int AS total
                FROM pa_evaluation_reports
                WHERE project_id = %(project_id)s
                  AND deleted_at IS NULL
                  AND (%(keyword)s = '' OR title ILIKE %(like)s OR source_task_name ILIKE %(like)s)
                """,
                {"project_id": project_id, "keyword": keyword or "", "like": like},
            )
            total = (await cursor.fetchone() or {}).get("total", 0)
            await cursor.execute(
                """
                SELECT id, project_id, title, source_type, source_task_id, source_task_name,
                       status, sample_count, badcase_count, flowback_count,
                       generated_at, summary, error_message
                FROM pa_evaluation_reports
                WHERE project_id = %(project_id)s
                  AND deleted_at IS NULL
                  AND (%(keyword)s = '' OR title ILIKE %(like)s OR source_task_name ILIKE %(like)s)
                ORDER BY generated_at DESC, id DESC
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                {
                    "project_id": project_id,
                    "keyword": keyword or "",
                    "like": like,
                    "limit": page_size,
                    "offset": (page - 1) * page_size,
                },
            )
            rows = await cursor.fetchall()
    return success({"total": total, "datas": [_to_report(row) for row in rows]})


@router.get("/evaluation-reports/{report_id}")
async def get_evaluation_report(
    project_id: str,
    report_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await cursor.execute(
                """
                SELECT *
                FROM pa_evaluation_reports
                WHERE project_id = %(project_id)s
                  AND id = %(report_id)s
                  AND deleted_at IS NULL
                LIMIT 1
                """,
                {"project_id": project_id, "report_id": report_id},
            )
            row = await cursor.fetchone()
    if row is None:
        raise BusinessError(4004, "评测报告不存在", 404)
    return success(_to_report_detail(row))


@router.delete("/evaluation-reports/{report_id}")
async def delete_evaluation_report(
    project_id: str,
    report_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await cursor.execute(
                """
                UPDATE pa_evaluation_reports
                SET deleted_at = NOW()
                WHERE project_id = %(project_id)s
                  AND id = %(report_id)s
                  AND deleted_at IS NULL
                RETURNING id
                """,
                {"project_id": project_id, "report_id": report_id},
            )
            deleted = await cursor.fetchone()
    if deleted is None:
        raise BusinessError(4004, "评测报告不存在", 404)
    return success({"id": report_id})


@router.get("/evaluation-reports/{report_id}/items")
async def list_evaluation_report_items(
    project_id: str,
    report_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await _ensure_report_exists(cursor, project_id, report_id)
            like = f"%{keyword or ''}%"
            await cursor.execute(
                """
                SELECT COUNT(*)::int AS total
                FROM pa_evaluation_report_items
                WHERE project_id = %(project_id)s
                  AND report_id = %(report_id)s
                  AND (%(keyword)s = '' OR source_id ILIKE %(like)s OR score_summary ILIKE %(like)s)
                """,
                {
                    "project_id": project_id,
                    "report_id": report_id,
                    "keyword": keyword or "",
                    "like": like,
                },
            )
            total = (await cursor.fetchone() or {}).get("total", 0)
            await cursor.execute(
                """
                SELECT *
                FROM pa_evaluation_report_items
                WHERE project_id = %(project_id)s
                  AND report_id = %(report_id)s
                  AND (%(keyword)s = '' OR source_id ILIKE %(like)s OR score_summary ILIKE %(like)s)
                ORDER BY id DESC
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                {
                    "project_id": project_id,
                    "report_id": report_id,
                    "keyword": keyword or "",
                    "like": like,
                    "limit": page_size,
                    "offset": (page - 1) * page_size,
                },
            )
            rows = await cursor.fetchall()
    return success({"total": total, "datas": [_to_report_item(row) for row in rows]})


@router.get("/evaluation-reports/{report_id}/badcases")
async def list_evaluation_report_badcases(
    project_id: str,
    report_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await _ensure_report_exists(cursor, project_id, report_id)
            like = f"%{keyword or ''}%"
            await cursor.execute(
                """
                SELECT COUNT(*)::int AS total
                FROM pa_evaluation_report_badcases
                WHERE project_id = %(project_id)s
                  AND report_id = %(report_id)s
                  AND (
                    %(keyword)s = ''
                    OR trace_id ILIKE %(like)s
                    OR observation_id ILIKE %(like)s
                    OR comment ILIKE %(like)s
                  )
                """,
                {
                    "project_id": project_id,
                    "report_id": report_id,
                    "keyword": keyword or "",
                    "like": like,
                },
            )
            total = (await cursor.fetchone() or {}).get("total", 0)
            await cursor.execute(
                """
                SELECT *
                FROM pa_evaluation_report_badcases
                WHERE project_id = %(project_id)s
                  AND report_id = %(report_id)s
                  AND (
                    %(keyword)s = ''
                    OR trace_id ILIKE %(like)s
                    OR observation_id ILIKE %(like)s
                    OR comment ILIKE %(like)s
                  )
                ORDER BY id DESC
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                {
                    "project_id": project_id,
                    "report_id": report_id,
                    "keyword": keyword or "",
                    "like": like,
                    "limit": page_size,
                    "offset": (page - 1) * page_size,
                },
            )
            rows = await cursor.fetchall()
    return success({"total": total, "datas": [_to_report_badcase(row) for row in rows]})


def _to_report(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "title": row["title"],
        "sourceType": row["source_type"],
        "sourceTaskId": row["source_task_id"],
        "sourceTaskName": row["source_task_name"],
        "status": row["status"],
        "sampleCount": row["sample_count"],
        "badcaseCount": row["badcase_count"],
        "flowbackCount": row["flowback_count"],
        "generatedAt": _format_datetime(row["generated_at"]),
        "summary": row["summary"],
        "errorMessage": row.get("error_message"),
    }


def _to_report_detail(row: dict[str, Any]) -> dict[str, Any]:
    return {
        **_to_report(row),
        "metrics": row.get("metrics") or {},
        "distribution": row.get("distribution") or [],
        "groupAnalysis": row.get("group_analysis") or [],
        "recommendations": row.get("recommendations") or [],
        "risks": row.get("risks") or [],
        "reproduction": row.get("reproduction") or {},
    }


async def _ensure_report_exists(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    report_id: str,
) -> None:
    await cursor.execute(
        """
        SELECT 1
        FROM pa_evaluation_reports
        WHERE project_id = %(project_id)s
          AND id = %(report_id)s
          AND deleted_at IS NULL
        LIMIT 1
        """,
        {"project_id": project_id, "report_id": report_id},
    )
    if await cursor.fetchone() is None:
        raise BusinessError(4004, "评测报告不存在", 404)


async def _soft_delete_auto_evaluation_task(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    task_id: str,
) -> None:
    await cursor.execute(
        """
        UPDATE pa_auto_evaluation_tasks
        SET deleted_at = NOW(),
            updated_at = NOW()
        WHERE project_id = %(project_id)s
          AND id = %(task_id)s
          AND deleted_at IS NULL
        RETURNING id
        """,
        {"project_id": project_id, "task_id": task_id},
    )
    if await cursor.fetchone() is None:
        raise BusinessError(4005, "自动评测任务不存在", 404)

    await cursor.execute(
        """
        UPDATE pa_evaluation_reports
        SET deleted_at = NOW()
        WHERE project_id = %(project_id)s
          AND source_task_id = %(task_id)s
          AND deleted_at IS NULL
        """,
        {"project_id": project_id, "task_id": task_id},
    )


def _to_report_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "reportId": row["report_id"],
        "sourceId": row["source_id"],
        "scoreSummary": row["score_summary"],
        "resultType": row["result_type"],
        "executionStatus": row["execution_status"],
        "datasetFlowbackStatus": row["dataset_flowback_status"],
    }


def _to_report_badcase(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "reportId": row["report_id"],
        "traceId": row["trace_id"],
        "observationId": row["observation_id"],
        "datasetItemId": row["dataset_item_id"],
        "scoreName": row["score_name"],
        "scoreValue": row["score_value"],
        "reason": row["reason"],
        "comment": row["comment"],
        "sourceType": row["source_type"],
        "flowbackStatus": row["flowback_status"],
    }


async def _fetch_task(
    project_id: str,
    task_id: str,
    user_id: str,
    settings: Settings,
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, user_id)
            await cursor.execute(
                """
                SELECT *
                FROM pa_auto_evaluation_tasks
                WHERE project_id = %(project_id)s
                  AND id = %(task_id)s
                  AND deleted_at IS NULL
                LIMIT 1
                """,
                {"project_id": project_id, "task_id": task_id},
            )
            row = await cursor.fetchone()
            if row is None:
                raise BusinessError(4005, "自动评测任务不存在", 404)
            task = _to_task(row)
            if row.get("latest_report_id"):
                await cursor.execute(
                    """
                    SELECT id, title, status, generated_at, sample_count,
                           badcase_count, summary, error_message
                    FROM pa_evaluation_reports
                    WHERE id = %(report_id)s
                      AND project_id = %(project_id)s
                      AND deleted_at IS NULL
                    LIMIT 1
                    """,
                    {"report_id": row["latest_report_id"], "project_id": project_id},
                )
                report = await cursor.fetchone()
                if report:
                    task["latestReport"] = {
                        "id": report["id"],
                        "title": report["title"],
                        "status": report["status"],
                        "generatedAt": _format_datetime(report["generated_at"]),
                        "sampleCount": report["sample_count"],
                        "badcaseCount": report["badcase_count"],
                        "summary": report["summary"],
                        "errorMessage": report.get("error_message"),
                    }
            return task


def _to_task(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "name": row["name"],
        "description": row["description"],
        "scoreName": row["score_name"],
        "status": row["status"],
        "evaluator": {
            "id": row["evaluator_id"],
            "name": row["evaluator_name"],
            "type": row["evaluator_type"],
            "version": row["evaluator_version"],
        },
        "dataSource": row.get("data_source") or {},
        "sampleRate": row["sample_rate"],
        "executionStats": row.get("execution_stats") or {},
        "badcaseCount": row["badcase_count"],
        "createdBy": row["created_by"],
        "createdAt": _format_datetime(row["created_at"]),
        "lastRunAt": _format_datetime(row["last_run_at"]) if row.get("last_run_at") else "",
        "updatedAt": _format_datetime(row["updated_at"]),
    }


def _to_run(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "taskId": row["task_id"],
        "status": row["status"],
        "sampleCount": row["sample_count"],
        "completedCount": row["completed_count"],
        "failedCount": row["failed_count"],
        "badcaseCount": row["badcase_count"],
        "startedAt": _format_datetime(row["started_at"]),
        "endedAt": _format_datetime(row["ended_at"]) if row.get("ended_at") else "",
        "durationText": row["duration_text"],
        "errorMessage": row.get("error_message"),
    }
