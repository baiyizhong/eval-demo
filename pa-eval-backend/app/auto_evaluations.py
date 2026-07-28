import hashlib
import json
import logging
import math
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import psycopg
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, model_validator

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.consolidation.models import JobExecutionStatus, JobExecutionType
from app.consolidation.repository import ConsolidationRepository
from app.data_access.postgres import connect_postgres
from app.errors import BusinessError
from app.langfuse_clickhouse import (
    LangfuseClickHouseReader,
    LangfuseClickHouseScoreWriter,
)
from app.langfuse_db import (
    LangfuseDatabaseConfigError,
    LangfuseDatabaseReader,
    get_langfuse_db_reader,
    PROJECT_ACCESS_EXISTS_SQL,
)
from app.langfuse.datasets_adapter import LangfuseDatasetsAdapter
from app.langfuse_client import (
    LangfuseAdminClient,
    repair_legacy_boolean_score_configs,
)
from app.response import success
from app.score_configs import (
    PA_BOOLEAN_SCORE_CONFIG_REPAIR_MARKER,
    PA_CLICKHOUSE_SCORE_VALUE,
    clickhouse_score_payload,
    is_langfuse_boolean_categories,
    strip_pa_score_fields,
)

router = APIRouter(prefix="/api/projects/{project_id}", tags=["auto-evaluations"])
logger = logging.getLogger(__name__)


