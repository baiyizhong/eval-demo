import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.errors import BusinessError, LangfuseUpstreamError


class LangfuseClickHouseReader:
    def __init__(self, settings: Settings) -> None:
        self._url = settings.langfuse_clickhouse_url
        self._user = settings.langfuse_clickhouse_user
        self._password = settings.langfuse_clickhouse_password
        self._timeout = settings.pa_eval_api_timeout

    async def list_traces(
        self,
        project_id: str,
        *,
        page: int,
        page_size: int,
        keyword: str | None = None,
        statuses: list[str] | None = None,
        environments: list[str] | None = None,
        tags: list[str] | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
        business_id: str | None = None,
        latency_min: int | None = None,
        latency_max: int | None = None,
        score_queue_id: str | None = None,
        metadata_key: str | None = None,
        metadata_value: str | None = None,
        metadata_filters: list[dict[str, Any]] | None = None,
        categorical_score_filters: list[dict[str, Any]] | None = None,
        numeric_score_filters: list[dict[str, Any]] | None = None,
        created_at_range: list[str] | None = None,
        time_range: str | None = "1d",
        fields: str | None = None,
    ) -> dict[str, Any]:
        include_io = _trace_fields_include(fields, "io")
        include_metadata = _trace_fields_include(fields, "metadata")
        start_time, end_time = _resolve_time_window(
            time_range=time_range,
            created_at_range=created_at_range,
        )
        rows = await self._fetch_trace_rows(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments(environments),
            session_id=session_id,
            metadata_key=metadata_key,
            metadata_value=metadata_value,
            metadata_filters=metadata_filters,
        )
        filtered = [
            row
            for row in rows
            if _matches_trace(
                row,
                keyword=keyword,
                statuses=statuses,
                environments=environments,
                tags=tags,
                session_id=session_id,
                user_id=user_id,
                business_id=business_id,
                latency_min=latency_min,
                latency_max=latency_max,
                score_queue_id=score_queue_id,
                metadata_key=metadata_key,
                metadata_value=metadata_value,
                metadata_filters=metadata_filters,
                categorical_score_filters=categorical_score_filters,
                numeric_score_filters=numeric_score_filters,
            )
        ]
        if session_id:
            filtered = sorted(filtered, key=_trace_created_at_sort_key)
        start = (page - 1) * page_size
        page_rows = filtered[start : start + page_size]
        if include_io:
            trace_ids = [
                str(row.get("traceId") or "")
                for row in page_rows
                if row.get("traceId")
            ]
            payloads_by_trace = await self._fetch_trace_payloads(project_id, trace_ids)
            for row in page_rows:
                payload = payloads_by_trace.get(str(row.get("traceId") or ""))
                if payload:
                    row.update(payload)
        return {
            "total": len(filtered),
            "datas": [
                self._to_trace_row(
                    row,
                    include_io=include_io,
                    include_metadata=include_metadata,
                )
                for row in page_rows
            ],
        }

    async def count_traces(
        self,
        project_id: str,
        *,
        keyword: str | None = None,
        statuses: list[str] | None = None,
        environments: list[str] | None = None,
        tags: list[str] | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
        business_id: str | None = None,
        latency_min: int | None = None,
        latency_max: int | None = None,
        score_queue_id: str | None = None,
        metadata_key: str | None = None,
        metadata_value: str | None = None,
        metadata_filters: list[dict[str, Any]] | None = None,
        categorical_score_filters: list[dict[str, Any]] | None = None,
        numeric_score_filters: list[dict[str, Any]] | None = None,
        created_at_range: list[str] | None = None,
        time_range: str | None = "1d",
    ) -> int:
        start_time, end_time = _resolve_time_window(
            time_range=time_range,
            created_at_range=created_at_range,
        )
        rows = await self._fetch_trace_rows(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments(environments),
            session_id=session_id,
            metadata_key=metadata_key,
            metadata_value=metadata_value,
            metadata_filters=metadata_filters,
        )
        return sum(
            1
            for row in rows
            if _matches_trace(
                row,
                keyword=keyword,
                statuses=statuses,
                environments=environments,
                tags=tags,
                session_id=session_id,
                user_id=user_id,
                business_id=business_id,
                latency_min=latency_min,
                latency_max=latency_max,
                score_queue_id=score_queue_id,
                metadata_key=metadata_key,
                metadata_value=metadata_value,
                metadata_filters=metadata_filters,
                categorical_score_filters=categorical_score_filters,
                numeric_score_filters=numeric_score_filters,
            )
        )

    async def list_traces_by_ids(
        self,
        project_id: str,
        trace_ids: list[str],
        *,
        fields: str | None = None,
    ) -> list[dict[str, Any]]:
        unique_trace_ids = list(
            dict.fromkeys(str(trace_id) for trace_id in trace_ids if trace_id)
        )
        if not unique_trace_ids:
            return []
        include_io = _trace_fields_include(fields, "io")
        include_metadata = _trace_fields_include(fields, "metadata")
        rows = await self._fetch_trace_rows(project_id, trace_ids=unique_trace_ids)
        if include_io:
            payloads_by_trace = await self._fetch_trace_payloads(
                project_id,
                unique_trace_ids,
            )
            for row in rows:
                payload = payloads_by_trace.get(str(row.get("traceId") or ""))
                if payload:
                    row.update(payload)
        rows_by_trace_id = {str(row.get("traceId") or ""): row for row in rows}
        return [
            self._to_trace_row(
                rows_by_trace_id[trace_id],
                include_io=include_io,
                include_metadata=include_metadata,
            )
            for trace_id in unique_trace_ids
            if trace_id in rows_by_trace_id
        ]

    async def get_trace_metrics(
        self,
        project_id: str,
        *,
        time_range: str = "1d",
        environment: str = "all",
    ) -> dict[str, Any]:
        start_time, end_time = _resolve_time_window(time_range=time_range)
        rows = await self._fetch_trace_rows(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments([environment]),
        )
        latencies = sorted(max(0, int(row.get("latency") or 0)) for row in rows)
        failed = sum(1 for row in rows if row.get("status") == "failed")
        success = sum(1 for row in rows if row.get("status") == "success")
        total = len(rows)
        p95_index = max(0, int(total * 0.95 + 0.9999) - 1)

        return {
            "summary": {
                "total": total,
                "success": success,
                "failed": failed,
                "failureRate": failed / total if total else 0,
                "averageLatency": round(sum(latencies) / total) if total else 0,
                "p95Latency": latencies[p95_index] if latencies else 0,
                "totalChangeRate": 0,
            },
            "traceTrend": _build_trace_trend(rows),
            "latencyTrend": _build_latency_trend(rows),
            "environmentDistribution": _build_environment_distribution(rows),
            "slowTraces": [
                self._to_trace_row(row)
                for row in sorted(rows, key=lambda item: item.get("latency") or 0, reverse=True)[:5]
            ],
        }

    async def get_trace(self, project_id: str, trace_id: str) -> dict[str, Any]:
        trace_rows = await self._query_json_each_row(
            """
            SELECT
                id AS traceId,
                project_id AS projectId,
                name,
                environment,
                user_id AS userId,
                session_id AS sessionId,
                timestamp AS createdAt,
                updated_at AS updatedAt,
                input,
                output,
                metadata,
                tags
            FROM traces
            WHERE project_id = {project_id:String}
              AND id = {trace_id:String}
              AND is_deleted = 0
            LIMIT 1
            FORMAT JSONEachRow
            """,
            {"project_id": project_id, "trace_id": trace_id},
        )
        if not trace_rows:
            raise BusinessError(
                code=4004,
                message="Trace 不存在或无访问权限",
                status_code=404,
            )

        observations = await self._query_json_each_row(
            """
            SELECT
                id,
                parent_observation_id AS parentObservationId,
                type,
                name,
                level,
                start_time AS startTime,
                end_time AS endTime,
                input,
                output,
                metadata,
                usage_details AS usageDetails,
                provided_usage_details AS providedUsageDetails,
                cost_details AS costDetails,
                total_cost AS totalCost
            FROM observations
            WHERE project_id = {project_id:String}
              AND trace_id = {trace_id:String}
              AND is_deleted = 0
            ORDER BY start_time ASC, id ASC
            FORMAT JSONEachRow
            """,
            {"project_id": project_id, "trace_id": trace_id},
        )

        trace = trace_rows[0]
        row = {
            **trace,
            "status": _trace_status_from_metadata(trace.get("metadata") or {}, False),
            "latency": _latency_from_observations(trace, observations),
            "scores": await self._fetch_scores_for_trace(project_id, trace_id),
        }
        return {
            **self._to_trace_row(row),
            "updatedAt": _format_clickhouse_datetime(trace.get("updatedAt")),
            "input": _format_payload(trace.get("input")),
            "output": _format_payload(trace.get("output")),
            "metadata": trace.get("metadata") or {},
            "callChain": _build_call_chain(observations),
        }

    async def get_observation(
        self,
        project_id: str,
        trace_id: str,
        observation_id: str,
    ) -> dict[str, Any]:
        rows = await self._query_json_each_row(
            """
            SELECT
                id,
                trace_id AS traceId,
                project_id AS projectId,
                parent_observation_id AS parentObservationId,
                type,
                name,
                level,
                status_message AS statusMessage,
                start_time AS startTime,
                end_time AS endTime,
                input,
                output,
                metadata,
                usage_details AS usageDetails,
                provided_usage_details AS providedUsageDetails,
                cost_details AS costDetails,
                provided_cost_details AS providedCostDetails,
                total_cost AS totalCost
            FROM observations
            WHERE project_id = {project_id:String}
              AND trace_id = {trace_id:String}
              AND id = {observation_id:String}
              AND is_deleted = 0
            LIMIT 1
            FORMAT JSONEachRow
            """,
            {
                "project_id": project_id,
                "trace_id": trace_id,
                "observation_id": observation_id,
            },
        )
        if not rows:
            raise BusinessError(
                code=4004,
                message="Observation 不存在或无访问权限",
                status_code=404,
            )

        observation = rows[0]
        scores = await self._fetch_scores_for_trace(
            project_id,
            trace_id,
            observation_id=observation_id,
        )
        if not scores:
            scores = _scores_from_evaluator_output(observation)

        return {
            "id": observation["id"],
            "traceId": observation.get("traceId") or trace_id,
            "projectId": observation.get("projectId") or project_id,
            "projectName": "",
            "parentObservationId": observation.get("parentObservationId"),
            "type": observation.get("type") or "",
            "name": observation.get("name") or "",
            "level": observation.get("level") or "DEFAULT",
            "statusMessage": observation.get("statusMessage") or "",
            "startTime": _format_clickhouse_datetime(observation.get("startTime")),
            "endTime": _format_clickhouse_datetime(observation.get("endTime")),
            "input": _format_payload(observation.get("input")),
            "output": _format_payload(observation.get("output")),
            "metadata": observation.get("metadata") or {},
            "usageDetails": observation.get("usageDetails") or {},
            "providedUsageDetails": observation.get("providedUsageDetails") or {},
            "costDetails": observation.get("costDetails") or {},
            "providedCostDetails": observation.get("providedCostDetails") or {},
            "totalCost": float(observation.get("totalCost") or 0),
            "scores": scores,
            "scoreSummary": _score_summary(scores),
        }

    async def list_trace_sources(
        self,
        project_id: str,
        trace_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        unique_trace_ids = list(dict.fromkeys(trace_id for trace_id in trace_ids if trace_id))
        if not unique_trace_ids:
            return {}

        sources: dict[str, dict[str, Any]] = {}
        chunk_size = 500
        for start in range(0, len(unique_trace_ids), chunk_size):
            chunk = unique_trace_ids[start : start + chunk_size]
            params: dict[str, Any] = {"project_id": project_id}
            trace_id_placeholders: list[str] = []
            for index, trace_id in enumerate(chunk):
                param_key = f"trace_id_{index}"
                trace_id_placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = trace_id

            rows = await self._query_json_each_row(
                """
                SELECT
                    id AS traceId,
                    project_id AS projectId,
                    name,
                    environment,
                    user_id AS userId,
                    session_id AS sessionId,
                    timestamp AS createdAt,
                    updated_at AS updatedAt,
                    input,
                    output,
                    metadata,
                    tags
                FROM traces
                WHERE project_id = {project_id:String}
                  AND id IN (__TRACE_IDS__)
                  AND is_deleted = 0
                FORMAT JSONEachRow
                """.replace("__TRACE_IDS__", ", ".join(trace_id_placeholders)),
                params,
            )
            for row in rows:
                trace_id = row["traceId"]
                sources[trace_id] = {
                    **self._to_trace_row(
                        {
                            **row,
                            "status": _trace_status_from_metadata(
                                row.get("metadata") or {},
                                False,
                            ),
                            "latency": 0,
                        }
                    ),
                    "updatedAt": _format_clickhouse_datetime(row.get("updatedAt")),
                    "input": _format_payload(row.get("input")),
                    "output": _format_payload(row.get("output")),
                    "metadata": row.get("metadata") or {},
                }
        return sources

    async def _fetch_trace_rows(
        self,
        project_id: str,
        *,
        trace_ids: list[str] | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        environments: list[str] | None = None,
        session_id: str | None = None,
        metadata_key: str | None = None,
        metadata_value: str | None = None,
        metadata_filters: list[dict[str, Any]] | None = None,
        include_io: bool = False,
    ) -> list[dict[str, Any]]:
        filters = ["t.project_id = {project_id:String}", "t.is_deleted = 0"]
        params: dict[str, Any] = {"project_id": project_id}
        if trace_ids:
            trace_id_placeholders = []
            for index, trace_id in enumerate(trace_ids):
                param_key = f"trace_id_{index}"
                trace_id_placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = trace_id
            filters.append(f"t.id IN ({', '.join(trace_id_placeholders)})")
        if start_time is not None:
            filters.append("t.timestamp >= {start_time:DateTime64(3)}")
            params["start_time"] = start_time
        if end_time is not None:
            filters.append("t.timestamp < {end_time:DateTime64(3)}")
            params["end_time"] = end_time
        normalized_environments = _normalize_environments(environments)
        if normalized_environments:
            environment_placeholders = []
            for index, environment in enumerate(normalized_environments):
                param_key = f"environment_{index}"
                environment_placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = environment
            filters.append(f"t.environment IN ({', '.join(environment_placeholders)})")
        if session_id:
            filters.append("position(ifNull(t.session_id, ''), {session_id:String}) > 0")
            params["session_id"] = session_id
        _append_metadata_where_filters(
            filters,
            params,
            metadata_key=metadata_key,
            metadata_value=metadata_value,
            metadata_filters=metadata_filters,
        )

        where_clause = "\n              AND ".join(filters)
        io_select = (
            """
                t.input AS input,
                t.output AS output,"""
            if include_io
            else ""
        )
        query = """
            WITH observation_summary AS (
                SELECT
                    project_id,
                    trace_id,
                    max(end_time) AS lastEndTime,
                    max(if(level IN ('ERROR', 'WARNING'), 1, 0)) AS hasIssue
                FROM observations
                WHERE project_id = {project_id:String}
                  AND is_deleted = 0
                GROUP BY project_id, trace_id
            )
            SELECT
                t.id AS traceId,
                t.project_id AS projectId,
                t.name AS name,
                t.environment AS environment,
                t.user_id AS userId,
                t.session_id AS sessionId,
                t.timestamp AS createdAt,
                t.updated_at AS updatedAt,
                __IO_SELECT__
                t.metadata AS metadata,
                t.tags AS tags,
                if(
                    lower(t.metadata['status']) IN ('failed', 'error')
                    OR observation_summary.hasIssue = 1,
                    'failed',
                    if(lower(t.metadata['status']) IN ('running', 'pending'), 'running', 'success')
                ) AS status,
                greatest(
                    0,
                    toUnixTimestamp64Milli(coalesce(observation_summary.lastEndTime, t.updated_at))
                    - toUnixTimestamp64Milli(t.timestamp)
                ) AS latency
            FROM traces t
            LEFT JOIN observation_summary
              ON observation_summary.project_id = t.project_id
             AND observation_summary.trace_id = t.id
            WHERE __WHERE_CLAUSE__
            ORDER BY t.timestamp DESC, t.id DESC
            FORMAT JSONEachRow
            """.replace("__WHERE_CLAUSE__", where_clause).replace("__IO_SELECT__", io_select)
        rows = await self._query_json_each_row(query, params)
        trace_ids = [str(row.get("traceId") or "") for row in rows if row.get("traceId")]
        if not trace_ids:
            return rows

        scores_by_trace = await self._fetch_scores_by_trace(project_id, trace_ids)
        evaluator_scores_by_trace = await self._fetch_evaluator_scores_by_trace(
            project_id,
            trace_ids,
        )
        for row in rows:
            trace_id = row.get("traceId")
            scores = scores_by_trace.get(trace_id) or evaluator_scores_by_trace.get(trace_id) or []
            row["scores"] = scores
            row["scoreSummary"] = _score_summary(scores)
        return rows

    async def _fetch_trace_payloads(
        self,
        project_id: str,
        trace_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        unique_trace_ids = list(dict.fromkeys(trace_id for trace_id in trace_ids if trace_id))
        if not unique_trace_ids:
            return {}

        payloads_by_trace: dict[str, dict[str, Any]] = {}
        for chunk in _chunked(unique_trace_ids, 100):
            params: dict[str, Any] = {"project_id": project_id}
            trace_id_placeholders = []
            for index, trace_id in enumerate(chunk):
                param_key = f"payload_trace_id_{index}"
                trace_id_placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = trace_id

            rows = await self._query_json_each_row(
                """
                SELECT
                    id AS traceId,
                    input,
                    output
                FROM traces
                WHERE project_id = {project_id:String}
                  AND id IN (__TRACE_IDS__)
                  AND is_deleted = 0
                FORMAT JSONEachRow
                """.replace("__TRACE_IDS__", ", ".join(trace_id_placeholders)),
                params,
            )
            for row in rows:
                trace_id = str(row.get("traceId") or "")
                if trace_id:
                    payloads_by_trace[trace_id] = {
                        "input": row.get("input"),
                        "output": row.get("output"),
                    }
        return payloads_by_trace

    async def _fetch_scores_for_trace(
        self,
        project_id: str,
        trace_id: str,
        *,
        observation_id: str | None = None,
    ) -> list[dict[str, Any]]:
        scores_by_trace = await self._fetch_scores_by_trace(
            project_id,
            [trace_id],
            observation_id=observation_id,
        )
        return scores_by_trace.get(trace_id, [])

    async def list_scores_by_queue(
        self,
        project_id: str,
        queue_id: str,
        *,
        run_id: str | None = None,
    ) -> list[dict[str, Any]]:
        rows = await self._query_json_each_row(
            """
            SELECT
                id,
                trace_id AS traceId,
                observation_id AS observationId,
                session_id AS sessionId,
                name,
                value,
                source,
                comment,
                metadata,
                author_user_id AS authorUserId,
                config_id AS configId,
                data_type AS dataType,
                string_value AS stringValue,
                long_string_value AS longStringValue,
                queue_id AS queueId,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM scores
            WHERE project_id = {project_id:String}
              AND queue_id = {queue_id:String}
              AND ({run_id:String} = '' OR metadata['paAutoEvaluationRunId'] = {run_id:String})
            ORDER BY created_at DESC, id DESC
            FORMAT JSONEachRow
            """,
            {
                "project_id": project_id,
                "queue_id": queue_id,
                "run_id": run_id or "",
            },
        )
        return [_format_score(row) for row in rows]

    async def _fetch_scores_by_trace(
        self,
        project_id: str,
        trace_ids: list[str],
        *,
        observation_id: str | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        unique_trace_ids = list(dict.fromkeys(trace_id for trace_id in trace_ids if trace_id))
        if not unique_trace_ids:
            return {}

        scores_by_trace: dict[str, list[dict[str, Any]]] = {}
        for chunk in _chunked(unique_trace_ids, 100):
            params: dict[str, Any] = {"project_id": project_id}
            trace_id_placeholders = []
            for index, trace_id in enumerate(chunk):
                param_key = f"score_trace_id_{index}"
                trace_id_placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = trace_id

            observation_filter = ""
            if observation_id is not None:
                observation_filter = "\n                  AND observation_id = {observation_id:String}"
                params["observation_id"] = observation_id

            rows = await self._query_json_each_row(
                """
                SELECT
                    id,
                    trace_id AS traceId,
                    observation_id AS observationId,
                    session_id AS sessionId,
                    name,
                    value,
                    source,
                    comment,
                    metadata,
                    author_user_id AS authorUserId,
                    config_id AS configId,
                    data_type AS dataType,
                    string_value AS stringValue,
                    long_string_value AS longStringValue,
                    queue_id AS queueId,
                    created_at AS createdAt,
                    updated_at AS updatedAt
                FROM scores
                WHERE project_id = {project_id:String}
                  AND trace_id IN (__TRACE_IDS__)__OBSERVATION_FILTER__
                ORDER BY created_at DESC, id DESC
                FORMAT JSONEachRow
                """
                .replace("__TRACE_IDS__", ", ".join(trace_id_placeholders))
                .replace("__OBSERVATION_FILTER__", observation_filter),
                params,
            )

            for row in rows:
                trace_id = row.get("traceId")
                if not trace_id:
                    continue
                scores_by_trace.setdefault(trace_id, []).append(_format_score(row))
        return scores_by_trace

    async def _fetch_evaluator_scores_by_trace(
        self,
        project_id: str,
        trace_ids: list[str],
    ) -> dict[str, list[dict[str, Any]]]:
        unique_trace_ids = list(dict.fromkeys(trace_id for trace_id in trace_ids if trace_id))
        if not unique_trace_ids:
            return {}

        scores_by_trace: dict[str, list[dict[str, Any]]] = {}
        for chunk in _chunked(unique_trace_ids, 100):
            params: dict[str, Any] = {"project_id": project_id}
            trace_id_placeholders = []
            for index, trace_id in enumerate(chunk):
                param_key = f"eval_trace_id_{index}"
                trace_id_placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = trace_id

            rows = await self._query_json_each_row(
                """
                SELECT
                    id,
                    trace_id AS traceId,
                    name,
                    output,
                    metadata,
                    start_time AS createdAt,
                    end_time AS updatedAt
                FROM observations
                WHERE project_id = {project_id:String}
                  AND trace_id IN (__TRACE_IDS__)
                  AND is_deleted = 0
                  AND type = 'EVALUATOR'
                ORDER BY start_time DESC, id DESC
                FORMAT JSONEachRow
                """.replace("__TRACE_IDS__", ", ".join(trace_id_placeholders)),
                params,
            )

            for row in rows:
                trace_id = row.get("traceId")
                if not trace_id:
                    continue
                scores = _scores_from_evaluator_output(row)
                if scores:
                    scores_by_trace.setdefault(trace_id, []).extend(scores)
        return scores_by_trace

    async def _query_json_each_row(
        self,
        query: str,
        params: dict[str, Any],
    ) -> list[dict[str, Any]]:
        request_params = {
            "user": self._user,
            "password": self._password,
            **{f"param_{key}": value for key, value in params.items()},
        }
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout,
                trust_env=False,
            ) as client:
                response = await client.post(
                    self._url,
                    params=request_params,
                    content=query,
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError("Langfuse ClickHouse 查询失败") from exc

        lines = [line for line in response.text.splitlines() if line.strip()]
        return [json.loads(line) for line in lines]

    @staticmethod
    def _to_trace_row(
        row: dict[str, Any],
        *,
        include_io: bool = False,
        include_metadata: bool = False,
    ) -> dict[str, Any]:
        trace_row = {
            "traceId": row["traceId"],
            "sessionId": row.get("sessionId") or "",
            "projectId": row["projectId"],
            "projectName": "",
            "environment": row.get("environment") or "default",
            "status": row.get("status") or "unknown",
            "latency": max(0, int(row.get("latency") or 0)),
            "createdAt": _format_clickhouse_datetime(row.get("createdAt")),
            "userId": row.get("userId") or "",
            "businessId": _trace_business_id(row),
            "tags": row.get("tags") or [],
            "scores": row.get("scores") or [],
            "scoreSummary": row.get("scoreSummary") or _score_summary(row.get("scores") or []),
        }
        if include_io:
            trace_row["input"] = _format_payload(row.get("input"))
            trace_row["output"] = _format_payload(row.get("output"))
        if include_metadata:
            trace_row["metadata"] = row.get("metadata") or {}
        return trace_row


class LangfuseClickHouseScoreWriter:
    def __init__(self, settings: Settings) -> None:
        self._url = settings.langfuse_clickhouse_url
        self._user = settings.langfuse_clickhouse_user
        self._password = settings.langfuse_clickhouse_password
        self._timeout = settings.pa_eval_api_timeout

    async def upsert_annotation_score(
        self,
        project_id: str,
        user_id: str,
        score_request: dict[str, Any],
    ) -> None:
        await self.upsert_score(
            project_id,
            user_id,
            score_request,
            source="ANNOTATION",
        )

    async def upsert_score(
        self,
        project_id: str,
        user_id: str,
        score_request: dict[str, Any],
        *,
        source: str = "API",
    ) -> None:
        now = _clickhouse_datetime_ms(datetime.now(UTC))
        record = {
            "id": score_request["id"],
            "timestamp": now,
            "project_id": project_id,
            "environment": score_request.get("environment") or "default",
            "trace_id": score_request.get("traceId") or None,
            "observation_id": score_request.get("observationId") or None,
            "session_id": score_request.get("sessionId") or None,
            "dataset_run_id": None,
            "name": score_request["name"],
            "value": _score_numeric_value(score_request),
            "source": source,
            "comment": score_request.get("comment") or None,
            "metadata": _clickhouse_string_map(score_request.get("metadata")),
            "author_user_id": user_id,
            "config_id": score_request.get("configId") or None,
            "data_type": score_request.get("dataType") or "NUMERIC",
            "string_value": score_request.get("stringValue") or None,
            "long_string_value": score_request.get("longStringValue") or "",
            "queue_id": score_request.get("queueId") or None,
            "execution_trace_id": score_request.get("executionTraceId") or None,
            "created_at": now,
            "updated_at": now,
            "event_ts": now,
            "is_deleted": 0,
        }
        await self._insert_json_each_row(
            "INSERT INTO scores FORMAT JSONEachRow\n"
            + json.dumps(record, ensure_ascii=False)
        )

    async def _insert_json_each_row(self, query: str) -> None:
        request_params = {
            "user": self._user,
            "password": self._password,
        }
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout,
                trust_env=False,
            ) as client:
                response = await client.post(
                    self._url,
                    params=request_params,
                    content=query,
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError("Langfuse ClickHouse 写入失败") from exc


def _score_numeric_value(score_request: dict[str, Any]) -> float:
    value = score_request.get("value")
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _format_score(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id") or "",
        "traceId": row.get("traceId") or "",
        "observationId": row.get("observationId") or "",
        "sessionId": row.get("sessionId") or "",
        "name": row.get("name") or "",
        "value": _numeric_or_none(row.get("value")),
        "source": row.get("source") or "",
        "dataType": row.get("dataType") or "",
        "stringValue": row.get("stringValue") or "",
        "longStringValue": row.get("longStringValue") or "",
        "comment": row.get("comment") or "",
        "metadata": row.get("metadata") or {},
        "authorUserId": row.get("authorUserId") or "",
        "configId": row.get("configId") or "",
        "queueId": row.get("queueId") or "",
        "createdAt": _format_clickhouse_datetime(row.get("createdAt")),
        "updatedAt": _format_clickhouse_datetime(row.get("updatedAt")),
    }


def _scores_from_evaluator_output(observation: dict[str, Any]) -> list[dict[str, Any]]:
    output = _payload_to_object(observation.get("output"))
    if not isinstance(output, dict) or "score" not in output:
        return []
    value = _numeric_or_none(output.get("score"))
    if value is None:
        return []

    reasons = output.get("reasons")
    comment = ""
    if isinstance(reasons, list):
        comment = "；".join(str(reason) for reason in reasons if reason)
    elif reasons:
        comment = str(reasons)

    return [
        {
            "id": f"{observation.get('id') or ''}:output-score",
            "traceId": observation.get("traceId") or "",
            "observationId": observation.get("id") or "",
            "name": observation.get("name") or "evaluator",
            "value": value,
            "source": "EVALUATOR",
            "dataType": "NUMERIC",
            "stringValue": str(output.get("label") or ""),
            "longStringValue": "",
            "comment": comment,
            "metadata": observation.get("metadata") or {},
            "authorUserId": "",
            "configId": "",
            "queueId": "",
            "createdAt": _format_clickhouse_datetime(observation.get("createdAt")),
            "updatedAt": _format_clickhouse_datetime(observation.get("updatedAt")),
        }
    ]


def _score_summary(scores: list[dict[str, Any]]) -> str:
    labels = []
    for score in scores[:3]:
        name = score.get("name") or "score"
        value = ""
        if score.get("value") is not None:
            value = _format_score_value(score.get("value"))
        if not value:
            value = score.get("stringValue") or score.get("longStringValue")
        if value:
            labels.append(f"{name}: {value}")
    if len(scores) > 3:
        labels.append(f"+{len(scores) - 3}")
    return " / ".join(labels)


def _append_metadata_where_filters(
    filters: list[str],
    params: dict[str, Any],
    *,
    metadata_key: str | None,
    metadata_value: str | None,
    metadata_filters: list[dict[str, Any]] | None = None,
) -> None:
    if metadata_key:
        params["metadata_key"] = metadata_key
        filters.append("mapContains(t.metadata, {metadata_key:String})")
        if metadata_value:
            params["metadata_value"] = metadata_value
            filters.append(
                "position(t.metadata[{metadata_key:String}], {metadata_value:String}) > 0"
            )
    for index, metadata_filter in enumerate(metadata_filters or []):
        key = str(metadata_filter.get("key") or "").strip()
        if not key:
            continue
        operator = str(metadata_filter.get("operator") or "contains")
        value = str(metadata_filter.get("value") or "")
        key_param = f"metadata_filter_key_{index}"
        value_param = f"metadata_filter_value_{index}"
        params[key_param] = key
        filters.append(f"mapContains(t.metadata, {{{key_param}:String}})")
        if operator == "exists":
            continue
        params[value_param] = value
        if operator == "equals":
            filters.append(
                f"t.metadata[{{{key_param}:String}}] = {{{value_param}:String}}"
            )
        else:
            filters.append(
                f"position(t.metadata[{{{key_param}:String}}], {{{value_param}:String}}) > 0"
            )


def _format_score_value(value: Any) -> str:
    number = _numeric_or_none(value)
    if number is None:
        return str(value or "")
    if number.is_integer():
        return str(int(number))
    return f"{number:.4f}".rstrip("0").rstrip(".")


def _numeric_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _trace_fields_include(fields: str | None, field_name: str) -> bool:
    requested = {
        item.strip().lower()
        for item in str(fields or "").split(",")
        if item.strip()
    }
    return field_name.lower() in requested


def _trace_created_at_sort_key(row: dict[str, Any]) -> tuple[datetime, str]:
    return (
        _parse_clickhouse_datetime(row.get("createdAt")) or datetime.max,
        str(row.get("traceId") or ""),
    )


def _payload_to_object(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _chunked(values: list[str], size: int) -> list[list[str]]:
    return [values[start : start + size] for start in range(0, len(values), size)]


def _matches_trace(
    row: dict[str, Any],
    *,
    keyword: str | None,
    statuses: list[str] | None,
    environments: list[str] | None,
    tags: list[str] | None = None,
    session_id: str | None,
    user_id: str | None,
    business_id: str | None,
    latency_min: int | None,
    latency_max: int | None,
    score_queue_id: str | None,
    metadata_key: str | None,
    metadata_value: str | None,
    metadata_filters: list[dict[str, Any]] | None = None,
    categorical_score_filters: list[dict[str, Any]] | None = None,
    numeric_score_filters: list[dict[str, Any]] | None = None,
) -> bool:
    metadata = row.get("metadata") or {}
    needle = (keyword or "").strip().lower()
    if needle and needle not in row["traceId"].lower() and needle not in (row.get("sessionId") or "").lower():
        return False
    if statuses and row.get("status") not in statuses:
        return False
    if environments and row.get("environment") not in environments:
        return False
    normalized_tags = _normalize_tags(tags)
    if normalized_tags:
        row_tags = set(_normalize_tags(row.get("tags")))
        if not all(tag in row_tags for tag in normalized_tags):
            return False
    if session_id and session_id not in (row.get("sessionId") or ""):
        return False
    if user_id and user_id not in (row.get("userId") or ""):
        return False
    if business_id and business_id not in _trace_business_id(row):
        return False
    latency = int(row.get("latency") or 0)
    if latency_min is not None and latency < latency_min:
        return False
    if latency_max is not None and latency > latency_max:
        return False
    if score_queue_id and not _matches_score_queue_id(row.get("scores") or [], score_queue_id):
        return False
    if metadata_key:
        if not isinstance(metadata, dict) or metadata_key not in metadata:
            return False
        if metadata_value and metadata_value not in str(metadata.get(metadata_key) or ""):
            return False
    for metadata_filter in metadata_filters or []:
        key = str(metadata_filter.get("key") or "")
        operator = str(metadata_filter.get("operator") or "contains")
        value = str(metadata_filter.get("value") or "")
        if not isinstance(metadata, dict) or key not in metadata:
            return False
        if operator == "exists":
            continue
        actual = str(metadata.get(key) or "")
        if operator == "equals" and actual != value:
            return False
        if operator == "contains" and value not in actual:
            return False
    for score_filter in categorical_score_filters or []:
        if not _matches_categorical_score(row.get("scores") or [], score_filter):
            return False
    for score_filter in numeric_score_filters or []:
        if not _matches_numeric_score(row.get("scores") or [], score_filter):
            return False
    return True


def _trace_business_id(row: dict[str, Any]) -> str:
    metadata = row.get("metadata") or {}
    if not isinstance(metadata, dict):
        return ""
    return str(
        metadata.get("businessId")
        or metadata.get("business_id")
        or metadata.get("app_id")
        or ""
    )


def _matches_score_queue_id(scores: list[dict[str, Any]], queue_id: str) -> bool:
    expected = queue_id.strip()
    return any(str(score.get("queueId") or "") == expected for score in scores)


def _normalize_tags(tags: Any) -> list[str]:
    if not isinstance(tags, list):
        return []
    return [str(tag).strip() for tag in tags if str(tag).strip()]


def _matches_categorical_score(
    scores: list[dict[str, Any]],
    score_filter: dict[str, Any],
) -> bool:
    name = str(score_filter.get("name") or "")
    operator = str(score_filter.get("operator") or "equals")
    expected = str(score_filter.get("value") or "")
    for score in scores:
        if str(score.get("name") or "") != name:
            continue
        if operator == "exists":
            return True
        actual = _score_text_value(score)
        if operator == "equals" and actual == expected:
            return True
        if operator == "contains" and expected in actual:
            return True
    return False


def _matches_numeric_score(
    scores: list[dict[str, Any]],
    score_filter: dict[str, Any],
) -> bool:
    name = str(score_filter.get("name") or "")
    operator = str(score_filter.get("operator") or "eq")
    expected = _numeric_or_none(score_filter.get("value"))
    if expected is None:
        return False
    for score in scores:
        if str(score.get("name") or "") != name:
            continue
        actual = _numeric_or_none(score.get("value"))
        if actual is None:
            continue
        if operator == "eq" and actual == expected:
            return True
        if operator == "gte" and actual >= expected:
            return True
        if operator == "lte" and actual <= expected:
            return True
        if operator == "gt" and actual > expected:
            return True
        if operator == "lt" and actual < expected:
            return True
    return False


def _score_text_value(score: dict[str, Any]) -> str:
    return str(
        score.get("stringValue")
        or score.get("longStringValue")
        or score.get("value")
        or ""
    )


def _normalize_environments(environments: list[str] | None) -> list[str] | None:
    values = [
        value.strip()
        for value in environments or []
        if value and value.strip() and value.strip() != "all"
    ]
    return values or None


def _resolve_time_window(
    *,
    time_range: str | None = None,
    created_at_range: list[str] | None = None,
) -> tuple[datetime | None, datetime | None]:
    if created_at_range:
        start_time = _parse_filter_datetime(created_at_range[0], range_side="start")
        end_time = (
            _parse_filter_datetime(created_at_range[1], range_side="end")
            if len(created_at_range) > 1
            else None
        )
        return start_time, end_time

    if not time_range:
        return None, None

    durations = {
        "1d": timedelta(days=1),
        "3d": timedelta(days=3),
        "7d": timedelta(days=7),
        "14d": timedelta(days=14),
    }
    duration = durations.get(time_range)
    if duration is None:
        return None, None
    return datetime.utcnow() - duration, None


def _parse_filter_datetime(
    value: str | None,
    *,
    range_side: str,
) -> datetime | None:
    if not value:
        return None

    normalized = value.strip().replace("T", " ").replace("Z", "")
    if not normalized:
        return None
    if len(normalized) == 10:
        normalized = (
            f"{normalized} 00:00:00"
            if range_side == "start"
            else f"{normalized} 23:59:59.999"
        )
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _trace_status_from_metadata(metadata: dict[str, Any], has_issue: bool) -> str:
    status = str(metadata.get("status") or "").lower()
    if status in {"failed", "error"} or has_issue:
        return "failed"
    if status in {"running", "pending"}:
        return "running"
    if status in {"", "succeeded", "success"}:
        return "success"
    return "unknown"


def _latency_from_observations(
    trace: dict[str, Any],
    observations: list[dict[str, Any]],
) -> int:
    starts = [_parse_clickhouse_datetime(trace.get("createdAt"))]
    ends = [_parse_clickhouse_datetime(trace.get("updatedAt"))]
    for observation in observations:
        starts.append(_parse_clickhouse_datetime(observation.get("startTime")))
        ends.append(_parse_clickhouse_datetime(observation.get("endTime")))

    valid_starts = [value for value in starts if value is not None]
    valid_ends = [value for value in ends if value is not None]
    if not valid_starts or not valid_ends:
        return 0
    return max(0, round((max(valid_ends) - min(valid_starts)).total_seconds() * 1000))


def _build_call_chain(observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes_by_id: dict[str, dict[str, Any]] = {}
    roots: list[dict[str, Any]] = []

    for observation in observations:
        usage = observation.get("usageDetails") or observation.get("providedUsageDetails") or {}
        start = _parse_clickhouse_datetime(observation.get("startTime"))
        end = _parse_clickhouse_datetime(observation.get("endTime"))
        duration = ""
        if start and end:
            duration = f"{max(0, round((end - start).total_seconds() * 1000))}ms"
        node = {
            "id": observation["id"],
            "type": _to_chain_node_type(observation.get("type"), observation.get("name")),
            "title": observation.get("name") or observation.get("type") or "Observation",
            "duration": duration,
            "tokensIn": int(usage.get("input") or usage.get("prompt_tokens") or 0),
            "tokensOut": int(usage.get("output") or usage.get("completion_tokens") or 0),
            "tokensTotal": int(usage.get("total") or usage.get("total_tokens") or 0),
            "tags": [observation.get("level") or "DEFAULT"],
            "children": [],
        }
        nodes_by_id[node["id"]] = node

    for observation in observations:
        node = nodes_by_id[observation["id"]]
        parent_id = observation.get("parentObservationId")
        if parent_id and parent_id in nodes_by_id:
            nodes_by_id[parent_id]["children"].append(node)
        else:
            roots.append(node)

    return roots


def _to_chain_node_type(raw_type: str | None, name: str | None) -> str:
    value = (raw_type or "").lower()
    title = (name or "").lower()
    if value == "generation":
        return "llm"
    if "parse" in title:
        return "parser"
    if "judge" in title or "eval" in title:
        return "eval"
    return value or "chain"


def _build_trace_trend(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = _bucket_hour(row.get("createdAt"))
        bucket = buckets.setdefault(key, {"time": key, "total": 0, "failed": 0})
        bucket["total"] += 1
        if row.get("status") == "failed":
            bucket["failed"] += 1
    return [buckets[key] for key in sorted(buckets)]


def _build_latency_trend(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[int]] = {}
    for row in rows:
        buckets.setdefault(_bucket_hour(row.get("createdAt")), []).append(
            max(0, int(row.get("latency") or 0))
        )
    points = []
    for key in sorted(buckets):
        latencies = sorted(buckets[key])
        p95_index = max(0, int(len(latencies) * 0.95 + 0.9999) - 1)
        points.append(
            {
                "time": key,
                "averageLatency": round(sum(latencies) / len(latencies)),
                "p95Latency": latencies[p95_index],
            }
        )
    return points


def _build_environment_distribution(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for row in rows:
        env = row.get("environment") or "default"
        counts[env] = counts.get(env, 0) + 1
    return [{"environment": key, "count": counts[key]} for key in sorted(counts)]


def _bucket_hour(value: Any) -> str:
    parsed = _parse_clickhouse_datetime(value)
    if not parsed:
        return "unknown"
    return parsed.strftime("%m-%d %H:00")


def _format_payload(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, indent=2)
    try:
        return json.dumps(json.loads(value), ensure_ascii=False, indent=2)
    except json.JSONDecodeError:
        return value


def _format_clickhouse_datetime(value: Any) -> str:
    parsed = _parse_clickhouse_datetime(value)
    if not parsed:
        return str(value or "")
    return f"{parsed.isoformat(timespec='milliseconds')}Z"


def _clickhouse_datetime_ms(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def _clickhouse_string_map(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {str(key): str(item) for key, item in value.items() if item is not None}


def _parse_clickhouse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value:
        return None
    normalized = value.replace("T", " ").replace("Z", "")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


async def get_langfuse_clickhouse_reader(
    settings: Settings = Depends(get_settings),
) -> LangfuseClickHouseReader:
    return LangfuseClickHouseReader(settings)


async def get_langfuse_clickhouse_score_writer(
    settings: Settings = Depends(get_settings),
) -> LangfuseClickHouseScoreWriter:
    return LangfuseClickHouseScoreWriter(settings)