def get_langfuse_datasets_adapter(
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> LangfuseDatasetsAdapter:
    return LangfuseDatasetsAdapter(db_reader)

DEFAULT_REPORT_SECTIONS = {
    "metrics": True,
    "distribution": True,
    "groupAnalysis": True,
    "recommendations": True,
    "risks": True,
    "reproduction": True,
    "items": True,
    "badcases": True,
}

DEFAULT_REPORT_TEMPLATE = {
    "id": "default",
    "name": "系统默认模板",
    "description": "自动评测报告默认模板",
    "isDefault": True,
    "titleTemplate": "{taskName}报告",
    "summaryTemplate": (
        "评估完成，共运行 {sampleCount} 条样本，"
        "平均得分 {averageScore}，通过率 {passRate}。"
    ),
    "sections": DEFAULT_REPORT_SECTIONS,
    "badcaseRule": {"mode": "EVALUATOR_RESULT"},
    "recommendations": ["可结合 Badcase 明细定位低分样本，并回流到数据集复测。"],
    "risks": ["当前报告由工作流后台运行生成，工作流输出质量会影响评分稳定性。"],
}


class AutoEvaluationBadcaseConfig(BaseModel):
    enabled: bool = True
    score_name: str = Field(default="", alias="scoreName")
    operator: str = Field(default="LTE", pattern="^(LT|LTE|GT|GTE|EQ)$")
    threshold: float | None = None


class CreateAutoEvaluationPayload(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    description: str = Field(default="", max_length=200)
    score_name: str = Field(alias="scoreName", default="dify_score", min_length=1)
    score_mapping: dict[str, Any] = Field(default_factory=dict, alias="scoreMapping")
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
    report_template_id: str | None = Field(default=None, alias="reportTemplateId")
    report_template_snapshot: dict[str, Any] | None = Field(
        default=None,
        alias="reportTemplateSnapshot",
    )
    badcase: AutoEvaluationBadcaseConfig = Field(
        default_factory=AutoEvaluationBadcaseConfig
    )


class ReportTemplatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    is_default: bool = Field(default=False, alias="isDefault")
    title_template: str = Field(
        default="{taskName}报告",
        alias="titleTemplate",
        min_length=1,
        max_length=200,
    )
    summary_template: str = Field(
        default=(
            "评估完成，共运行 {sampleCount} 条样本，"
            "平均得分 {averageScore}，通过率 {passRate}。"
        ),
        alias="summaryTemplate",
        min_length=1,
        max_length=1000,
    )
    sections: dict[str, Any] = Field(default_factory=dict)
    badcase_rule: dict[str, Any] = Field(default_factory=dict, alias="badcaseRule")
    recommendations: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class TraceCountPayload(BaseModel):
    trace_filter: dict[str, Any] = Field(default_factory=dict, alias="traceFilter")

    @model_validator(mode="after")
    def validate_created_at_range(self) -> "TraceCountPayload":
        if "createdAtRange" not in self.trace_filter:
            return self
        created_at_range = self.trace_filter.get("createdAtRange")
        if (
            not isinstance(created_at_range, list)
            or len(created_at_range) != 2
            or not all(
                isinstance(value, str) and value.strip()
                for value in created_at_range
            )
        ):
            raise ValueError("Trace 时间范围必须包含开始和结束时间")
        return self


class EvaluationReportFlowbackTargetPayload(BaseModel):
    mode: str = Field(pattern="^(EXISTING|CREATE)$")
    dataset_id: str | None = Field(default=None, alias="datasetId")
    name: str | None = Field(default=None, max_length=120)
    description: str = Field(default="", max_length=1000)


class EvaluationReportFlowbackPayload(BaseModel):
    flowback_type: str = Field(
        alias="flowbackType",
        pattern="^(BADCASE|EVALUATION_DATA)$",
    )
    range: str = Field(pattern="^(ALL|CURRENT_FILTER|BADCASE_ONLY|SELECTED)$")
    selected_item_ids: list[str] = Field(default_factory=list, alias="selectedItemIds")
    target_dataset: EvaluationReportFlowbackTargetPayload = Field(alias="targetDataset")
    dedupe_strategy: str = Field(
        default="SKIP_DUPLICATE",
        alias="dedupeStrategy",
        pattern="^(SKIP_DUPLICATE|CREATE_VERSION)$",
    )


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _format_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        formatted = value.isoformat(timespec="milliseconds")
        return formatted.replace("+00:00", "Z")
    return str(value)


def _sample_trace_id(sample: dict[str, Any]) -> str:
    trace = sample.get("trace") if isinstance(sample.get("trace"), dict) else {}
    return _stringify_value(
        sample.get("source_trace_id")
        or sample.get("sourceTraceId")
        or sample.get("trace_id")
        or sample.get("traceId")
        or trace.get("id")
    )


def _sample_observation_id(sample: dict[str, Any]) -> str:
    observation = (
        sample.get("observation") if isinstance(sample.get("observation"), dict) else {}
    )
    return _stringify_value(
        sample.get("source_observation_id")
        or sample.get("sourceObservationId")
        or sample.get("observation_id")
        or sample.get("observationId")
        or observation.get("id")
    )


async def _connect(settings: Settings) -> Any:
    if not settings.langfuse_database_url:
        raise LangfuseDatabaseConfigError()
    return await connect_postgres(
        settings.langfuse_database_url,
        row_factory=dict_row,
    )


async def _ensure_project_access(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    user_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        f"""
        SELECT p.id, p.name
        FROM projects p
        WHERE p.id = %(project_id)s
          AND {PROJECT_ACCESS_EXISTS_SQL}
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
        f"""
        SELECT
            pe.id,
            pe.name,
            pe.type,
            pe.provider,
            pe.version,
            pe.variables,
            COALESCE(pe.output_variables, '[]'::jsonb) AS output_variables,
            pe.config
        FROM pa_evaluators pe
        JOIN projects p ON p.id = pe.project_id
        WHERE pe.id = %(evaluator_id)s
          AND pe.status = 'ACTIVE'
          AND p.deleted_at IS NULL
          AND {PROJECT_ACCESS_EXISTS_SQL}
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
        f"""
        SELECT d.id, d.project_id, d.name
        FROM datasets d
        JOIN projects p ON p.id = d.project_id
        WHERE d.id = %(dataset_id)s
          AND d.project_id = %(project_id)s
          AND p.deleted_at IS NULL
          AND {PROJECT_ACCESS_EXISTS_SQL}
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
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    trace_name = _stringify_value(data_source_payload.get("traceName")).strip()
    user_id = _stringify_value(data_source_payload.get("userId")).strip()
    session_id = _stringify_value(data_source_payload.get("sessionId")).strip()
    tags = data_source_payload.get("tags")
    tag_values = [str(tag) for tag in tags] if isinstance(tags, list) else []
    environments = _normalize_trace_environments(
        data_source_payload.get("environments")
    )

    if settings is not None:
        conditions = _trace_generation_clickhouse_conditions(
            project_id,
            trace_name=trace_name,
            user_id=user_id,
            session_id=session_id,
            tag_values=tag_values,
            environments=environments,
        )
        time_condition = _trace_time_condition(data_source_payload)
        where_clause = " AND ".join(conditions)
        query = f"""
        SELECT
            t.id AS trace_id,
            t.project_id AS project_id,
            t.name AS trace_name,
            t.input AS trace_input,
            t.output AS trace_output,
            t.metadata AS trace_metadata,
            t.user_id AS user_id,
            t.session_id AS session_id,
            t.tags AS tags,
            t.timestamp AS trace_timestamp,
            o.id AS observation_id,
            o.name AS observation_name,
            o.input AS observation_input,
            o.output AS observation_output,
            o.metadata AS observation_metadata,
            o.start_time AS observation_start_time,
            o.created_at AS observation_created_at
        FROM traces t
        INNER JOIN observations o
            ON o.trace_id = t.id
           AND o.project_id = t.project_id
        WHERE {where_clause}
          {time_condition}
        ORDER BY o.start_time DESC, t.timestamp DESC, t.id DESC
        FORMAT JSONEachRow
        """
        rows = await _query_clickhouse_json_each_row(settings, query)
        latest_by_trace: dict[str, dict[str, Any]] = {}
        for row in rows:
            trace_id = _stringify_value(row.get("trace_id"))
            if trace_id and trace_id not in latest_by_trace:
                latest_by_trace[trace_id] = row
        return [_to_trace_generation_sample(row) for row in latest_by_trace.values()]

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
                %(created_at_from)s = ''
                OR t.timestamp >= %(created_at_from)s::timestamptz
              )
              AND (
                %(created_at_to)s = ''
                OR t.timestamp < %(created_at_to)s::timestamptz
              )
              AND (
                cardinality(%(tags)s::text[]) = 0
                OR COALESCE(t.tags, ARRAY[]::text[]) @> %(tags)s::text[]
              )
              AND (
                cardinality(%(environments)s::text[]) = 0
                OR COALESCE(t.environment, 'default') = ANY(%(environments)s::text[])
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
            "environments": environments,
            "created_at_from": _created_at_range_value(
                data_source_payload.get("createdAtRange"),
                0,
            ),
            "created_at_to": _created_at_range_value(
                data_source_payload.get("createdAtRange"),
                1,
            ),
        },
    )
    return [_to_trace_generation_sample(row) for row in await cursor.fetchall()]


async def _count_trace_generation_samples(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    data_source_payload: dict[str, Any],
    settings: Settings | None = None,
) -> int:
    try:
        if settings is not None:
            count = await _count_trace_generation_samples_clickhouse(
                project_id,
                data_source_payload,
                settings,
            )
        else:
            count = await _count_trace_generation_samples_postgres(
                cursor,
                project_id,
                data_source_payload,
            )
    except httpx.HTTPError:
        logger.warning("Trace count unavailable; returning zero", exc_info=True)
        return 0
    return count


async def _count_trace_generation_samples_clickhouse(
    project_id: str,
    data_source_payload: dict[str, Any],
    settings: Settings,
) -> int:
    trace_name = _stringify_value(data_source_payload.get("traceName")).strip()
    user_id = _stringify_value(data_source_payload.get("userId")).strip()
    session_id = _stringify_value(data_source_payload.get("sessionId")).strip()
    tags = data_source_payload.get("tags")
    tag_values = [str(tag) for tag in tags] if isinstance(tags, list) else []
    environments = _normalize_trace_environments(
        data_source_payload.get("environments")
    )
    conditions = _trace_generation_clickhouse_conditions(
        project_id,
        trace_name=trace_name,
        user_id=user_id,
        session_id=session_id,
        tag_values=tag_values,
        environments=environments,
    )
    where_clause = " AND ".join(conditions)
    time_condition = _trace_time_condition(data_source_payload)
    rows = await _query_clickhouse_json_each_row(
        settings,
        f"""
        SELECT countDistinct(t.id) AS count
        FROM traces t
        INNER JOIN observations o
            ON o.trace_id = t.id
           AND o.project_id = t.project_id
        WHERE {where_clause}
          {time_condition}
        FORMAT JSONEachRow
        """,
    )
    if not rows:
        return 0
    return int(rows[0].get("count") or 0)


async def _count_trace_generation_samples_postgres(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    data_source_payload: dict[str, Any],
) -> int:
    trace_name = _stringify_value(data_source_payload.get("traceName")).strip()
    user_id = _stringify_value(data_source_payload.get("userId")).strip()
    session_id = _stringify_value(data_source_payload.get("sessionId")).strip()
    tags = data_source_payload.get("tags")
    tag_values = [str(tag) for tag in tags] if isinstance(tags, list) else []
    environments = _normalize_trace_environments(
        data_source_payload.get("environments")
    )
    await cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM (
            SELECT DISTINCT t.id
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
                %(created_at_from)s = ''
                OR t.timestamp >= %(created_at_from)s::timestamptz
              )
              AND (
                %(created_at_to)s = ''
                OR t.timestamp < %(created_at_to)s::timestamptz
              )
              AND (
                cardinality(%(tags)s::text[]) = 0
                OR COALESCE(t.tags, ARRAY[]::text[]) @> %(tags)s::text[]
              )
              AND (
                cardinality(%(environments)s::text[]) = 0
                OR COALESCE(t.environment, 'default') = ANY(%(environments)s::text[])
              )
        ) matched_traces
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
            "environments": environments,
            "created_at_from": _created_at_range_value(
                data_source_payload.get("createdAtRange"),
                0,
            ),
            "created_at_to": _created_at_range_value(
                data_source_payload.get("createdAtRange"),
                1,
            ),
        },
    )
    row = await cursor.fetchone()
    if row is None:
        return 0
    return int(row.get("count") or 0)


def _sample_dataset_items(
    items: list[dict[str, Any]],
    sample_rate: int,
) -> list[dict[str, Any]]:
    if not items:
        return []

    sample_count = max(1, math.ceil(len(items) * sample_rate / 100))
    return items[:sample_count]


def _normalize_trace_environments(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    environments: list[str] = []
    for item in value:
        environment = str(item).strip()
        if environment and environment.lower() != "all":
            environments.append(environment)
    return environments


def _task_compat_fields(
    data_source: dict[str, Any],
    *,
    evaluator_id: str,
    sample_rate: int,
    report_template_id: str | None,
) -> dict[str, Any]:
    data_source_type = str(data_source.get("type") or "TRACE_FILTER")
    dataset_id = (
        str(data_source.get("datasetId") or "") if data_source_type == "DATASET" else ""
    )
    trace_query = (
        data_source.get("traceFilter")
        if isinstance(data_source.get("traceFilter"), dict)
        else data_source
        if data_source_type == "TRACE_FILTER"
        else {}
    )
    return {
        "data_source_type": data_source_type,
        "dataset_id": dataset_id or None,
        "trace_query": Jsonb(trace_query),
        "evaluator_ids": Jsonb([evaluator_id]),
        "run_config": Jsonb({"sampleRate": sample_rate}),
        "report_config": Jsonb({"reportTemplateId": report_template_id}),
    }


def _auto_evaluation_task_select_sql() -> str:
    return """
        SELECT
            job.legacy_source_id AS id,
            job.project_id,
            job.name,
            job.description,
            job.score_name,
            job.score_mapping,
            job.status,
            COALESCE(job.evaluator_snapshot ->> 'id', job.evaluator_ids ->> 0, '') AS evaluator_id,
            COALESCE(job.evaluator_snapshot ->> 'name', '') AS evaluator_name,
            COALESCE(job.evaluator_snapshot ->> 'type', '') AS evaluator_type,
            COALESCE(job.evaluator_snapshot ->> 'version', '') AS evaluator_version,
            job.evaluator_ids,
            job.data_source,
            job.variable_mapping,
            job.sample_rate,
            job.report_template_id,
            job.report_template_snapshot,
            job.badcase_config,
            job.latest_report_id,
            job.create_by,
            job.create_date,
            job.update_by,
            job.update_date,
            job.last_run_at,
            COALESCE(report.badcase_count, 0) AS badcase_count,
            jsonb_build_object(
                'pending', GREATEST(COALESCE(execution.total_count, 0) - COALESCE(execution.completed_count, 0), 0),
                'running', CASE WHEN execution.status = 'RUNNING' THEN 1 ELSE 0 END,
                'completed', COALESCE(execution.success_count, 0),
                'failed', COALESCE(execution.failure_count, 0),
                'cancelled', CASE WHEN execution.status = 'CANCELLED' THEN 1 ELSE 0 END
            ) AS execution_stats
        FROM pa_evaluation_jobs job
        LEFT JOIN pa_job_executions execution
          ON execution.project_id = job.project_id
         AND execution.id = job.latest_execution_id
        LEFT JOIN pa_evaluation_reports report
          ON report.project_id = job.project_id
         AND report.id = job.latest_report_id
        WHERE job.legacy_source_type = 'AUTO_EVALUATION_TASK'
    """


def _auto_evaluation_run_select_sql() -> str:
    return """
        SELECT
            execution.legacy_source_id AS id,
            execution.project_id,
            job.legacy_source_id AS task_id,
            CASE execution.status
                WHEN 'SUCCEEDED' THEN 'COMPLETED'
                WHEN 'PARTIAL_FAILED' THEN 'COMPLETED'
                ELSE execution.status
            END AS status,
            execution.total_count AS sample_count,
            execution.success_count AS completed_count,
            execution.failure_count AS failed_count,
            COALESCE((execution.result_payload ->> 'badcaseCount')::int, 0) AS badcase_count,
            execution.started_at,
            execution.completed_at AS ended_at,
            CASE
                WHEN execution.started_at IS NULL OR execution.completed_at IS NULL THEN ''
                ELSE EXTRACT(EPOCH FROM (execution.completed_at - execution.started_at))::int::text || ' 秒'
            END AS duration_text,
            NULLIF(execution.error_message, '') AS error_message
        FROM pa_job_executions execution
        JOIN pa_evaluation_jobs job
          ON job.project_id = execution.project_id
         AND job.id = execution.definition_id
         AND job.legacy_source_type = 'AUTO_EVALUATION_TASK'
        WHERE execution.legacy_source_type = 'AUTO_EVALUATION_RUN'
    """


def _stringify_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _parse_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _clickhouse_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _trace_generation_clickhouse_conditions(
    project_id: str,
    *,
    trace_name: str,
    user_id: str,
    session_id: str,
    tag_values: list[str],
    environments: list[str],
) -> list[str]:
    conditions = [
        f"t.project_id = {_clickhouse_quote(project_id)}",
        "t.is_deleted = 0",
        "o.is_deleted = 0",
        "o.type = 'GENERATION'",
    ]
    if trace_name:
        conditions.append(
            f"positionCaseInsensitive(t.name, {_clickhouse_quote(trace_name)}) > 0"
        )
    if user_id:
        conditions.append(
            f"positionCaseInsensitive(ifNull(t.user_id, ''), {_clickhouse_quote(user_id)}) > 0"
        )
    if session_id:
        conditions.append(
            f"positionCaseInsensitive(ifNull(t.session_id, ''), {_clickhouse_quote(session_id)}) > 0"
        )
    if environments:
        quoted_environments = ", ".join(
            _clickhouse_quote(environment) for environment in environments
        )
        conditions.append(f"t.environment IN ({quoted_environments})")
    for tag in tag_values:
        conditions.append(f"has(t.tags, {_clickhouse_quote(tag)})")
    return conditions


def _trace_time_range_condition(time_range: Any) -> str:
    normalized = str(time_range or "1d")
    day_ranges = {
        "1d": 1,
        "24h": 1,
        "3d": 3,
        "7d": 7,
        "14d": 14,
        "30d": 30,
    }
    days = day_ranges.get(normalized, 1)
    return f"AND t.timestamp >= now() - INTERVAL {days} DAY"


def _trace_time_condition(data_source_payload: dict[str, Any]) -> str:
    created_at_from = _created_at_range_value(
        data_source_payload.get("createdAtRange"),
        0,
    )
    created_at_to = _created_at_range_value(
        data_source_payload.get("createdAtRange"),
        1,
    )
    if bool(created_at_from) != bool(created_at_to):
        raise BusinessError(1040, "Trace 时间范围必须包含开始和结束时间", 400)
    if created_at_from and created_at_to:
        return (
            "AND t.timestamp >= parseDateTimeBestEffort("
            f"{_clickhouse_quote(created_at_from)}) "
            "AND t.timestamp < parseDateTimeBestEffort("
            f"{_clickhouse_quote(created_at_to)})"
        )
    return _trace_time_range_condition(data_source_payload.get("timeRange"))


def _created_at_range_value(value: Any, index: int) -> str:
    if not isinstance(value, list) or len(value) <= index:
        return ""
    item = value[index]
    if not isinstance(item, str):
        return ""
    raw_value = item.strip()
    if not raw_value:
        return ""
    try:
        normalized = raw_value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return raw_value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


async def _query_clickhouse_json_each_row(
    settings: Settings,
    query: str,
) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=settings.pa_eval_api_timeout) as client:
        response = await client.post(
            settings.langfuse_clickhouse_url,
            content=query,
            auth=(
                settings.langfuse_clickhouse_user,
                settings.langfuse_clickhouse_password,
            ),
        )
    response.raise_for_status()
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


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
        "trace": {"id": _sample_trace_id(item)},
        "observation": {
            "id": _sample_observation_id(item),
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
    trace_input = _parse_json_object(row.get("trace_input"))
    context = trace_input.get(
        "context",
        trace_metadata.get("context", observation_metadata.get("context", "")),
    )

    return {
        "sourceType": "TRACE_GENERATION",
        "sourceId": _stringify_value(row.get("trace_id")),
        "id": _stringify_value(row.get("observation_id") or row.get("trace_id")),
        "project_id": _stringify_value(row.get("project_id")),
        "dataset_id": "",
        "input": {
            "input": _stringify_value(
                trace_input.get("input", row.get("observation_input"))
            ),
            "output": _stringify_value(
                trace_input.get("output", row.get("observation_output"))
            ),
            "context": _stringify_value(context),
        },
        "expected_output": _stringify_value(trace_input.get("expected_output")),
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
        evaluator.get("variables")
        if isinstance(evaluator.get("variables"), list)
        else []
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
        config.get("inputMapping")
        if isinstance(config.get("inputMapping"), dict)
        else {}
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
    score_mapping: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _validate_workflow_evaluator_ready(evaluator)

    config = evaluator.get("config") or {}
    endpoint_url = config.get("endpointUrl")
    provider = evaluator.get("provider")
    request_payload: dict[str, Any] = {"inputs": inputs}
    if provider == "DIFY":
        request_payload.update(
            {
                "response_mode": "blocking",
                "user": "pa-eval",
            }
        )

    try:
        async with httpx.AsyncClient(timeout=settings.pa_eval_api_timeout) as client:
            response = await client.post(
                str(endpoint_url),
                json=request_payload,
                headers=_build_workflow_headers(evaluator),
            )
    except httpx.HTTPError as exc:
        raise BusinessError(4003, "工作流调用失败：无法连接上游服务", 502) from exc
    if response.status_code >= 400:
        raise BusinessError(
            4003, f"工作流调用失败：上游返回 {response.status_code}", 502
        )

    return _parse_workflow_result(
        evaluator,
        response.json(),
        score_mapping or evaluator.get("score_mapping"),
    )


def _validate_workflow_evaluator_ready(evaluator: dict[str, Any]) -> None:
    config = (
        evaluator.get("config") if isinstance(evaluator.get("config"), dict) else {}
    )
    if not config.get("endpointUrl"):
        raise BusinessError(4002, "工作流评估器缺少工作流地址")
    if evaluator.get("provider") == "DIFY" and not config.get("authToken"):
        raise BusinessError(4002, "Dify 评估器缺少工作流 API Key")


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
    score_mapping: dict[str, Any] | None = None,
) -> dict[str, Any]:
    provider = evaluator.get("provider")
    if provider == "DIFY":
        data = body.get("data") if isinstance(body, dict) else {}
        outputs = data.get("outputs") if isinstance(data, dict) else {}
    else:
        outputs = body

    mapped_scores = _resolve_mapped_scores(evaluator, outputs, score_mapping, body)
    primary_score = next(
        (
            score
            for score in mapped_scores
            if isinstance(score.get("value"), int | float)
        ),
        None,
    )
    score = (
        float(primary_score["value"])
        if primary_score
        else float(outputs.get("score") or 0)
    )
    passed_value = outputs.get("passed")
    if passed_value is None:
        passed = score >= 0.6
    elif isinstance(passed_value, bool):
        passed = passed_value
    else:
        passed = str(passed_value).lower() == "true"
    reason = str(outputs.get("reason") or "")
    result = {
        "raw": body,
        "score": score,
        "passed": passed,
        "reason": reason,
    }
    if mapped_scores:
        result["scores"] = mapped_scores
    return result


def _resolve_mapped_scores(
    evaluator: dict[str, Any],
    outputs: dict[str, Any],
    score_mapping: dict[str, Any] | None,
    raw_body: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    mapping = score_mapping if isinstance(score_mapping, dict) else {}
    if not mapping:
        return []

    output_variables = _workflow_output_variable_names(evaluator, mapping)

    scores: list[dict[str, Any]] = []
    for output_variable in output_variables:
        key = str(output_variable).strip()
        if not key:
            continue
        if key not in mapping:
            continue
        raw_mapping = mapping.get(key)
        mapping_item = raw_mapping if isinstance(raw_mapping, dict) else {}
        name = (
            mapping_item.get("scoreConfigName")
            or mapping_item.get("name")
            or raw_mapping
            or key
        )
        score_config_id = mapping_item.get("scoreConfigId") or mapping_item.get("id")
        raw_value = _workflow_output_value(evaluator, outputs, key, raw_body)
        numeric_value = _to_float_or_none(raw_value)
        score = {
            "outputVariable": key,
            "scoreConfigId": score_config_id,
            "name": str(name),
        }
        if numeric_value is None:
            score["stringValue"] = "" if raw_value is None else str(raw_value)
            score["passed"] = True
        else:
            score["value"] = numeric_value
            score["passed"] = numeric_value >= 0.6
        scores.append(score)
    return scores


def _workflow_output_variable_names(
    evaluator: dict[str, Any],
    score_mapping: dict[str, Any],
) -> list[str]:
    names: list[str] = []
    for variable in _workflow_output_variable_candidates(evaluator):
        name = _workflow_output_variable_name(variable)
        if name and name not in names:
            names.append(name)
    for name in score_mapping.keys():
        key = str(name).strip()
        if key and key not in names:
            names.append(key)
    return names


def _workflow_output_variable_candidates(evaluator: dict[str, Any]) -> list[Any]:
    candidates = evaluator.get("output_variables") or evaluator.get("outputVariables")
    if isinstance(candidates, list) and candidates:
        return candidates

    config = (
        evaluator.get("config") if isinstance(evaluator.get("config"), dict) else {}
    )
    mappings = config.get("outputVariableMappings")
    if isinstance(mappings, list):
        return mappings
    return []


def _workflow_output_variable_name(variable: Any) -> str:
    if isinstance(variable, dict):
        return str(
            variable.get("variableName")
            or variable.get("name")
            or variable.get("key")
            or ""
        ).strip()
    return str(variable).strip()


def _workflow_output_value(
    evaluator: dict[str, Any],
    outputs: dict[str, Any],
    key: str,
    raw_body: dict[str, Any] | None = None,
) -> Any:
    if not isinstance(outputs, dict):
        return None
    if key in outputs:
        return outputs.get(key)

    config = (
        evaluator.get("config") if isinstance(evaluator.get("config"), dict) else {}
    )
    output_mapping = config.get("outputMapping")
    if not isinstance(output_mapping, dict):
        return None
    mapped_path = output_mapping.get(key)
    if not isinstance(mapped_path, str) or not mapped_path.strip():
        return None
    value = _value_from_simple_path(outputs, mapped_path)
    if value is not None or raw_body is None:
        return value
    return _value_from_simple_path(raw_body, mapped_path)


def _value_from_simple_path(source: Any, path: str) -> Any:
    current = source
    normalized_path = path.strip()
    if normalized_path.startswith("$."):
        normalized_path = normalized_path[2:]
    elif normalized_path.startswith("$"):
        normalized_path = normalized_path[1:]
    normalized_path = normalized_path.strip(".")
    if not normalized_path:
        return current

    for segment in normalized_path.split("."):
        if isinstance(current, dict):
            current = current.get(segment)
        elif isinstance(current, list) and segment.isdigit():
            index = int(segment)
            current = current[index] if index < len(current) else None
        else:
            return None
        if current is None:
            return None
    return current


def _to_float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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


def _normalize_report_template_snapshot(
    template: dict[str, Any] | None,
) -> dict[str, Any]:
    raw = template if isinstance(template, dict) else {}
    sections = raw.get("sections") if isinstance(raw.get("sections"), dict) else {}
    badcase_rule = (
        raw.get("badcaseRule")
        if isinstance(raw.get("badcaseRule"), dict)
        else raw.get("badcase_rule")
        if isinstance(raw.get("badcase_rule"), dict)
        else {}
    )
    recommendations = raw.get("recommendations")
    risks = raw.get("risks")

    return {
        **DEFAULT_REPORT_TEMPLATE,
        "id": str(raw.get("id") or DEFAULT_REPORT_TEMPLATE["id"]),
        "name": str(raw.get("name") or DEFAULT_REPORT_TEMPLATE["name"]),
        "description": str(
            raw.get("description") or DEFAULT_REPORT_TEMPLATE["description"]
        ),
        "isDefault": bool(raw.get("isDefault", raw.get("is_default", False))),
        "titleTemplate": str(
            raw.get("titleTemplate")
            or raw.get("title_template")
            or DEFAULT_REPORT_TEMPLATE["titleTemplate"]
        ),
        "summaryTemplate": str(
            raw.get("summaryTemplate")
            or raw.get("summary_template")
            or DEFAULT_REPORT_TEMPLATE["summaryTemplate"]
        ),
        "sections": {**DEFAULT_REPORT_SECTIONS, **sections},
        "badcaseRule": {
            **DEFAULT_REPORT_TEMPLATE["badcaseRule"],
            **badcase_rule,
        },
        "recommendations": (
            [str(item) for item in recommendations]
            if isinstance(recommendations, list)
            else list(DEFAULT_REPORT_TEMPLATE["recommendations"])
        ),
        "risks": (
            [str(item) for item in risks]
            if isinstance(risks, list)
            else list(DEFAULT_REPORT_TEMPLATE["risks"])
        ),
    }


def _apply_auto_evaluation_badcase_config(
    template_snapshot: dict[str, Any],
    badcase: AutoEvaluationBadcaseConfig,
) -> dict[str, Any]:
    if not badcase.enabled or badcase.threshold is None:
        return template_snapshot

    return {
        **template_snapshot,
        "sections": {
            **(template_snapshot.get("sections") or {}),
            "badcases": True,
        },
        "badcaseRule": {
            **(template_snapshot.get("badcaseRule") or {}),
            "mode": "SCORE_THRESHOLD",
            "operator": badcase.operator,
            "threshold": badcase.threshold,
        },
    }


def _compare_score(score: float, operator: str, threshold: float) -> bool:
    normalized = operator.upper()
    if normalized == "LT":
        return score < threshold
    if normalized == "LTE":
        return score <= threshold
    if normalized == "GT":
        return score > threshold
    if normalized == "GTE":
        return score >= threshold
    if normalized == "EQ":
        return score == threshold
    return score <= threshold


def _is_report_badcase(
    result: dict[str, Any], template_snapshot: dict[str, Any]
) -> bool:
    rule = template_snapshot.get("badcaseRule")
    badcase_rule = rule if isinstance(rule, dict) else {}
    mode = str(badcase_rule.get("mode") or "EVALUATOR_RESULT").upper()
    if mode == "SCORE_THRESHOLD":
        threshold = float(badcase_rule.get("threshold") or 0)
        operator = str(badcase_rule.get("operator") or "LTE")
        return _compare_score(float(result["score"]), operator, threshold)
    return not bool(result["passed"])


def _format_report_template(template: str, context: dict[str, str]) -> str:
    rendered = template
    for key, value in context.items():
        rendered = rendered.replace(f"{{{key}}}", value)
    return rendered


def _report_summary_payload(summary: str) -> dict[str, str]:
    return {"text": summary}


def _report_summary_text(summary: Any) -> str:
    if isinstance(summary, dict):
        return str(summary.get("text") or summary.get("summary") or "")
    return str(summary or "")


def _build_report_from_template(
    *,
    task_name: str,
    score_name: str,
    report_id: str,
    task_id: str,
    evaluator: dict[str, Any],
    data_source: dict[str, Any],
    input_mapping: dict[str, Any],
    results: list[dict[str, Any]],
    template_snapshot: dict[str, Any] | None,
) -> dict[str, Any]:
    snapshot = _normalize_report_template_snapshot(template_snapshot)
    sample_count = len(results)
    item_results = [
        "badcase" if _is_report_badcase(result, snapshot) else "normal"
        for result in results
    ]
    badcase_count = item_results.count("badcase")
    passed_count = sample_count - badcase_count
    # completedCount 表示工作流已完成执行的样本数；Badcase 是评分结果，
    # 不应被统计为执行失败，否则任务详情会显示“已完成 0 / 失败 N”。
    completed_count = sample_count
    average_score = sum(result["score"] for result in results) / sample_count
    pass_rate = passed_count / sample_count
    badcase_rate = badcase_count / sample_count
    context = {
        "taskName": task_name,
        "scoreName": score_name,
        "sampleCount": str(sample_count),
        "badcaseCount": str(badcase_count),
        "averageScore": f"{average_score:.2f}",
        "passRate": f"{pass_rate:.0%}",
        "badcaseRate": f"{badcase_rate:.0%}",
        "dataSourceName": str(data_source.get("name") or ""),
    }
    metrics = {
        "averageScore": average_score,
        "passRate": pass_rate,
        "failureRate": badcase_rate,
        "badcaseRate": badcase_rate,
    }
    group_analysis = [
        {
            "group": data_source["name"],
            "sampleCount": sample_count,
            "averageScore": average_score,
        }
    ]
    reproduction = {
        "reportId": report_id,
        "sourceTaskId": task_id,
        "scoreName": score_name,
        "evaluatorId": evaluator["id"],
        "workflowRunIds": [
            (result["raw"].get("data") or {}).get("workflow_run_id")
            for result in results
        ],
        "dataSource": data_source,
        "inputMapping": input_mapping,
    }
    sections = snapshot["sections"]

    return {
        "title": _format_report_template(snapshot["titleTemplate"], context),
        "summary": _format_report_template(snapshot["summaryTemplate"], context),
        "metrics": metrics if sections.get("metrics", True) else {},
        "distribution": _bucket_scores(results)
        if sections.get("distribution", True)
        else [],
        "groupAnalysis": group_analysis if sections.get("groupAnalysis", True) else [],
        "recommendations": snapshot["recommendations"]
        if sections.get("recommendations", True)
        else [],
        "risks": snapshot["risks"] if sections.get("risks", True) else [],
        "reproduction": reproduction if sections.get("reproduction", True) else {},
        "badcaseCount": badcase_count,
        "completedCount": completed_count,
        "itemResults": item_results,
        "templateSnapshot": snapshot,
    }


def _to_report_template(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "projectId": row.get("project_id"),
        "name": row["name"],
        "description": row.get("description") or "",
        "isDefault": bool(row.get("is_default")),
        "titleTemplate": row.get("title_template") or "{taskName}报告",
        "summaryTemplate": row.get("summary_template")
        or DEFAULT_REPORT_TEMPLATE["summaryTemplate"],
        "sections": row.get("sections") or dict(DEFAULT_REPORT_SECTIONS),
        "badcaseRule": row.get("badcase_rule")
        or dict(DEFAULT_REPORT_TEMPLATE["badcaseRule"]),
        "recommendations": row.get("recommendations") or [],
        "risks": row.get("risks") or [],
        "status": row.get("status") or "ACTIVE",
        "createdBy": row.get("create_by", ""),
        "createdAt": _format_datetime(row.get("create_date", "")),
        "updatedAt": _format_datetime(row.get("update_date", "")),
    }


def _default_report_template_response(project_id: str) -> dict[str, Any]:
    return {
        **DEFAULT_REPORT_TEMPLATE,
        "projectId": project_id,
        "status": "ACTIVE",
        "createdBy": "system",
        "createdAt": "",
        "updatedAt": "",
    }


@router.get("/report-templates")
async def list_report_templates(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await cursor.execute(
                """
                SELECT COUNT(*)::int AS total
                FROM pa_evaluation_report_templates
                WHERE project_id = %(project_id)s
                  AND status = 'ACTIVE'
                """,
                {"project_id": project_id},
            )
            total_row = await cursor.fetchone()
            await cursor.execute(
                """
                SELECT id, project_id, name, description, is_default,
                       title_template, summary_template, sections, badcase_rule,
                       recommendations, risks, status,
                       create_by, create_date, update_by, update_date
                FROM pa_evaluation_report_templates
                WHERE project_id = %(project_id)s
                  AND status = 'ACTIVE'
                ORDER BY is_default DESC, update_date DESC, id DESC
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                {"project_id": project_id, "limit": page_size, "offset": offset},
            )
            rows = list(await cursor.fetchall())

    templates = [_to_report_template(row) for row in rows]
    if page == 1:
        templates = [_default_report_template_response(project_id), *templates]
    total = (total_row or {}).get("total", 0) + 1
    return success({"total": total, "datas": templates})


@router.post("/report-templates")
async def create_report_template(
    project_id: str,
    payload: ReportTemplatePayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    template_id = _new_id("pareporttpl")
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            if payload.is_default:
                await cursor.execute(
                    """
                    UPDATE pa_evaluation_report_templates
                    SET is_default = FALSE,
                        update_by = %(update_by)s,
                        update_date = %(update_date)s
                    WHERE project_id = %(project_id)s
                      AND status = 'ACTIVE'
                    """,
                    {
                        "project_id": project_id,
                        "update_by": current_user.email,
                        "update_date": now,
                    },
                )
            await cursor.execute(
                """
                INSERT INTO pa_evaluation_report_templates (
                    id, project_id, name, description, is_default,
                    title_template, summary_template, sections, badcase_rule,
                    recommendations, risks, status,
                    create_by, create_date, update_by, update_date
                )
                VALUES (
                    %(id)s, %(project_id)s, %(name)s, %(description)s, %(is_default)s,
                    %(title_template)s, %(summary_template)s, %(sections)s, %(badcase_rule)s,
                    %(recommendations)s, %(risks)s, 'ACTIVE',
                    %(create_by)s, %(create_date)s, %(update_by)s, %(update_date)s
                )
                """,
                {
                    "id": template_id,
                    "project_id": project_id,
                    "name": payload.name,
                    "description": payload.description,
                    "is_default": payload.is_default,
                    "title_template": payload.title_template,
                    "summary_template": payload.summary_template,
                    "sections": Jsonb(
                        _normalize_report_template_snapshot(
                            {"sections": payload.sections}
                        )["sections"]
                    ),
                    "badcase_rule": Jsonb(
                        _normalize_report_template_snapshot(
                            {"badcaseRule": payload.badcase_rule}
                        )["badcaseRule"]
                    ),
                    "recommendations": Jsonb(payload.recommendations),
                    "risks": Jsonb(payload.risks),
                    "create_by": current_user.email,
                    "create_date": now,
                    "update_by": current_user.email,
                    "update_date": now,
                },
            )

    return success(
        {
            "id": template_id,
            "projectId": project_id,
            **payload.model_dump(by_alias=True),
            "status": "ACTIVE",
            "createdBy": current_user.email,
            "createdAt": _format_datetime(now),
            "updatedAt": _format_datetime(now),
        }
    )


@router.patch("/report-templates/{template_id}")
async def update_report_template(
    project_id: str,
    template_id: str,
    payload: ReportTemplatePayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if template_id == "default":
        raise BusinessError(4011, "系统默认模板不支持修改")

    now = datetime.now(timezone.utc)
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            if payload.is_default:
                await cursor.execute(
                    """
                    UPDATE pa_evaluation_report_templates
                    SET is_default = FALSE,
                        update_by = %(update_by)s,
                        update_date = %(update_date)s
                    WHERE project_id = %(project_id)s
                      AND id != %(template_id)s
                      AND status = 'ACTIVE'
                    """,
                    {
                        "project_id": project_id,
                        "template_id": template_id,
                        "update_by": current_user.email,
                        "update_date": now,
                    },
                )
            await cursor.execute(
                """
                UPDATE pa_evaluation_report_templates
                SET name = %(name)s,
                    description = %(description)s,
                    is_default = %(is_default)s,
                    title_template = %(title_template)s,
                    summary_template = %(summary_template)s,
                    sections = %(sections)s,
                    badcase_rule = %(badcase_rule)s,
                    recommendations = %(recommendations)s,
                    risks = %(risks)s,
                    update_by = %(update_by)s,
                    update_date = %(update_date)s
                WHERE project_id = %(project_id)s
                  AND id = %(template_id)s
                  AND status = 'ACTIVE'
                RETURNING id
                """,
                {
                    "project_id": project_id,
                    "template_id": template_id,
                    "name": payload.name,
                    "description": payload.description,
                    "is_default": payload.is_default,
                    "title_template": payload.title_template,
                    "summary_template": payload.summary_template,
                    "sections": Jsonb(
                        _normalize_report_template_snapshot(
                            {"sections": payload.sections}
                        )["sections"]
                    ),
                    "badcase_rule": Jsonb(
                        _normalize_report_template_snapshot(
                            {"badcaseRule": payload.badcase_rule}
                        )["badcaseRule"]
                    ),
                    "recommendations": Jsonb(payload.recommendations),
                    "risks": Jsonb(payload.risks),
                    "update_by": current_user.email,
                    "update_date": now,
                },
            )
            updated = await cursor.fetchone()
            if updated is None:
                raise BusinessError(4010, "报告模板不存在或无访问权限", 404)

    return success(
        {
            "id": template_id,
            "projectId": project_id,
            **payload.model_dump(by_alias=True),
            "status": "ACTIVE",
            "updatedAt": _format_datetime(now),
        }
    )


@router.delete("/report-templates/{template_id}")
async def delete_report_template(
    project_id: str,
    template_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if template_id == "default":
        raise BusinessError(4012, "系统默认模板不支持删除")

    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await cursor.execute(
                """
                DELETE FROM pa_evaluation_report_templates
                WHERE project_id = %(project_id)s
                  AND id = %(template_id)s
                RETURNING id
                """,
                {"project_id": project_id, "template_id": template_id},
            )
            deleted = await cursor.fetchone()
            if deleted is None:
                raise BusinessError(4010, "报告模板不存在或无访问权限", 404)

    return success({"id": template_id})


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
            _validate_workflow_evaluator_ready(evaluator)
            data_source, samples = await _resolve_auto_evaluation_samples(
                cursor,
                project_id,
                payload,
                current_user.user_id,
                settings,
            )
            report_template_snapshot = await _resolve_report_template_snapshot(
                cursor,
                project_id=project_id,
                template_id=payload.report_template_id,
            )
            report_template_snapshot = _apply_auto_evaluation_badcase_config(
                report_template_snapshot,
                payload.badcase,
            )
            payload = payload.model_copy(
                update={
                    "report_template_id": report_template_snapshot["id"],
                    "report_template_snapshot": report_template_snapshot,
                }
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
                score_mapping=payload.score_mapping,
                evaluator=evaluator,
                data_source=data_source,
                sample_rate=payload.sample_rate,
                sample_count=sample_count,
                report_template_id=payload.report_template_id,
                report_template_snapshot=report_template_snapshot,
                create_by=current_user.email,
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
        current_user.email,
    )

    return success(
        {
            "id": task_id,
            "projectId": project_id,
            "name": payload.name,
            "description": payload.description,
            "scoreName": payload.score_name,
            "scoreMapping": payload.score_mapping,
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
                settings,
            )
    return success({"count": count})


async def _resolve_auto_evaluation_samples(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    payload: CreateAutoEvaluationPayload,
    user_id: str,
    settings: Settings,
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
        samples = _cap_samples_to_saved_count(samples, data_source_payload)
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
        try:
            trace_samples = await _list_trace_generation_samples(
                cursor,
                project_id,
                data_source_payload,
                settings,
            )
        except httpx.HTTPError:
            logger.warning(
                "Trace samples unavailable; returning business error", exc_info=True
            )
            trace_samples = []
        samples = _sample_dataset_items(trace_samples, payload.sample_rate)
        samples = _cap_samples_to_saved_count(samples, data_source_payload)
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
                "createdAtRange": data_source_payload.get("createdAtRange") or [],
                "traceName": data_source_payload.get("traceName"),
                "userId": data_source_payload.get("userId"),
                "sessionId": data_source_payload.get("sessionId"),
                "environments": data_source_payload.get("environments") or [],
                "tags": data_source_payload.get("tags") or [],
            },
            "sampleCount": len(samples),
            "matchedTraceCount": len(trace_samples),
        }

    return data_source, samples


def _cap_samples_to_saved_count(
    samples: list[dict[str, Any]],
    data_source_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    if not _is_saved_auto_evaluation_data_source(data_source_payload):
        return samples
    sample_count = data_source_payload.get("sampleCount")
    if not isinstance(sample_count, int) or sample_count < 1:
        return samples
    return samples[:sample_count]


def _is_saved_auto_evaluation_data_source(data_source_payload: dict[str, Any]) -> bool:
    return any(
        key in data_source_payload
        for key in ("matchedTraceCount", "totalItemCount", "datasetProjectId")
    )


async def _resolve_report_template_snapshot(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    template_id: str | None,
) -> dict[str, Any]:
    if template_id == "default":
        return _normalize_report_template_snapshot(DEFAULT_REPORT_TEMPLATE)

    if template_id:
        await cursor.execute(
            """
            SELECT id, name, description, is_default, title_template, summary_template,
                   sections, badcase_rule, recommendations, risks
            FROM pa_evaluation_report_templates
            WHERE project_id = %(project_id)s
              AND id = %(template_id)s
              AND status = 'ACTIVE'
            LIMIT 1
            """,
            {"project_id": project_id, "template_id": template_id},
        )
    else:
        await cursor.execute(
            """
            SELECT id, name, description, is_default, title_template, summary_template,
                   sections, badcase_rule, recommendations, risks
            FROM pa_evaluation_report_templates
            WHERE project_id = %(project_id)s
              AND status = 'ACTIVE'
            ORDER BY is_default DESC, update_date DESC, id DESC
            LIMIT 1
            """,
            {"project_id": project_id},
        )
    row = await cursor.fetchone()
    if row is None and template_id:
        raise BusinessError(4010, "报告模板不存在或无访问权限", 404)
    if row is None:
        return _normalize_report_template_snapshot(DEFAULT_REPORT_TEMPLATE)
    return _normalize_report_template_snapshot(_to_report_template(row))


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
    report_template_id: str | None,
    report_template_snapshot: dict[str, Any],
    create_by: str,
    now: datetime | None,
    score_mapping: dict[str, Any] | None = None,
) -> None:
    current_time = now or datetime.now(timezone.utc)
    repository = ConsolidationRepository(cursor)
    await repository.upsert_evaluation_job(
            job_id=f"paejob_auto_{task_id}",
            project_id=project_id,
            name=name,
            description=description,
            trigger_type="MANUAL",
            status="RUNNING",
            configuration={
                "scoreName": score_name,
                "evaluatorIds": [evaluator["id"]],
                "evaluatorSnapshot": evaluator,
                "dataSource": data_source,
                "scoreMapping": score_mapping or {},
                "sampleRate": sample_rate,
                "reportTemplateId": report_template_id,
                "reportTemplateSnapshot": report_template_snapshot,
                "lastRunAt": current_time,
            },
            legacy_source_type="AUTO_EVALUATION_TASK",
            legacy_source_id=task_id,
            actor=create_by,
    )
    await repository.create_execution(
            execution_id=f"paexec_auto_{run_id}",
            project_id=project_id,
            job_type=JobExecutionType.AUTO_EVALUATION,
            definition_id=f"paejob_auto_{task_id}",
            idempotency_key=run_id,
            request_payload={
                "taskId": task_id,
                "runId": run_id,
                "reportId": "",
            },
            legacy_source_type="AUTO_EVALUATION_RUN",
            legacy_source_id=run_id,
            actor=create_by,
    )
    await repository.sync_execution_from_legacy(
        execution_id=f"paexec_auto_{run_id}",
        project_id=project_id,
        status=JobExecutionStatus.RUNNING,
        total_count=sample_count,
        completed_count=0,
        success_count=0,
        failure_count=0,
        result_payload={},
        actor=create_by,
    )


async def _insert_rerun_auto_evaluation(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    evaluator_id: str,
    sample_rate: int,
    sample_count: int,
    execution_stats: dict[str, Any],
    data_source: dict[str, Any],
    report_template_id: str | None,
    report_template_snapshot: dict[str, Any],
    updated_by: str,
    now: datetime | None,
) -> None:
    current_time = now or datetime.now(timezone.utc)
    await cursor.execute(
        """
        UPDATE pa_evaluation_jobs
        SET status = 'RUNNING',
            evaluator_ids = jsonb_build_array(%(evaluator_id)s),
            data_source = %(data_source)s,
            latest_report_id = NULL,
            report_template_id = %(report_template_id)s,
            report_template_snapshot = %(report_template_snapshot)s,
            last_run_at = %(last_run_at)s,
            update_by = %(update_by)s,
            update_date = %(update_date)s
        WHERE project_id = %(project_id)s
          AND legacy_source_type = 'AUTO_EVALUATION_TASK'
          AND legacy_source_id = %(task_id)s
        RETURNING id
        """,
        {
            "project_id": project_id,
            "task_id": task_id,
            "evaluator_id": evaluator_id,
            "data_source": Jsonb(data_source),
            "report_template_id": report_template_id,
            "report_template_snapshot": Jsonb(report_template_snapshot),
            "last_run_at": current_time,
            "update_by": updated_by,
            "update_date": current_time,
        },
    )
    if await cursor.fetchone() is None:
        raise BusinessError(4005, "自动评测任务不存在", 404)
    repository = ConsolidationRepository(cursor)
    await repository.create_execution(
        execution_id=f"paexec_auto_{run_id}",
        project_id=project_id,
        job_type=JobExecutionType.AUTO_EVALUATION,
        definition_id=f"paejob_auto_{task_id}",
        idempotency_key=run_id,
        request_payload={"taskId": task_id, "runId": run_id, "reportId": ""},
        legacy_source_type="AUTO_EVALUATION_RUN",
        legacy_source_id=run_id,
        actor=updated_by,
    )
    await repository.sync_execution_from_legacy(
        execution_id=f"paexec_auto_{run_id}",
        project_id=project_id,
        status=JobExecutionStatus.RUNNING,
        total_count=sample_count,
        completed_count=0,
        success_count=0,
        failure_count=0,
        result_payload={},
        actor=updated_by,
    )


async def _update_auto_evaluation_progress(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    sample_count: int,
    completed_count: int,
    failed_count: int,
    running_count: int,
    updated_by: str,
) -> None:
    await ConsolidationRepository(cursor).sync_execution_from_legacy(
            execution_id=f"paexec_auto_{run_id}",
            project_id=project_id,
            status="RUNNING",
            total_count=sample_count,
            completed_count=completed_count + failed_count,
            success_count=completed_count,
            failure_count=failed_count,
            result_payload={
                "completedCount": completed_count,
                "failedCount": failed_count,
            },
            actor=updated_by,
    )


async def _persist_auto_evaluation_progress(
    settings: Settings,
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    sample_count: int,
    completed_count: int,
    failed_count: int = 0,
    running_count: int = 0,
    updated_by: str,
) -> None:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _update_auto_evaluation_progress(
                cursor,
                project_id=project_id,
                task_id=task_id,
                run_id=run_id,
                sample_count=sample_count,
                completed_count=completed_count,
                failed_count=failed_count,
                running_count=running_count,
                updated_by=updated_by,
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
    updated_by: str,
) -> None:
    completed_count = 0
    failed_count = 0
    error_messages: list[str] = []
    try:
        results: list[dict[str, Any]] = []
        sample_count = len(samples)
        for sample in samples:
            await _persist_auto_evaluation_progress(
                settings,
                project_id=project_id,
                task_id=task_id,
                run_id=run_id,
                sample_count=sample_count,
                completed_count=completed_count,
                failed_count=failed_count,
                running_count=1,
                updated_by=updated_by,
            )
            normalized_sample = _normalize_dataset_item_sample(sample)
            inputs = _build_workflow_inputs(
                normalized_sample,
                evaluator,
                payload.variable_mapping,
            )
            try:
                result = await _run_workflow_evaluator(
                    {**evaluator, "score_mapping": payload.score_mapping},
                    inputs,
                    settings,
                )
            except (BusinessError, httpx.HTTPError) as exc:
                failed_count += 1
                error_messages.append(_background_error_message(exc))
                await _persist_auto_evaluation_progress(
                    settings,
                    project_id=project_id,
                    task_id=task_id,
                    run_id=run_id,
                    sample_count=sample_count,
                    completed_count=completed_count,
                    failed_count=failed_count,
                    running_count=0,
                    updated_by=updated_by,
                )
                continue
            results.append(
                {
                    "sample": sample,
                    "normalizedSample": normalized_sample,
                    **result,
                }
            )
            completed_count += 1
            await _persist_auto_evaluation_progress(
                settings,
                project_id=project_id,
                task_id=task_id,
                run_id=run_id,
                sample_count=sample_count,
                completed_count=completed_count,
                failed_count=failed_count,
                running_count=0,
                updated_by=updated_by,
            )

        error_message = _partial_auto_evaluation_error_message(error_messages)
        if not results and failed_count:
            async with await _connect(settings) as connection:
                async with connection.cursor() as cursor:
                    await _mark_auto_evaluation_failed(
                        cursor,
                        project_id=project_id,
                        task_id=task_id,
                        run_id=run_id,
                        sample_count=sample_count,
                        completed_count=0,
                        message=error_message or "自动评测任务执行失败",
                        updated_by=updated_by,
                    )
            return

        async with await _connect(settings) as connection:
            async with connection.cursor() as cursor:
                async with (
                    LangfuseAdminClient(settings) as langfuse_client,
                    LangfuseClickHouseScoreWriter(settings) as score_writer,
                ):
                    await _complete_auto_evaluation_success(
                        cursor,
                        project_id=project_id,
                        task_id=task_id,
                        run_id=run_id,
                        payload=payload,
                        evaluator=evaluator,
                        data_source=data_source,
                        results=results,
                        updated_by=updated_by,
                        langfuse_client=langfuse_client,
                        score_writer=score_writer,
                        failed_count=failed_count,
                        error_message=error_message,
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
                    completed_count=completed_count,
                    message=message,
                    updated_by=updated_by,
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
    updated_by: str,
    langfuse_client: LangfuseAdminClient | None = None,
    score_writer: LangfuseClickHouseScoreWriter | None = None,
    failed_count: int = 0,
    error_message: str | None = None,
) -> None:
    await cursor.execute(
        """
        SELECT
            job.create_by,
            COALESCE(execution.started_at, job.last_run_at, job.create_date) AS started_at
        FROM pa_evaluation_jobs job
        LEFT JOIN pa_job_executions execution
          ON execution.project_id = job.project_id
         AND execution.definition_id = job.id
         AND execution.legacy_source_id = %(run_id)s
         AND execution.legacy_source_type = 'AUTO_EVALUATION_RUN'
        WHERE job.project_id = %(project_id)s
          AND job.legacy_source_id = %(task_id)s
          AND job.legacy_source_type = 'AUTO_EVALUATION_TASK'
        LIMIT 1
        """,
        {"project_id": project_id, "task_id": task_id, "run_id": run_id},
    )
    task_row = await cursor.fetchone()
    if task_row is None:
        return

    now = datetime.now(timezone.utc)
    create_by = task_row.get("create_by") or updated_by
    report_id = _new_id("pareport")
    results = [
        _with_complete_workflow_output_scores(result, payload.score_mapping)
        for result in results
    ]
    input_mapping = _get_effective_input_mapping(
        evaluator,
        payload.variable_mapping,
    )
    report = _build_report_from_template(
        task_name=payload.name,
        score_name=payload.score_name,
        report_id=report_id,
        task_id=task_id,
        evaluator=evaluator,
        data_source=data_source,
        input_mapping=input_mapping,
        results=results,
        template_snapshot=payload.report_template_snapshot,
    )
    sample_count = len(results)
    badcase_count = report["badcaseCount"]
    completed_count = report["completedCount"]
    task_status = "PARTIAL_FAILED" if failed_count else "COMPLETED"
    report_template_snapshot = report["templateSnapshot"]
    report_sections = report_template_snapshot.get("sections")
    report_sections = report_sections if isinstance(report_sections, dict) else {}
    write_report_items = bool(report_sections.get("items", True))
    write_report_badcases = bool(report_sections.get("badcases", True))

    await cursor.execute(
        """
        INSERT INTO pa_evaluation_reports (
            id, project_id, task_id, run_id, name, title,
            source_type, source_task_id, source_task_name,
            status, sample_count, badcase_count, flowback_count, generated_at,
            dataset_id, evaluator_ids, generated_by,
            summary, metrics, distribution, group_analysis, recommendations,
            risks, reproduction, report_template_id, report_template_snapshot,
            created_at, updated_at, create_by, create_date, update_by, update_date
        )
        VALUES (
            %(id)s, %(project_id)s, %(task_id)s, %(run_id)s, %(name)s, %(title)s,
            'AUTO_EVAL', %(source_task_id)s, %(source_task_name)s,
            'READY', %(sample_count)s, %(badcase_count)s, 0, %(generated_at)s,
            %(dataset_id)s, %(evaluator_ids)s, %(generated_by)s,
            %(summary)s, %(metrics)s, %(distribution)s, %(group_analysis)s, %(recommendations)s,
            %(risks)s, %(reproduction)s, %(report_template_id)s, %(report_template_snapshot)s,
            %(created_at)s, %(updated_at)s, %(create_by)s, %(create_date)s, %(update_by)s, %(update_date)s
        )
        """,
        {
            "id": report_id,
            "project_id": project_id,
            "task_id": task_id,
            "run_id": run_id,
            "name": report["title"],
            "title": report["title"],
            "source_task_id": task_id,
            "source_task_name": payload.name,
            "sample_count": sample_count,
            "badcase_count": badcase_count,
            "generated_at": now,
            "dataset_id": data_source.get("datasetId")
            if data_source.get("type") == "DATASET"
            else None,
            "evaluator_ids": Jsonb([evaluator["id"]]),
            "generated_by": create_by,
            "summary": Jsonb(_report_summary_payload(report["summary"])),
            "metrics": Jsonb(report["metrics"]),
            "distribution": Jsonb(report["distribution"]),
            "group_analysis": Jsonb(report["groupAnalysis"]),
            "recommendations": Jsonb(report["recommendations"]),
            "risks": Jsonb(report["risks"]),
            "reproduction": Jsonb(report["reproduction"]),
            "report_template_id": report_template_snapshot["id"],
            "report_template_snapshot": Jsonb(report_template_snapshot),
            "created_at": now,
            "updated_at": now,
            "create_by": create_by,
            "create_date": now,
            "update_by": updated_by,
            "update_date": now,
        },
    )
    execution_status = "PARTIAL_FAILED" if failed_count else "SUCCEEDED"
    repository = ConsolidationRepository(cursor)
    await repository.sync_execution_from_legacy(
        execution_id=f"paexec_auto_{run_id}",
        project_id=project_id,
        status=execution_status,
        total_count=sample_count + failed_count,
        completed_count=completed_count + failed_count,
        success_count=completed_count,
        failure_count=failed_count,
        result_payload={
            "reportId": report_id,
            "badcaseCount": badcase_count,
        },
        error_message=error_message or "",
        actor=updated_by,
    )
    await repository.sync_evaluation_job_state(
        job_id=f"paejob_auto_{task_id}",
        project_id=project_id,
        status=task_status,
        latest_execution_id=f"paexec_auto_{run_id}",
        latest_report_id=report_id,
        actor=updated_by,
    )
    for index, result in enumerate(results):
        sample = result["sample"]
        trace_id = _sample_trace_id(sample)
        observation_id = _sample_observation_id(sample)
        result_type = report["itemResults"][index]
        result_scores = result.get("scores")
        if not isinstance(result_scores, list) or not result_scores:
            result_scores = [
                {
                    "name": payload.score_name,
                    "value": result["score"],
                    "passed": result["passed"],
                }
            ]
        if write_report_items or (
            result_type == "badcase" and write_report_badcases
        ):
            await cursor.execute(
                """
                INSERT INTO pa_evaluation_report_items (
                    id, project_id, report_id, source_item_id, trace_id, observation_id,
                    input, output, expected_output, scores, reason, status, error_type,
                    extra, source_id, score_summary, result_type,
                    execution_status, dataset_flowback_status,
                    is_badcase, badcase_rule_snapshot, primary_score_value,
                    badcase_reason, badcase_comment, badcase_source_type,
                    created_at, updated_at, create_by, create_date, update_by, update_date
                )
                VALUES (
                    %(id)s, %(project_id)s, %(report_id)s, %(source_item_id)s,
                    %(trace_id)s, %(observation_id)s,
                    %(input)s, %(output)s, %(expected_output)s, %(scores)s,
                    %(reason)s, %(status)s, %(error_type)s, %(extra)s,
                    %(source_id)s, %(score_summary)s,
                    %(result_type)s, 'COMPLETED', 'NONE',
                    %(is_badcase)s, %(badcase_rule_snapshot)s, %(primary_score_value)s,
                    %(badcase_reason)s, %(badcase_comment)s, %(badcase_source_type)s,
                    %(created_at)s, %(updated_at)s, %(create_by)s, %(create_date)s, %(update_by)s, %(update_date)s
                )
                """,
                {
                    "id": _new_id("paitem"),
                    "project_id": project_id,
                    "report_id": report_id,
                    "source_item_id": sample["id"],
                    "trace_id": trace_id or None,
                    "observation_id": observation_id or None,
                    "input": Jsonb(sample.get("input") or {}),
                    "output": Jsonb(result["raw"]),
                    "expected_output": Jsonb(sample.get("expected_output") or {}),
                    "scores": Jsonb(result_scores),
                    "reason": result["reason"],
                    "status": "COMPLETED",
                    "error_type": "",
                    "extra": Jsonb({"resultType": result_type}),
                    "source_id": sample["id"],
                    "score_summary": _score_summary(result_scores),
                    "result_type": result_type,
                    "is_badcase": result_type == "badcase",
                    "badcase_rule_snapshot": Jsonb(
                        report_template_snapshot.get("badcaseRule") or {}
                    ),
                    "primary_score_value": result["score"],
                    "badcase_reason": result["reason"] if result_type == "badcase" else "",
                    "badcase_comment": "Dify 工作流判定未通过。"
                    if result_type == "badcase"
                    else "",
                    "badcase_source_type": "AUTO_EVAL"
                    if result_type == "badcase"
                    else "",
                    "created_at": now,
                    "updated_at": now,
                    "create_by": create_by,
                    "create_date": now,
                    "update_by": updated_by,
                    "update_date": now,
                },
            )
    if langfuse_client is not None:
        await _sync_auto_evaluation_scores_to_langfuse(
            cursor,
            project_id=project_id,
            task_id=task_id,
            run_id=run_id,
            score_name=payload.score_name,
            evaluator_id=str(evaluator.get("id") or ""),
            results=results,
            langfuse_client=langfuse_client,
            score_writer=score_writer,
            score_author_user_id=create_by,
        )



def _with_complete_workflow_output_scores(
    result: dict[str, Any],
    score_mapping: dict[str, Any] | None,
) -> dict[str, Any]:
    outputs = _workflow_outputs_from_raw(result.get("raw"))
    if not outputs:
        return result

    existing_scores = result.get("scores")
    mapping = score_mapping if isinstance(score_mapping, dict) else {}
    scores = (
        [
            _mapped_workflow_score(score, mapping)
            for score in existing_scores
            if isinstance(score, dict)
        ]
        if isinstance(existing_scores, list)
        else []
    )
    existing_output_variables = {
        str(score.get("outputVariable") or score.get("name") or "").strip()
        for score in scores
        if isinstance(score, dict)
    }
    for key, raw_value in outputs.items():
        output_variable = str(key).strip()
        if not output_variable or output_variable in existing_output_variables:
            continue
        scores.append(
            _workflow_output_score_from_value(
                output_variable,
                raw_value,
                mapping.get(output_variable),
            )
        )
        existing_output_variables.add(output_variable)

    if not scores:
        return result
    return {**result, "scores": scores}


def _mapped_workflow_score(
    score: dict[str, Any],
    score_mapping: dict[str, Any],
) -> dict[str, Any]:
    mapped_score = dict(score)
    output_variable = str(
        mapped_score.get("outputVariable") or mapped_score.get("name") or ""
    ).strip()
    raw_mapping = score_mapping.get(output_variable)
    if not isinstance(raw_mapping, dict):
        return mapped_score

    mapped_name = raw_mapping.get("scoreConfigName") or raw_mapping.get("name")
    if mapped_name:
        mapped_score["name"] = str(mapped_name)
    mapped_config_id = raw_mapping.get("scoreConfigId") or raw_mapping.get("id")
    if mapped_config_id:
        mapped_score["scoreConfigId"] = mapped_config_id
    return mapped_score


def _workflow_outputs_from_raw(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    data = raw.get("data")
    if isinstance(data, dict) and isinstance(data.get("outputs"), dict):
        return data["outputs"]
    outputs = raw.get("outputs")
    if isinstance(outputs, dict):
        return outputs
    if "data" in raw:
        return {}
    return raw


def _workflow_output_score_from_value(
    output_variable: str,
    raw_value: Any,
    raw_mapping: Any,
) -> dict[str, Any]:
    mapping_item = raw_mapping if isinstance(raw_mapping, dict) else {}
    name = (
        mapping_item.get("scoreConfigName")
        or mapping_item.get("name")
        or raw_mapping
        or output_variable
    )
    score_config_id = mapping_item.get("scoreConfigId") or mapping_item.get("id")
    numeric_value = _to_float_or_none(raw_value)
    score: dict[str, Any] = {
        "outputVariable": output_variable,
        "scoreConfigId": score_config_id,
        "name": str(name),
    }
    if numeric_value is None:
        score["stringValue"] = "" if raw_value is None else str(raw_value)
        score["passed"] = True
    else:
        score["value"] = numeric_value
        score["passed"] = numeric_value >= 0.6
    return score


async def _sync_auto_evaluation_scores_to_langfuse(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    score_name: str,
    evaluator_id: str,
    results: list[dict[str, Any]],
    langfuse_client: LangfuseAdminClient,
    score_writer: LangfuseClickHouseScoreWriter | None = None,
    score_author_user_id: str = "",
) -> None:
    score_config_ids = _auto_evaluation_score_config_ids(results)
    score_configs_by_id = (
        await _get_score_configs_by_ids(cursor, project_id, score_config_ids)
        if score_config_ids
        else {}
    )
    score_payloads = []
    for result in results:
        result_scores = result.get("scores")
        if isinstance(result_scores, list) and result_scores:
            for score in result_scores:
                if "value" not in score and "stringValue" not in score:
                    continue
                score_config_id = str(score.get("scoreConfigId") or "")
                output_score_name = str(score.get("name") or score_name)
                score_payloads.append(
                    _safe_auto_evaluation_score_api_payload(
                        project_id=project_id,
                        task_id=task_id,
                        run_id=run_id,
                        score_name=output_score_name,
                        evaluator_id=evaluator_id,
                        result=result,
                        score_value=score.get("value", score.get("stringValue")),
                        score_passed=(
                            bool(score.get("passed")) if "passed" in score else None
                        ),
                        score_config_id=score_config_id,
                        score_config=score_configs_by_id.get(score_config_id)
                        or score_configs_by_id.get(output_score_name),
                    )
                )
        else:
            score_payloads.append(
                _safe_auto_evaluation_score_api_payload(
                    project_id=project_id,
                    task_id=task_id,
                    run_id=run_id,
                    score_name=score_name,
                    evaluator_id=evaluator_id,
                    result=result,
                )
            )
    score_payloads = [payload for payload in score_payloads if payload is not None]
    if not score_payloads:
        return

    api_key = await _get_project_api_key_credentials(cursor, project_id)
    await repair_legacy_boolean_score_configs(
        langfuse_client,
        api_key["publicKey"],
        api_key["secretKey"],
        score_payloads,
    )
    for raw_score_payload in score_payloads:
        score_payload = strip_pa_score_fields(raw_score_payload)
        await langfuse_client.create_score(
            api_key["publicKey"],
            api_key["secretKey"],
            score_payload,
        )
        if score_writer is not None:
            await score_writer.upsert_score(
                project_id,
                score_author_user_id,
                clickhouse_score_payload(raw_score_payload),
                source="API",
            )


async def _get_project_api_key_credentials(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
) -> dict[str, str]:
    await cursor.execute(
        """
        SELECT public_key, secret_key
        FROM pa_project_api_keys
        WHERE project_id = %(project_id)s
        ORDER BY create_date DESC, id DESC
        LIMIT 1
        """,
        {"project_id": project_id},
    )
    row = await cursor.fetchone()
    if row is None:
        raise BusinessError(
            code=1029,
            message="项目 API Key 未配置",
            status_code=400,
        )
    return {
        "publicKey": row["public_key"],
        "secretKey": row["secret_key"],
    }


def _auto_evaluation_score_config_ids(results: list[dict[str, Any]]) -> list[str]:
    config_ids: list[str] = []
    for result in results:
        result_scores = result.get("scores")
        if not isinstance(result_scores, list):
            continue
        for score in result_scores:
            if not isinstance(score, dict):
                continue
            config_id = str(score.get("scoreConfigId") or "").strip()
            if config_id and config_id not in config_ids:
                config_ids.append(config_id)
            config_name = str(score.get("name") or "").strip()
            if config_name and config_name not in config_ids:
                config_ids.append(config_name)
    return config_ids


async def _get_score_configs_by_ids(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    score_config_ids: list[str],
) -> dict[str, dict[str, Any]]:
    await cursor.execute(
        """
        SELECT
            id,
            name,
            data_type::text AS data_type,
            min_value,
            max_value,
            categories
        FROM score_configs
        WHERE project_id = %(project_id)s
          AND (
            id = ANY(%(score_config_ids)s)
            OR name = ANY(%(score_config_ids)s)
          )
        """,
        {"project_id": project_id, "score_config_ids": score_config_ids},
    )
    rows = await cursor.fetchall()
    configs: dict[str, dict[str, Any]] = {}
    for row in rows:
        configs[str(row["id"])] = row
        configs[str(row["name"])] = row
    return configs


def _safe_auto_evaluation_score_api_payload(**kwargs: Any) -> dict[str, Any] | None:
    try:
        return _auto_evaluation_score_api_payload(**kwargs)
    except (BusinessError, TypeError, ValueError) as exc:
        logger.warning(
            "Skipped invalid auto evaluation score payload: score_name=%s "
            "score_config_id=%s error=%s",
            kwargs.get("score_name") or "",
            kwargs.get("score_config_id") or "",
            _background_error_message(exc)
            if isinstance(exc, BusinessError)
            else type(exc).__name__,
        )
        return None


def _auto_evaluation_score_api_payload(
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    score_name: str,
    evaluator_id: str,
    result: dict[str, Any],
    score_value: Any = None,
    score_passed: bool | None = None,
    score_config_id: str = "",
    score_config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    sample = result.get("sample") or {}
    trace_id = _sample_trace_id(sample)
    if not trace_id:
        return None

    observation_id = _sample_observation_id(sample)
    sample_id = sample.get("id") or ""
    data_type = "NUMERIC"
    payload_value: float | int | str | None = (
        result["score"] if score_value is None else score_value
    )
    string_value: str | None = None
    resolved_config_id = score_config_id
    if score_config is not None:
        resolved_config_id = str(score_config.get("id") or score_config_id)
        (
            data_type,
            payload_value,
            string_value,
            clickhouse_value,
        ) = _normalize_auto_evaluation_score_value(score_config, payload_value)
    else:
        clickhouse_value = payload_value

    payload = {
        "id": _auto_evaluation_score_id(
            project_id=project_id,
            task_id=task_id,
            run_id=run_id,
            sample_id=sample_id,
            score_name=score_name,
            trace_id=trace_id,
            observation_id=observation_id,
        ),
        "name": score_name,
        "value": payload_value,
        "dataType": data_type,
        "traceId": trace_id,
        "queueId": task_id,
        "comment": result.get("reason") or "",
        "metadata": {
            "paAutoEvaluationTaskId": task_id,
            "paAutoEvaluationRunId": run_id,
            "paEvaluationSampleId": sample_id,
            "evaluatorId": evaluator_id,
            "passed": result.get("passed") if score_passed is None else score_passed,
        },
        PA_CLICKHOUSE_SCORE_VALUE: clickhouse_value,
    }
    if string_value is not None:
        payload["stringValue"] = string_value
    if observation_id:
        payload["observationId"] = observation_id
    if resolved_config_id:
        payload["configId"] = resolved_config_id
    if (
        data_type == "BOOLEAN"
        and score_config is not None
        and score_config.get("categories") is not None
        and not is_langfuse_boolean_categories(score_config.get("categories"))
    ):
        payload[PA_BOOLEAN_SCORE_CONFIG_REPAIR_MARKER] = True
    return payload


def _normalize_auto_evaluation_score_value(
    score_config: dict[str, Any],
    raw_value: Any,
) -> tuple[str, float | int | str | None, str | None, float | None]:
    data_type = (
        score_config.get("data_type") or score_config.get("dataType") or "NUMERIC"
    )
    value, string_value = LangfuseDatabaseReader._normalize_score_value(
        score_config,
        raw_value,
        str(raw_value) if raw_value is not None else "",
    )
    if data_type == "BOOLEAN":
        score_value = 1 if value == 1 else 0
        return data_type, score_value, string_value, value
    if data_type in {"CATEGORICAL", "TEXT"}:
        text_value = string_value or ""
        return data_type, text_value, text_value, value
    return data_type, value, None, value


def _auto_evaluation_score_id(
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    sample_id: str,
    score_name: str,
    trace_id: str,
    observation_id: str,
) -> str:
    raw = "|".join(
        [project_id, task_id, run_id, sample_id, score_name, trace_id, observation_id]
    )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
    return f"pa-auto-score-{digest}"


async def _mark_auto_evaluation_failed(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    task_id: str,
    run_id: str,
    sample_count: int,
    completed_count: int = 0,
    message: str,
    updated_by: str,
) -> None:
    failed_count = max(sample_count - completed_count, 0)
    repository = ConsolidationRepository(cursor)
    await repository.sync_execution_from_legacy(
        execution_id=f"paexec_auto_{run_id}",
        project_id=project_id,
        status="FAILED",
        total_count=sample_count,
        completed_count=completed_count + failed_count,
        success_count=completed_count,
        failure_count=failed_count,
        result_payload={"failedCount": failed_count},
        error_message=message,
        actor=updated_by,
    )
    await repository.sync_evaluation_job_state(
        job_id=f"paejob_auto_{task_id}",
        project_id=project_id,
        status="FAILED",
        latest_execution_id=f"paexec_auto_{run_id}",
        latest_report_id=None,
        actor=updated_by,
    )


def _background_error_message(exc: Exception) -> str:
    if isinstance(exc, BusinessError):
        return exc.detail
    if isinstance(exc, httpx.TimeoutException):
        return "Dify 工作流调用超时"
    if isinstance(exc, httpx.HTTPError):
        return "Dify 工作流网络调用失败"
    return "自动评测任务执行失败"


def _partial_auto_evaluation_error_message(messages: list[str]) -> str | None:
    unique_messages = list(dict.fromkeys(message for message in messages if message))
    if not unique_messages:
        return None
    if len(unique_messages) == 1:
        return f"部分样本执行失败：{unique_messages[0]}"
    return "部分样本执行失败：" + "；".join(unique_messages[:3])


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
    status: list[str] = Query(default_factory=list),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            like = f"%{keyword or ''}%"
            await cursor.execute(
                f"""
                SELECT COUNT(*)::int AS total
                FROM ({_auto_evaluation_task_select_sql()}) task
                WHERE task.project_id = %(project_id)s
                  AND (%(keyword)s = '' OR name ILIKE %(like)s OR description ILIKE %(like)s)
                  AND (cardinality(%(status)s::text[]) = 0 OR status = ANY(%(status)s::text[]))
                """,
                {
                    "project_id": project_id,
                    "keyword": keyword or "",
                    "like": like,
                    "status": status,
                },
            )
            total = (await cursor.fetchone() or {}).get("total", 0)
            await cursor.execute(
                f"""
                SELECT task.*
                FROM ({_auto_evaluation_task_select_sql()}) task
                WHERE task.project_id = %(project_id)s
                  AND (%(keyword)s = '' OR name ILIKE %(like)s OR description ILIKE %(like)s)
                  AND (cardinality(%(status)s::text[]) = 0 OR status = ANY(%(status)s::text[]))
                ORDER BY update_date DESC, id DESC
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                {
                    "project_id": project_id,
                    "keyword": keyword or "",
                    "like": like,
                    "status": status,
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
                f"""
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS running,
                    COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
                    COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
                    COUNT(*) FILTER (WHERE status IN ('DRAFT', 'READY'))::int AS not_started,
                    COALESCE(SUM(badcase_count), 0)::int AS badcase
                FROM ({_auto_evaluation_task_select_sql()}) task
                WHERE task.project_id = %(project_id)s
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


@router.post("/auto-evaluations/{task_id}/rerun")
async def rerun_auto_evaluation(
    project_id: str,
    task_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    new_task_id = _new_id("paautoeval")
    run_id = _new_id("parun")

    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await cursor.execute(
                f"""
                SELECT task.*
                FROM ({_auto_evaluation_task_select_sql()}) task
                WHERE task.project_id = %(project_id)s
                  AND task.id = %(task_id)s
                LIMIT 1
                """,
                {"project_id": project_id, "task_id": task_id},
            )
            task_row = await cursor.fetchone()
            if task_row is None:
                raise BusinessError(4005, "自动评测任务不存在", 404)
            if task_row["status"] == "RUNNING":
                raise BusinessError(4008, "任务运行中，暂不支持重新运行", 409)

            evaluator = await _get_pa_evaluator(
                cursor,
                task_row["evaluator_id"],
                current_user.user_id,
            )
            _validate_workflow_evaluator_ready(evaluator)
            payload = CreateAutoEvaluationPayload(
                name=task_row["name"],
                description=task_row["description"],
                scoreName=task_row["score_name"],
                scoreMapping=task_row.get("score_mapping") or {},
                evaluatorId=task_row["evaluator_id"],
                sampleRate=task_row["sample_rate"],
                dataSource=task_row.get("data_source") or {"type": "TRACE_FILTER"},
                variableMapping={},
                reportTemplateId=task_row.get("report_template_id"),
                reportTemplateSnapshot=task_row.get("report_template_snapshot") or {},
            )
            data_source, samples = await _resolve_auto_evaluation_samples(
                cursor,
                project_id,
                payload,
                current_user.user_id,
                settings,
            )
            report_template_snapshot = (
                task_row.get("report_template_snapshot")
                if isinstance(task_row.get("report_template_snapshot"), dict)
                else None
            )
            if report_template_snapshot is None:
                report_template_snapshot = await _resolve_report_template_snapshot(
                    cursor,
                    project_id=project_id,
                    template_id=payload.report_template_id,
                )
            payload = payload.model_copy(
                update={
                    "report_template_id": report_template_snapshot["id"],
                    "report_template_snapshot": report_template_snapshot,
                }
            )
            execution_stats = {
                "pending": len(samples),
                "running": 0,
                "completed": 0,
                "failed": 0,
                "cancelled": 0,
            }
            await _insert_running_auto_evaluation(
                cursor,
                task_id=new_task_id,
                run_id=run_id,
                project_id=project_id,
                name=payload.name,
                description=payload.description,
                score_name=payload.score_name,
                score_mapping=payload.score_mapping,
                evaluator=evaluator,
                data_source=data_source,
                sample_rate=payload.sample_rate,
                sample_count=len(samples),
                report_template_id=payload.report_template_id,
                report_template_snapshot=report_template_snapshot,
                create_by=current_user.email,
                now=now,
            )

    background_tasks.add_task(
        _run_auto_evaluation_background,
        settings,
        project_id,
        new_task_id,
        run_id,
        payload,
        evaluator,
        samples,
        data_source,
        current_user.email,
    )

    return success(
        {
            "id": new_task_id,
            "projectId": project_id,
            "name": payload.name,
            "description": payload.description,
            "scoreName": payload.score_name,
            "scoreMapping": payload.score_mapping,
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
            "latestReport": None,
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
            await _delete_auto_evaluation_task(cursor, project_id, task_id)
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
                f"""
                SELECT execution.*
                FROM ({_auto_evaluation_run_select_sql()}) execution
                WHERE execution.project_id = %(project_id)s
                  AND execution.task_id = %(task_id)s
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
                  AND (%(keyword)s = '' OR title ILIKE %(like)s OR source_task_name ILIKE %(like)s)
                """,
                {"project_id": project_id, "keyword": keyword or "", "like": like},
            )
            total = (await cursor.fetchone() or {}).get("total", 0)
            await cursor.execute(
                """
                SELECT id, project_id, title, source_type, source_task_id, source_task_name,
                       status, sample_count, badcase_count, flowback_count,
                       generated_at, summary, error_message, report_template_id
                FROM pa_evaluation_reports
                WHERE project_id = %(project_id)s
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
                DELETE FROM pa_job_executions
                WHERE project_id = %(project_id)s
                  AND job_type = 'REPORT_FLOWBACK'
                  AND request_payload ->> 'reportId' = %(report_id)s
                """,
                {"project_id": project_id, "report_id": report_id},
            )
            await cursor.execute(
                """
                DELETE FROM pa_evaluation_reports
                WHERE project_id = %(project_id)s
                  AND id = %(report_id)s
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
            await cursor.execute(
                """
                SELECT source_task_id, run_id, report_template_snapshot
                FROM pa_evaluation_reports
                WHERE project_id = %(project_id)s
                  AND id = %(report_id)s
                LIMIT 1
                """,
                {"project_id": project_id, "report_id": report_id},
            )
            report_row = await cursor.fetchone()
            source_task_id = (report_row or {}).get("source_task_id") or ""
            run_id = (report_row or {}).get("run_id") or ""
            template_snapshot = (report_row or {}).get("report_template_snapshot")
            template_snapshot = (
                template_snapshot if isinstance(template_snapshot, dict) else {}
            )
            sections = template_snapshot.get("sections")
            sections = sections if isinstance(sections, dict) else {}
            if sections.get("items", True) is False:
                return success({"total": 0, "datas": []})
            await cursor.execute(
                """
                SELECT id, source_id, trace_id, observation_id, result_type,
                       execution_status, dataset_flowback_status
                FROM pa_evaluation_report_items
                WHERE project_id = %(project_id)s
                  AND report_id = %(report_id)s
                """,
                {"project_id": project_id, "report_id": report_id},
            )
            report_items = await cursor.fetchall()

    if not source_task_id:
        return success({"total": 0, "datas": []})

    scores = await LangfuseClickHouseReader(settings).list_scores_by_queue(
        project_id,
        source_task_id,
        run_id=run_id,
    )
    rows = _evaluation_report_items_from_scores(
        report_id=report_id,
        scores=scores,
        report_items=report_items,
    )
    filtered_rows = _filter_evaluation_report_score_items(rows, keyword or "")
    start = (page - 1) * page_size
    return success(
        {
            "total": len(filtered_rows),
            "datas": filtered_rows[start : start + page_size],
        }
    )


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
            await cursor.execute(
                """
                SELECT
                    r.source_task_id,
                    r.run_id
                FROM pa_evaluation_reports r
                WHERE r.project_id = %(project_id)s
                  AND r.id = %(report_id)s
                LIMIT 1
                """,
                {
                    "project_id": project_id,
                    "report_id": report_id,
                },
            )
            report_row = await cursor.fetchone()
            source_task_id = (report_row or {}).get("source_task_id") or ""
            run_id = (report_row or {}).get("run_id") or ""
            await cursor.execute(
                """
                SELECT id, source_id, trace_id, observation_id,
                       CASE WHEN is_badcase THEN 'badcase' ELSE result_type END AS result_type,
                       is_badcase,
                       execution_status, dataset_flowback_status
                FROM pa_evaluation_report_items
                WHERE project_id = %(project_id)s
                  AND report_id = %(report_id)s
                """,
                {
                    "project_id": project_id,
                    "report_id": report_id,
                },
            )
            report_items = await cursor.fetchall()
    if not source_task_id:
        return success({"total": 0, "datas": []})

    trace_reader = LangfuseClickHouseReader(settings)
    scores = await trace_reader.list_scores_by_queue(
        project_id,
        source_task_id,
        run_id=run_id,
    )
    rows = _evaluation_report_items_from_scores(
        report_id=report_id,
        scores=scores,
        report_items=report_items,
    )
    filtered_rows = _filter_evaluation_report_score_items(rows, keyword or "")
    badcase_rows = [
        row for row in filtered_rows if row.get("resultType") == "badcase"
    ]
    trace_ids = _unique_report_trace_ids(badcase_rows)
    start = (page - 1) * page_size
    page_trace_ids = trace_ids[start : start + page_size]
    traces = await trace_reader.list_traces_by_ids(
        project_id,
        page_trace_ids,
        fields="io,metadata",
    )
    traces_with_scores = _attach_evaluation_report_scores_to_traces(
        traces,
        scores,
    )
    return success({"total": len(trace_ids), "datas": traces_with_scores})


@router.get("/evaluation-reports/{report_id}/flowbacks")
async def list_evaluation_report_flowbacks(
    project_id: str,
    report_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await _ensure_report_exists(cursor, project_id, report_id)
            await cursor.execute(
                """
                SELECT
                    legacy_source_id AS id,
                    request_payload ->> 'reportId' AS report_id,
                    request_payload ->> 'flowbackType' AS flowback_type,
                    COALESCE(
                        result_payload ->> 'targetDatasetId',
                        request_payload ->> 'targetDatasetId'
                    ) AS target_dataset_id,
                    result_payload ->> 'targetDatasetName' AS target_dataset_name,
                    COALESCE((result_payload ->> 'targetDatasetCreated')::boolean, FALSE) AS target_dataset_created,
                    total_count AS requested_count,
                    success_count,
                    failure_count AS failed_count,
                    CASE status
                        WHEN 'SUCCEEDED' THEN 'COMPLETED'
                        ELSE status
                    END AS status,
                    create_by,
                    create_date,
                    COALESCE(result_payload -> 'errorDetail', '[]'::jsonb) AS error_detail
                FROM pa_job_executions
                WHERE project_id = %(project_id)s
                  AND job_type = 'REPORT_FLOWBACK'
                  AND request_payload ->> 'reportId' = %(report_id)s
                ORDER BY create_date DESC, id DESC
                """,
                {"project_id": project_id, "report_id": report_id},
            )
            rows = await cursor.fetchall()
    return success([_to_report_flowback(row) for row in rows])


@router.post("/evaluation-reports/{report_id}/flowbacks/preview")
async def preview_evaluation_report_flowback(
    project_id: str,
    report_id: str,
    payload: EvaluationReportFlowbackPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await _ensure_report_exists(cursor, project_id, report_id)
            preview = await _preview_report_flowback(
                cursor,
                project_id=project_id,
                report_id=report_id,
                payload=payload,
            )
    return success(preview)


@router.post("/evaluation-reports/{report_id}/flowbacks")
async def create_evaluation_report_flowback(
    project_id: str,
    report_id: str,
    payload: EvaluationReportFlowbackPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
    datasets_adapter: LangfuseDatasetsAdapter = Depends(get_langfuse_datasets_adapter),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await _ensure_report_exists(cursor, project_id, report_id)
            flowback = await _create_report_flowback(
                cursor,
                project_id=project_id,
                report_id=report_id,
                payload=payload,
                user_id=current_user.user_id,
                datasets_adapter=datasets_adapter,
                created_by=current_user.email or current_user.user_id,
            )
    return success(flowback)


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
        "summary": _report_summary_text(row["summary"]),
        "errorMessage": row.get("error_message"),
        "reportTemplateId": row.get("report_template_id"),
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
        "reportTemplateId": row.get("report_template_id"),
        "reportTemplateSnapshot": row.get("report_template_snapshot") or {},
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
        LIMIT 1
        """,
        {"project_id": project_id, "report_id": report_id},
    )
    if await cursor.fetchone() is None:
        raise BusinessError(4004, "评测报告不存在", 404)


async def _preview_report_flowback(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    report_id: str,
    payload: EvaluationReportFlowbackPayload,
) -> dict[str, Any]:
    sources = await _list_report_flowback_sources(
        cursor, project_id, report_id, payload
    )
    dataset_name = _default_flowback_dataset_name(payload.flowback_type)
    duplicate_source_ids: set[str] = set()

    if payload.target_dataset.mode == "EXISTING":
        dataset = await _get_report_flowback_target_dataset(
            cursor,
            project_id,
            payload.target_dataset.dataset_id,
        )
        dataset_name = dataset["name"]
        duplicate_source_ids = await _find_report_flowback_duplicate_source_ids(
            cursor,
            project_id,
            dataset["id"],
            report_id,
            sources,
        )

    duplicate_count = len(duplicate_source_ids)
    will_create_count = (
        len(sources) - duplicate_count
        if payload.dedupe_strategy == "SKIP_DUPLICATE"
        else len(sources)
    )
    return {
        "matchedCount": len(sources),
        "duplicateCount": duplicate_count,
        "willCreateCount": max(will_create_count, 0),
        "defaultDatasetName": dataset_name,
    }


async def _create_report_flowback(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    report_id: str,
    payload: EvaluationReportFlowbackPayload,
    user_id: str,
    datasets_adapter: LangfuseDatasetsAdapter,
    created_by: str,
) -> dict[str, Any]:
    sources = await _list_report_flowback_sources(
        cursor,
        project_id,
        report_id,
        payload,
    )
    dataset_created = payload.target_dataset.mode == "CREATE"
    now = datetime.now(timezone.utc)

    if dataset_created:
        dataset_name = (payload.target_dataset.name or "").strip()
        if not dataset_name:
            raise BusinessError(4010, "数据集名称不能为空")
        dataset = await datasets_adapter.create_dataset(
            project_id,
            user_id,
            {
                "name": dataset_name,
                "description": payload.target_dataset.description,
                "metadata": {
                    "type": "evaluation-flowback",
                    "paEvaluationReport": {
                        "reportId": report_id,
                        "flowbackType": payload.flowback_type,
                    },
                },
                "inputSchema": {},
                "expectedOutputSchema": {},
            },
        )
        dataset_id = str(dataset.get("id") or "")
        dataset_name = str(dataset.get("name") or dataset_name)
        if not dataset_id:
            raise BusinessError(4012, "Langfuse 数据集创建失败", 502)
    else:
        dataset = await _get_report_flowback_target_dataset(
            cursor,
            project_id,
            payload.target_dataset.dataset_id,
        )
        dataset_id = dataset["id"]
        dataset_name = dataset["name"]

    duplicate_source_ids = await _find_report_flowback_duplicate_source_ids(
        cursor,
        project_id,
        dataset_id,
        report_id,
        sources,
    )
    inserted_source_ids: list[str] = []
    skipped_count = 0
    for source in sources:
        source_item_id = source["source_item_id"]
        if (
            payload.dedupe_strategy == "SKIP_DUPLICATE"
            and source_item_id in duplicate_source_ids
        ):
            skipped_count += 1
            continue
        await datasets_adapter.create_dataset_item(
            project_id,
            user_id,
            dataset_id,
            {
                "input": _source_input(source),
                "expectedOutput": _source_expected_output(source),
                "metadata": _source_flowback_metadata(
                    source,
                    report_id,
                    payload.flowback_type,
                ),
                "status": "ACTIVE",
                "sourceTraceId": source.get("source_trace_id") or "",
                "sourceObservationId": source.get("source_observation_id") or "",
            },
        )
        inserted_source_ids.append(source_item_id)

    flowback_id = _new_id("paflowback")
    success_count = len(inserted_source_ids)
    failed_count = skipped_count
    status = "COMPLETED" if failed_count == 0 else "PARTIAL_FAILED"
    error_detail = [
        {"itemId": source_id, "reason": "目标数据集已存在同源样本"}
        for source_id in sorted(duplicate_source_ids)
        if source_id not in inserted_source_ids
    ]
    await _mark_report_flowback_sources(
        cursor,
        project_id,
        report_id,
        payload.flowback_type,
        inserted_source_ids,
        created_by,
        now,
    )
    execution_id = f"paexec_report_flowback_{flowback_id}"
    repository = ConsolidationRepository(cursor)
    await repository.create_execution(
        execution_id=execution_id,
        project_id=project_id,
        job_type=JobExecutionType.REPORT_FLOWBACK,
        definition_id=None,
        idempotency_key=flowback_id,
        request_payload={
            "reportId": report_id,
            "flowbackType": payload.flowback_type,
            "targetDatasetId": dataset_id,
        },
        legacy_source_type="REPORT_FLOWBACK",
        legacy_source_id=flowback_id,
        actor=created_by,
    )
    await repository.sync_execution_from_legacy(
        execution_id=execution_id,
        project_id=project_id,
        status=(
            JobExecutionStatus.SUCCEEDED
            if failed_count == 0
            else JobExecutionStatus.PARTIAL_FAILED
        ),
        total_count=len(sources),
        completed_count=len(sources),
        success_count=success_count,
        failure_count=failed_count,
        result_payload={
            "targetDatasetId": dataset_id,
            "targetDatasetName": dataset_name,
            "targetDatasetCreated": dataset_created,
            "requestedCount": len(sources),
            "successCount": success_count,
            "failedCount": failed_count,
            "skippedCount": skipped_count,
            "errorDetail": error_detail,
        },
        actor=created_by,
    )
    return {
        "id": flowback_id,
        "reportId": report_id,
        "flowbackType": payload.flowback_type,
        "targetDatasetId": dataset_id,
        "targetDatasetName": dataset_name,
        "targetDatasetCreated": dataset_created,
        "requestedCount": len(sources),
        "successCount": success_count,
        "failedCount": failed_count,
        "status": status,
        "createdBy": created_by,
        "createdAt": _format_datetime(now),
        "errorDetail": error_detail,
    }


def _filter_report_flowback_sources(
    rows: list[dict[str, Any]],
    payload: EvaluationReportFlowbackPayload,
) -> list[dict[str, Any]]:
    selected_ids = set(payload.selected_item_ids)
    if payload.range == "SELECTED":
        return [row for row in rows if row["source_item_id"] in selected_ids]
    if payload.range == "BADCASE_ONLY":
        return [row for row in rows if row.get("result_type") == "badcase"]
    return rows


async def _list_report_flowback_sources(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    report_id: str,
    payload: EvaluationReportFlowbackPayload,
) -> list[dict[str, Any]]:
    if payload.flowback_type == "BADCASE":
        await cursor.execute(
            """
            SELECT
                ri.id AS source_item_id,
                ri.source_id AS source_dataset_item_id,
                ri.trace_id AS source_trace_id,
                ri.observation_id AS source_observation_id,
                COALESCE(t.input, o.input, di.input) AS input,
                COALESCE(o.output, t.output) AS output,
                CASE
                    WHEN t.id IS NOT NULL OR o.id IS NOT NULL THEN NULL
                    ELSE di.expected_output
                END AS expected_output,
                COALESCE(t.metadata, o.metadata, di.metadata) AS metadata,
                ri.primary_score_value AS score_value,
                ri.badcase_reason AS reason,
                ri.badcase_comment AS comment,
                ri.score_summary,
                TRUE AS prefer_trace_payload,
                'badcase' AS result_type
            FROM pa_evaluation_report_items ri
            LEFT JOIN dataset_items di
              ON di.project_id = ri.project_id
             AND di.id = ri.source_id
             AND di.valid_to IS NULL
             AND di.is_deleted IS FALSE
            LEFT JOIN traces t
              ON t.project_id = ri.project_id
             AND t.id = ri.trace_id
            LEFT JOIN observations o
              ON o.project_id = ri.project_id
             AND o.trace_id = ri.trace_id
             AND o.id = ri.observation_id
            WHERE ri.project_id = %(project_id)s
              AND ri.report_id = %(report_id)s
              AND ri.is_badcase IS TRUE
            ORDER BY ri.id ASC
            """,
            {"project_id": project_id, "report_id": report_id},
        )
    else:
        await cursor.execute(
            """
            SELECT
                ri.id AS source_item_id,
                ri.source_id AS source_dataset_item_id,
                COALESCE(di.source_trace_id, '') AS source_trace_id,
                COALESCE(di.source_observation_id, '') AS source_observation_id,
                di.input,
                ri.output,
                di.expected_output,
                di.metadata,
                NULL::double precision AS score_value,
                ri.score_summary AS reason,
                '' AS comment,
                ri.score_summary,
                FALSE AS prefer_trace_payload,
                ri.result_type
            FROM pa_evaluation_report_items ri
            LEFT JOIN dataset_items di
              ON di.project_id = ri.project_id
             AND di.id = ri.source_id
             AND di.valid_to IS NULL
             AND di.is_deleted IS FALSE
            WHERE ri.project_id = %(project_id)s
              AND ri.report_id = %(report_id)s
            ORDER BY ri.id ASC
            """,
            {"project_id": project_id, "report_id": report_id},
        )
    rows = list(await cursor.fetchall())
    return _filter_report_flowback_sources(rows, payload)


async def _get_report_flowback_target_dataset(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    dataset_id: str | None,
) -> dict[str, Any]:
    if not dataset_id:
        raise BusinessError(4011, "请选择目标数据集")
    await cursor.execute(
        """
        SELECT id, name
        FROM datasets
        WHERE project_id = %(project_id)s
          AND id = %(dataset_id)s
        LIMIT 1
        """,
        {"project_id": project_id, "dataset_id": dataset_id},
    )
    dataset = await cursor.fetchone()
    if dataset is None:
        raise BusinessError(1011, "数据集不存在或无访问权限", 404)
    return dataset


async def _find_report_flowback_duplicate_source_ids(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    dataset_id: str,
    report_id: str,
    sources: list[dict[str, Any]],
) -> set[str]:
    if not sources:
        return set()
    source_item_ids = [source["source_item_id"] for source in sources]
    source_dataset_item_ids = [
        source["source_dataset_item_id"]
        for source in sources
        if source.get("source_dataset_item_id")
    ]
    source_trace_ids = [
        source["source_trace_id"] for source in sources if source.get("source_trace_id")
    ]
    source_observation_ids = [
        source["source_observation_id"]
        for source in sources
        if source.get("source_observation_id")
    ]
    await cursor.execute(
        """
        SELECT
            source_trace_id,
            source_observation_id,
            metadata
        FROM dataset_items
        WHERE project_id = %(project_id)s
          AND dataset_id = %(dataset_id)s
          AND valid_to IS NULL
          AND is_deleted IS FALSE
          AND (
            (source_trace_id = ANY(%(source_trace_ids)s) AND source_trace_id <> '')
            OR (source_observation_id = ANY(%(source_observation_ids)s) AND source_observation_id <> '')
            OR metadata #>> '{paEvaluationReport,reportId}' = %(report_id)s
            OR metadata #>> '{paEvaluationReport,sourceItemId}' = ANY(%(source_item_ids)s)
            OR metadata #>> '{paEvaluationReport,sourceDatasetItemId}' = ANY(%(source_dataset_item_ids)s)
          )
        """,
        {
            "project_id": project_id,
            "dataset_id": dataset_id,
            "report_id": report_id,
            "source_item_ids": source_item_ids,
            "source_dataset_item_ids": source_dataset_item_ids,
            "source_trace_ids": source_trace_ids,
            "source_observation_ids": source_observation_ids,
        },
    )
    existing_rows = list(await cursor.fetchall())
    duplicate_source_ids: set[str] = set()
    for source in sources:
        source_metadata_keys = {
            source["source_item_id"],
            source.get("source_dataset_item_id"),
        }
        for row in existing_rows:
            metadata = (
                row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
            )
            pa_metadata = metadata.get("paEvaluationReport") or {}
            if (
                (
                    source.get("source_trace_id")
                    and row.get("source_trace_id") == source.get("source_trace_id")
                )
                or (
                    source.get("source_observation_id")
                    and row.get("source_observation_id")
                    == source.get("source_observation_id")
                )
                or pa_metadata.get("sourceItemId") in source_metadata_keys
                or pa_metadata.get("sourceDatasetItemId") in source_metadata_keys
            ):
                duplicate_source_ids.add(source["source_item_id"])
                break
    return duplicate_source_ids


async def _mark_report_flowback_sources(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    report_id: str,
    flowback_type: str,
    source_item_ids: list[str],
    update_by: str,
    now: datetime,
) -> None:
    if not source_item_ids:
        return
    await cursor.execute(
        """
        UPDATE pa_evaluation_report_items
        SET dataset_flowback_status = 'FLOWED_BACK',
            extra = CASE
                WHEN jsonb_typeof(extra -> 'paLegacyBadcases') = 'array'
                THEN jsonb_set(
                    extra,
                    '{paLegacyBadcases}',
                    (
                        SELECT jsonb_agg(
                            legacy_badcase
                            || jsonb_build_object(
                                'flowbackStatus', 'FLOWED_BACK'
                            )
                        )
                        FROM jsonb_array_elements(
                            extra -> 'paLegacyBadcases'
                        ) legacy_badcase
                    ),
                    TRUE
                )
                ELSE extra
            END,
            update_by = %(update_by)s,
            update_date = %(update_date)s
        WHERE project_id = %(project_id)s
          AND report_id = %(report_id)s
          AND id = ANY(%(source_item_ids)s)
        """,
        {
            "project_id": project_id,
            "report_id": report_id,
            "source_item_ids": source_item_ids,
            "update_by": update_by,
            "update_date": now,
        },
    )
    await cursor.execute(
        """
        UPDATE pa_evaluation_reports
        SET flowback_count = flowback_count + %(success_count)s,
            update_by = %(update_by)s,
            update_date = %(update_date)s
        WHERE project_id = %(project_id)s
          AND id = %(report_id)s
        """,
        {
            "project_id": project_id,
            "report_id": report_id,
            "success_count": len(source_item_ids),
            "update_by": update_by,
            "update_date": now,
        },
    )


def _default_flowback_dataset_name(flowback_type: str) -> str:
    suffix = datetime.now(timezone.utc).strftime("%Y%m%d")
    if flowback_type == "BADCASE":
        return f"badcase-自动评测-回流-{suffix}"
    return f"evaluation-data-自动评测-回流-{suffix}"


def _source_input(source: dict[str, Any]) -> Any:
    if source.get("output") is not None:
        raw_input = source.get("input")
        if isinstance(raw_input, dict) and any(
            key in raw_input for key in ("input", "output", "context")
        ):
            payload = dict(raw_input)
            payload.setdefault("input", raw_input.get("input", raw_input))
            payload["output"] = source["output"]
            return payload
        return {
            "input": raw_input,
            "output": source["output"],
        }
    if source.get("input") is not None:
        return source["input"]
    return {
        "traceId": source.get("source_trace_id") or "",
        "observationId": source.get("source_observation_id") or "",
        "datasetItemId": source.get("source_dataset_item_id") or "",
        "reason": source.get("reason") or "",
    }


def _source_expected_output(source: dict[str, Any]) -> Any:
    if source.get("prefer_trace_payload"):
        return {}
    if source.get("expected_output") is not None:
        return source["expected_output"]
    return {
        "reason": source.get("reason") or "",
        "comment": source.get("comment") or "",
        "scoreSummary": source.get("score_summary") or "",
    }


def _source_flowback_metadata(
    source: dict[str, Any],
    report_id: str,
    flowback_type: str,
) -> dict[str, Any]:
    metadata = (
        source.get("metadata") if isinstance(source.get("metadata"), dict) else {}
    )
    return {
        **metadata,
        "paEvaluationReport": {
            "reportId": report_id,
            "flowbackType": flowback_type,
            "sourceItemId": source["source_item_id"],
            "sourceDatasetItemId": source.get("source_dataset_item_id") or "",
            "scoreValue": source.get("score_value"),
            "reason": source.get("reason") or "",
            "comment": source.get("comment") or "",
        },
    }


async def _delete_auto_evaluation_task(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    project_id: str,
    task_id: str,
) -> None:
    await cursor.execute(
        """
        DELETE FROM pa_job_executions execution
        WHERE execution.project_id = %(project_id)s
          AND execution.job_type = 'REPORT_FLOWBACK'
          AND execution.request_payload ->> 'reportId' IN (
              SELECT report.id
              FROM pa_evaluation_reports report
              WHERE report.project_id = %(project_id)s
                AND report.source_task_id = %(task_id)s
          )
        """,
        {"project_id": project_id, "task_id": task_id},
    )
    await cursor.execute(
        """
        DELETE FROM pa_job_executions
        WHERE project_id = %(project_id)s
          AND definition_id = 'paejob_auto_' || %(task_id)s
        """,
        {"project_id": project_id, "task_id": task_id},
    )
    await cursor.execute(
        """
        DELETE FROM pa_evaluation_jobs
        WHERE project_id = %(project_id)s
          AND legacy_source_type = 'AUTO_EVALUATION_TASK'
          AND legacy_source_id = %(task_id)s
        RETURNING legacy_source_id AS id
        """,
        {"project_id": project_id, "task_id": task_id},
    )
    if await cursor.fetchone() is None:
        raise BusinessError(4005, "自动评测任务不存在", 404)

    await cursor.execute(
        """
        DELETE FROM pa_evaluation_reports
        WHERE project_id = %(project_id)s
          AND source_task_id = %(task_id)s
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


def _evaluation_report_items_from_scores(
    *,
    report_id: str,
    scores: list[dict[str, Any]],
    report_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    item_by_source_id: dict[str, dict[str, Any]] = {}
    for item in report_items:
        for key in (
            item.get("source_id"),
            item.get("observation_id"),
            item.get("trace_id"),
        ):
            if key:
                item_by_source_id[str(key)] = item

    grouped: dict[str, dict[str, Any]] = {}
    for score in scores:
        source_id = (
            score.get("observationId")
            or score.get("traceId")
            or score.get("metadata", {}).get("paEvaluationSampleId")
            or score.get("id")
            or ""
        )
        if not source_id:
            continue
        source_id = str(source_id)
        report_item = item_by_source_id.get(source_id)
        row = grouped.setdefault(
            source_id,
            {
                "id": report_item.get("id") if report_item else score.get("id"),
                "reportId": report_id,
                "sourceId": source_id,
                "traceId": score.get("traceId") or "",
                "observationId": score.get("observationId") or "",
                "scores": [],
                "scoreSummary": "",
                "resultType": report_item.get("result_type")
                if report_item
                else _score_result_type(score),
                "executionStatus": report_item.get("execution_status")
                if report_item
                else "COMPLETED",
                "datasetFlowbackStatus": report_item.get("dataset_flowback_status")
                if report_item
                else "NONE",
            },
        )
        row["scores"].append(score)
        if row["resultType"] != "badcase" and _score_result_type(score) == "badcase":
            row["resultType"] = "badcase"

    for row in grouped.values():
        row["scoreSummary"] = _score_summary(row["scores"])

    return sorted(
        grouped.values(),
        key=lambda row: max(
            (score.get("createdAt") or "" for score in row.get("scores") or []),
            default="",
        ),
        reverse=True,
    )


def _attach_evaluation_report_scores_to_traces(
    traces: list[dict[str, Any]],
    scores: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    scores_by_trace: dict[str, list[dict[str, Any]]] = {}
    for score in scores:
        trace_id = str(score.get("traceId") or "").strip()
        if trace_id:
            scores_by_trace.setdefault(trace_id, []).append(score)

    traces_with_scores: list[dict[str, Any]] = []
    for trace in traces:
        trace_id = str(trace.get("traceId") or "").strip()
        trace_scores = scores_by_trace.get(trace_id, [])
        traces_with_scores.append(
            {
                **trace,
                "scores": trace_scores,
                "scoreSummary": _score_summary(trace_scores),
            }
        )
    return traces_with_scores


def _score_result_type(score: dict[str, Any]) -> str:
    metadata = score.get("metadata") if isinstance(score.get("metadata"), dict) else {}
    passed = metadata.get("passed")
    if passed is False or str(passed).lower() == "false":
        return "badcase"
    return "normal"


def _filter_evaluation_report_score_items(
    rows: list[dict[str, Any]],
    keyword: str,
) -> list[dict[str, Any]]:
    normalized_keyword = keyword.strip().lower()
    if not normalized_keyword:
        return rows
    return [
        row
        for row in rows
        if normalized_keyword in str(row.get("sourceId") or "").lower()
        or normalized_keyword in str(row.get("scoreSummary") or "").lower()
        or any(
            normalized_keyword in str(score.get("name") or "").lower()
            or normalized_keyword in str(score.get("value") or "").lower()
            or normalized_keyword in str(score.get("stringValue") or "").lower()
            for score in row.get("scores") or []
        )
    ]


def _evaluation_report_score_item_is_badcase(
    row: dict[str, Any],
    *,
    score_name: str,
    report_template_snapshot: dict[str, Any],
) -> bool:
    rule = report_template_snapshot.get("badcaseRule")
    badcase_rule = rule if isinstance(rule, dict) else {}
    mode = str(badcase_rule.get("mode") or "EVALUATOR_RESULT").upper()
    if mode == "SCORE_THRESHOLD":
        threshold = _to_float_or_none(badcase_rule.get("threshold"))
        if threshold is None:
            return False
        operator = str(badcase_rule.get("operator") or "LTE")
        for score in row.get("scores") or []:
            if str(score.get("name") or "") != score_name:
                continue
            value = _to_float_or_none(score.get("value"))
            if value is None:
                continue
            return _compare_score(value, operator, threshold)
        return False
    return row.get("resultType") == "badcase"


def _unique_report_trace_ids(rows: list[dict[str, Any]]) -> list[str]:
    trace_ids: list[str] = []
    for row in rows:
        trace_id = str(row.get("traceId") or "").strip()
        if trace_id and trace_id not in trace_ids:
            trace_ids.append(trace_id)
    return trace_ids


def _score_summary(scores: list[dict[str, Any]]) -> str:
    labels = []
    for score in scores[:3]:
        name = score.get("name") or "score"
        value = score.get("stringValue") or score.get("longStringValue")
        if value in (None, ""):
            value = score.get("value")
        labels.append(f"{name}: {value}")
    if len(scores) > 3:
        labels.append(f"+{len(scores) - 3}")
    return " / ".join(labels)


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
        "scoreSummary": _score_summary_json(row.get("score_summary_scores")),
        "comment": row["comment"],
        "sourceType": row["source_type"],
        "flowbackStatus": row["flowback_status"],
    }


def _score_summary_json(scores: Any) -> str:
    if not isinstance(scores, list):
        return "{}"

    summary: dict[str, Any] = {}
    for score in scores:
        if not isinstance(score, dict):
            continue
        output_variable = str(score.get("outputVariable") or "").strip()
        name = str(score.get("name") or output_variable or "score").strip()
        normalized_name = name.lower()
        if normalized_name in {"score", "reason"} or output_variable.lower() in {
            "score",
            "reason",
        }:
            continue
        value = score.get("stringValue") or score.get("longStringValue")
        if value in (None, ""):
            value = score.get("value")
        summary[name] = value

    return json.dumps(summary, ensure_ascii=False)


def _to_report_flowback(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "reportId": row["report_id"],
        "flowbackType": row["flowback_type"],
        "targetDatasetId": row["target_dataset_id"],
        "targetDatasetName": row["target_dataset_name"],
        "targetDatasetCreated": row["target_dataset_created"],
        "requestedCount": row["requested_count"],
        "successCount": row["success_count"],
        "failedCount": row["failed_count"],
        "status": row["status"],
        "createdBy": row["create_by"],
        "createdAt": _format_datetime(row["create_date"]),
        "errorDetail": row.get("error_detail") or [],
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
                f"""
                SELECT task.*
                FROM ({_auto_evaluation_task_select_sql()}) task
                WHERE task.project_id = %(project_id)s
                  AND task.id = %(task_id)s
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
                        "summary": _report_summary_text(report["summary"]),
                        "errorMessage": report.get("error_message"),
                    }
            return task


def _to_task(row: dict[str, Any]) -> dict[str, Any]:
    evaluator_version = str(row.get("evaluator_version") or "").strip()
    if evaluator_version.isdigit():
        evaluator_version = f"v{evaluator_version}"
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "name": row["name"],
        "description": row["description"],
        "scoreName": row["score_name"],
        "scoreMapping": row.get("score_mapping") or {},
        "status": row["status"],
        "evaluator": {
            "id": row["evaluator_id"],
            "name": row["evaluator_name"],
            "type": row["evaluator_type"],
            "version": evaluator_version,
        },
        "dataSource": row.get("data_source") or {},
        "sampleRate": row["sample_rate"],
        "executionStats": row.get("execution_stats") or {},
        "badcaseCount": row["badcase_count"],
        "createdBy": row["create_by"],
        "createdAt": _format_datetime(row["create_date"]),
        "lastRunAt": _format_datetime(row["last_run_at"])
        if row.get("last_run_at")
        else "",
        "updatedAt": _format_datetime(row["update_date"]),
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
