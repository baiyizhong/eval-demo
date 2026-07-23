import json
from collections.abc import AsyncIterator, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.data_access.clickhouse import (
    create_clickhouse_http_client,
    get_clickhouse_http_client,
)
from app.errors import BusinessError, LangfuseUpstreamError
from app.trace_count_cache import TraceCountCache


ANNOTATION_CANDIDATE_EXTERNAL_STRUCTURE = ", ".join(
    (
        "item_id String",
        "object_id String",
        "object_type String",
        "status String",
        "assignee_id String",
        "created_at String",
        "updated_at String",
    )
)


class LangfuseClickHouseReader:
    def __init__(self, settings: Settings) -> None:
        self._url = settings.langfuse_clickhouse_url
        self._user = settings.langfuse_clickhouse_user
        self._password = settings.langfuse_clickhouse_password
        self._settings = settings
        self._trace_count_cache = TraceCountCache(
            ttl_seconds=settings.pa_eval_trace_count_cache_ttl_seconds,
            max_entries=settings.pa_eval_trace_count_cache_max_entries,
        )

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
        anchor_trace_id: str | None = None,
        cursor_created_at: str | None = None,
        cursor_trace_id: str | None = None,
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
        trace_filter = _build_trace_filter(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments(environments),
            session_id=session_id,
            metadata_key=metadata_key,
            metadata_value=metadata_value,
            metadata_filters=metadata_filters,
            keyword=keyword,
            statuses=statuses,
            tags=tags,
            user_id=user_id,
            business_id=business_id,
            latency_min=latency_min,
            latency_max=latency_max,
            score_queue_id=score_queue_id,
            categorical_score_filters=categorical_score_filters,
            numeric_score_filters=numeric_score_filters,
        )
        count_cache_key = _trace_count_cache_key(
            project_id=project_id,
            time_range=time_range,
            created_at_range=created_at_range,
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
        cached_total = self._trace_count_cache.get(count_cache_key)
        if cached_total is None:
            total = await self._count_trace_rows(trace_filter)
            self._trace_count_cache.set(count_cache_key, total)
        else:
            total = cached_total
        effective_page = page
        if session_id and anchor_trace_id:
            anchor_page = await self._locate_trace_page(
                trace_filter,
                anchor_trace_id,
                page_size,
            )
            if anchor_page is not None:
                effective_page = anchor_page
        cursor_at = _parse_clickhouse_datetime(cursor_created_at)
        use_cursor = cursor_at is not None and bool(cursor_trace_id)
        start = 0 if use_cursor else (effective_page - 1) * page_size
        page_rows = await self._fetch_trace_rows(
            project_id,
            trace_filter=trace_filter,
            limit=page_size + 1 if use_cursor else page_size,
            offset=start,
            order_ascending=bool(session_id),
            cursor_created_at=cursor_at if use_cursor else None,
            cursor_trace_id=cursor_trace_id if use_cursor else None,
        )
        has_more = (
            len(page_rows) > page_size
            if use_cursor
            else start + len(page_rows) < total
        )
        if use_cursor:
            page_rows = page_rows[:page_size]
        trace_ids = [
            str(row.get("traceId") or "") for row in page_rows if row.get("traceId")
        ]
        if not trace_filter.requires_aggregation:
            observation_summaries = await self._fetch_page_observation_summaries(
                project_id,
                trace_ids,
            )
            for row in page_rows:
                summary = observation_summaries.get(str(row.get("traceId") or ""), {})
                row["status"] = _trace_status_from_metadata(
                    row.get("metadata") or {},
                    bool(summary.get("hasIssue")),
                )
                start_at = _parse_clickhouse_datetime(row.get("createdAt"))
                end_at = _parse_clickhouse_datetime(
                    summary.get("lastEndTime") or row.get("updatedAt")
                )
                row["latency"] = (
                    max(0, round((end_at - start_at).total_seconds() * 1000))
                    if start_at is not None and end_at is not None
                    else max(0, int(row.get("latency") or 0))
                )
        scores_by_trace = await self._fetch_scores_by_trace(project_id, trace_ids)
        evaluator_scores_by_trace = await self._fetch_evaluator_scores_by_trace(
            project_id,
            trace_ids,
        )
        for row in page_rows:
            trace_id = row.get("traceId")
            fetched_scores = (
                scores_by_trace.get(trace_id)
                or evaluator_scores_by_trace.get(trace_id)
                or []
            )
            if fetched_scores:
                row["scores"] = fetched_scores
            else:
                row["scores"] = row.get("scores") or []
            row["scoreSummary"] = _score_summary(row["scores"])
        if include_io:
            payloads_by_trace = await self._fetch_trace_payloads(project_id, trace_ids)
            for row in page_rows:
                payload = payloads_by_trace.get(str(row.get("traceId") or ""))
                if payload:
                    row.update(payload)
        next_cursor = None
        if has_more and page_rows:
            last_row = page_rows[-1]
            next_cursor = {
                "createdAt": _format_clickhouse_datetime(last_row.get("createdAt")),
                "traceId": str(last_row.get("traceId") or ""),
            }
        return {
            "total": total,
            "page": effective_page,
            "hasMore": has_more,
            "nextCursor": next_cursor,
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
        trace_filter = _build_trace_filter(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments(environments),
            session_id=session_id,
            metadata_key=metadata_key,
            metadata_value=metadata_value,
            metadata_filters=metadata_filters,
            keyword=keyword,
            statuses=statuses,
            tags=tags,
            user_id=user_id,
            business_id=business_id,
            latency_min=latency_min,
            latency_max=latency_max,
            score_queue_id=score_queue_id,
            categorical_score_filters=categorical_score_filters,
            numeric_score_filters=numeric_score_filters,
        )
        return await self._count_trace_rows(trace_filter)

    async def list_trace_ids_for_bulk(
        self,
        project_id: str,
        *,
        filters: dict[str, Any],
        cursor: dict[str, Any],
        excluded_trace_ids: list[str],
        limit: int,
    ) -> dict[str, Any]:
        start_time, end_time = _resolve_time_window(
            time_range=filters.get("time_range"),
            created_at_range=filters.get("created_at_range"),
        )
        trace_filter = _build_trace_filter(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments(filters.get("environments")),
            session_id=filters.get("session_id"),
            metadata_key=filters.get("metadata_key"),
            metadata_value=filters.get("metadata_value"),
            metadata_filters=filters.get("metadata_filters"),
            keyword=filters.get("keyword"),
            statuses=filters.get("statuses"),
            tags=filters.get("tags"),
            user_id=filters.get("user_id"),
            business_id=filters.get("business_id"),
            latency_min=filters.get("latency_min"),
            latency_max=filters.get("latency_max"),
            score_queue_id=filters.get("score_queue_id"),
            categorical_score_filters=filters.get("categorical_score_filters"),
            numeric_score_filters=filters.get("numeric_score_filters"),
        )
        params = dict(trace_filter.params)
        where_parts = [trace_filter.where_sql]
        cursor_created_at = _parse_clickhouse_datetime(cursor.get("createdAt"))
        cursor_trace_id = str(cursor.get("traceId") or "")
        if cursor_created_at is not None and cursor_trace_id:
            params["bulk_cursor_created_at"] = cursor_created_at
            params["bulk_cursor_trace_id"] = cursor_trace_id
            where_parts.append(
                "("
                "base.createdAt < {bulk_cursor_created_at:DateTime64(3)} "
                "OR (base.createdAt = {bulk_cursor_created_at:DateTime64(3)} "
                "AND base.traceId < {bulk_cursor_trace_id:String})"
                ")"
            )
        excluded_placeholders: list[str] = []
        for index, trace_id in enumerate(dict.fromkeys(excluded_trace_ids)):
            param_key = f"bulk_excluded_trace_id_{index}"
            excluded_placeholders.append(f"{{{param_key}:String}}")
            params[param_key] = trace_id
        if excluded_placeholders:
            where_parts.append(
                f"base.traceId NOT IN ({', '.join(excluded_placeholders)})"
            )
        params["bulk_limit"] = max(1, limit)
        rows = await self._query_json_each_row(
            f"""
            {trace_filter.cte_sql}
            SELECT traceId, createdAt
            FROM trace_base base
            WHERE {" AND ".join(f"({part})" for part in where_parts)}
            ORDER BY toUnixTimestamp64Milli(createdAt) DESC, traceId DESC
            LIMIT {{bulk_limit:UInt32}}
            FORMAT JSONEachRow
            """,
            params,
        )
        next_cursor: dict[str, Any] = {}
        if rows:
            last_row = rows[-1]
            next_cursor = {
                "createdAt": _format_clickhouse_datetime(last_row.get("createdAt")),
                "traceId": str(last_row.get("traceId") or ""),
            }
        return {
            "traceIds": [str(row.get("traceId") or "") for row in rows],
            "cursor": next_cursor,
            "hasMore": len(rows) >= max(1, limit),
        }

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
        include_scores = _trace_fields_include(fields, "scores")
        rows = await self._fetch_trace_rows(project_id, trace_ids=unique_trace_ids)
        if include_scores:
            scores_by_trace = await self._fetch_scores_by_trace(
                project_id,
                unique_trace_ids,
            )
            for row in rows:
                scores = scores_by_trace.get(str(row.get("traceId") or ""), [])
                row["scores"] = scores
                row["scoreSummary"] = _score_summary(scores)
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
        trace_filter = _build_trace_filter(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments([environment]),
        )
        summary_rows = await self._query_json_each_row(
            f"""
            /* summary */
            {trace_filter.cte_sql}
            SELECT
                count() AS total,
                countIf(status = 'success') AS success,
                countIf(status = 'failed') AS failed,
                round(avg(latency)) AS averageLatency,
                round(quantile(0.95)(latency)) AS p95Latency
            FROM trace_base base
            WHERE {trace_filter.where_sql}
            FORMAT JSONEachRow
            """,
            trace_filter.params,
        )
        summary = summary_rows[0] if summary_rows else {}
        total = int(summary.get("total") or 0)
        success = int(summary.get("success") or 0)
        failed = int(summary.get("failed") or 0)

        trace_trend = await self._query_json_each_row(
            f"""
            /* traceTrend */
            {trace_filter.cte_sql}
            SELECT
                formatDateTime(toStartOfHour(createdAt), '%m-%d %H:00') AS time,
                count() AS total,
                countIf(status = 'failed') AS failed
            FROM trace_base base
            WHERE {trace_filter.where_sql}
            GROUP BY time
            ORDER BY time ASC
            FORMAT JSONEachRow
            """,
            trace_filter.params,
        )
        latency_trend = await self._query_json_each_row(
            f"""
            /* latencyTrend */
            {trace_filter.cte_sql}
            SELECT
                formatDateTime(toStartOfHour(createdAt), '%m-%d %H:00') AS time,
                round(avg(latency)) AS averageLatency,
                round(quantile(0.95)(latency)) AS p95Latency
            FROM trace_base base
            WHERE {trace_filter.where_sql}
            GROUP BY time
            ORDER BY time ASC
            FORMAT JSONEachRow
            """,
            trace_filter.params,
        )
        environment_distribution = await self._query_json_each_row(
            f"""
            /* environmentDistribution */
            {trace_filter.cte_sql}
            SELECT
                ifNull(environment, 'default') AS environment,
                count() AS count
            FROM trace_base base
            WHERE {trace_filter.where_sql}
            GROUP BY environment
            ORDER BY environment ASC
            FORMAT JSONEachRow
            """,
            trace_filter.params,
        )
        slow_trace_rows = await self._query_json_each_row(
            f"""
            /* slowTraces */
            {trace_filter.cte_sql}
            SELECT
                traceId,
                projectId,
                name,
                environment,
                userId,
                sessionId,
                createdAt,
                updatedAt,
                metadata,
                tags,
                status,
                latency
            FROM trace_base base
            WHERE {trace_filter.where_sql}
            ORDER BY latency DESC, createdAt DESC, traceId DESC
            LIMIT 5
            FORMAT JSONEachRow
            """,
            trace_filter.params,
        )
        slow_trace_ids = [
            str(row.get("traceId") or "")
            for row in slow_trace_rows
            if row.get("traceId")
        ]
        scores_by_trace = await self._fetch_scores_by_trace(project_id, slow_trace_ids)
        evaluator_scores_by_trace = await self._fetch_evaluator_scores_by_trace(
            project_id,
            slow_trace_ids,
        )
        for row in slow_trace_rows:
            trace_id = row.get("traceId")
            scores = (
                scores_by_trace.get(trace_id)
                or evaluator_scores_by_trace.get(trace_id)
                or []
            )
            row["scores"] = scores
            row["scoreSummary"] = _score_summary(scores)
        return {
            "summary": {
                "total": total,
                "success": success,
                "failed": failed,
                "failureRate": failed / total if total else 0,
                "averageLatency": int(summary.get("averageLatency") or 0),
                "p95Latency": int(summary.get("p95Latency") or 0),
                "totalChangeRate": 0,
            },
            "traceTrend": trace_trend,
            "latencyTrend": latency_trend,
            "environmentDistribution": environment_distribution,
            "slowTraces": [self._to_trace_row(row) for row in slow_trace_rows],
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
        unique_trace_ids = list(
            dict.fromkeys(trace_id for trace_id in trace_ids if trace_id)
        )
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

    async def list_annotation_queue_items_page(
        self,
        project_id: str,
        candidates: list[dict[str, Any]],
        *,
        page: int,
        page_size: int,
        filters: dict[str, Any],
    ) -> dict[str, Any]:
        if not candidates:
            return {"total": 0, "datas": []}
        offset = (page - 1) * page_size
        if offset > self._settings.pa_eval_annotation_advanced_filter_max_offset:
            raise BusinessError(1026, "高级筛选分页范围过大，请缩小页码", 400)
        source_filter_sql, source_filter_params = (
            _build_annotation_source_filter_sql(
                keyword=str(filters.get("keyword") or ""),
                metadata_filters=_annotation_metadata_filters(filters),
                input_filters=list(filters.get("input_filters") or []),
                output_filters=list(filters.get("output_filters") or []),
            )
        )
        params = {
            "project_id": project_id,
            "annotation_limit": page_size,
            "annotation_window": offset + page_size,
            "annotation_slice_start": offset + 1,
            **source_filter_params,
        }
        rows = await self._query_json_each_row_with_external_table(
            f"""
            WITH source_candidates AS (
                {_annotation_source_candidates_sql()}
            )
            SELECT
                count() AS total,
                arraySlice(
                    groupArray({{annotation_window:UInt32}})(data),
                    {{annotation_slice_start:UInt32}},
                    {{annotation_limit:UInt32}}
                ) AS datas
            FROM (
                SELECT toJSONString(map(
                        'id', candidate_item_id,
                        'sourceTitle', source_title,
                        'sourceInput', source_input,
                        'sourceOutput', source_output,
                        'sourceMetadata', toJSONString(source_metadata),
                        'traceId', trace_id,
                        'observationId', observation_id,
                        'sessionId', session_id,
                        'userId', user_id,
                        'sourceCreatedAt', source_created_at
                    )) AS data
                FROM source_candidates
                WHERE {source_filter_sql}
                ORDER BY candidate_updated_at DESC, candidate_created_at DESC,
                         candidate_item_id DESC
            ) ordered_matches
            FORMAT JSONEachRow
            """,
            params,
            table_name="annotation_candidates",
            structure=ANNOTATION_CANDIDATE_EXTERNAL_STRUCTURE,
            rows=_annotation_external_candidate_rows(candidates),
        )
        summary = rows[0] if rows else {}
        candidate_by_id = {
            str(candidate.get("id") or ""): candidate for candidate in candidates
        }
        page_items: list[dict[str, Any]] = []
        for value in summary.get("datas") or []:
            source_row = json.loads(str(value or "{}"))
            candidate = candidate_by_id.get(str(source_row.get("id") or ""))
            if candidate:
                page_items.append(
                    _annotation_item_from_clickhouse_external_row(
                        source_row,
                        candidate=candidate,
                    )
                )
        return {"total": int(summary.get("total") or 0), "datas": page_items}

    async def count_annotation_queue_item_filters(
        self,
        project_id: str,
        candidates: list[dict[str, Any]],
        *,
        filters: dict[str, Any],
    ) -> dict[str, dict[str, int]]:
        status_counts = {"PENDING": 0, "COMPLETED": 0}
        object_type_counts = {"TRACE": 0, "OBSERVATION": 0, "SESSION": 0}
        assignee_counts = {
            str((candidate.get("assignee") or {}).get("id")): 0
            for candidate in candidates
            if (candidate.get("assignee") or {}).get("id")
        }
        if not candidates:
            return {
                "status": status_counts,
                "objectType": object_type_counts,
                "assigneeIds": dict(sorted(assignee_counts.items())),
            }
        source_filter_sql, source_filter_params = (
            _build_annotation_source_filter_sql(
                keyword=str(filters.get("keyword") or ""),
                metadata_filters=_annotation_metadata_filters(filters),
                input_filters=list(filters.get("input_filters") or []),
                output_filters=list(filters.get("output_filters") or []),
            )
        )
        params: dict[str, Any] = {
            "project_id": project_id,
            **source_filter_params,
        }
        status_filter = _annotation_candidate_facet_filter_sql(
            filters,
            params,
            omitted_filter="status",
        )
        object_type_filter = _annotation_candidate_facet_filter_sql(
            filters,
            params,
            omitted_filter="object_type",
        )
        assignee_filter = _annotation_candidate_facet_filter_sql(
            filters,
            params,
            omitted_filter="assignee_ids",
        )
        rows = await self._query_json_each_row_with_external_table(
            f"""
            WITH source_candidates AS (
                {_annotation_source_candidates_sql()}
            )
            SELECT tupleElement(facet_tuple, 1) AS facet,
                   tupleElement(facet_tuple, 2) AS value,
                   count() AS total
            FROM (
                SELECT arrayJoin(arrayZip(
                    ['status', 'objectType', 'assigneeIds'],
                    [candidate_status, candidate_object_type,
                     candidate_assignee_id],
                    [toUInt8({status_filter}), toUInt8({object_type_filter}),
                     toUInt8({assignee_filter})]
                )) AS facet_tuple
                FROM source_candidates
                WHERE {source_filter_sql}
            ) expanded_facets
            WHERE tupleElement(facet_tuple, 3) = 1
              AND (
                  tupleElement(facet_tuple, 1) != 'assigneeIds'
                  OR notEmpty(tupleElement(facet_tuple, 2))
              )
            GROUP BY tupleElement(facet_tuple, 1), tupleElement(facet_tuple, 2)
            FORMAT JSONEachRow
            """,
            params,
            table_name="annotation_candidates",
            structure=ANNOTATION_CANDIDATE_EXTERNAL_STRUCTURE,
            rows=_annotation_external_candidate_rows(candidates),
        )
        count_groups = {
            "status": status_counts,
            "objectType": object_type_counts,
            "assigneeIds": assignee_counts,
        }
        for row in rows:
            facet = str(row.get("facet") or "")
            value = str(row.get("value") or "")
            if facet in count_groups and value:
                count_groups[facet][value] = int(row.get("total") or 0)
        return {
            "status": status_counts,
            "objectType": object_type_counts,
            "assigneeIds": dict(sorted(assignee_counts.items())),
        }

    async def _fetch_trace_rows(
        self,
        project_id: str,
        *,
        trace_filter: "TraceFilterSql | None" = None,
        trace_ids: list[str] | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        environments: list[str] | None = None,
        session_id: str | None = None,
        metadata_key: str | None = None,
        metadata_value: str | None = None,
        metadata_filters: list[dict[str, Any]] | None = None,
        include_io: bool = False,
        limit: int | None = None,
        offset: int = 0,
        order_ascending: bool = False,
        cursor_created_at: datetime | None = None,
        cursor_trace_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if trace_filter is None:
            trace_filter = _build_trace_filter(
                project_id,
                trace_ids=trace_ids,
                start_time=start_time,
                end_time=end_time,
                environments=_normalize_environments(environments),
                session_id=session_id,
                metadata_key=metadata_key,
                metadata_value=metadata_value,
                metadata_filters=metadata_filters,
            )
        params = dict(trace_filter.params)
        if limit is not None:
            params["limit"] = limit
            params["offset"] = offset
        limit_clause = ""
        if limit is not None:
            limit_clause = "\n            LIMIT {limit:UInt32}"
            if cursor_created_at is None or not cursor_trace_id:
                limit_clause += " OFFSET {offset:UInt32}"
        order_direction = "ASC" if order_ascending else "DESC"
        order_clause = (
            f"toUnixTimestamp64Milli(createdAt) {order_direction}, "
            f"traceId {order_direction}"
        )
        where_sql = trace_filter.where_sql
        if cursor_created_at is not None and cursor_trace_id:
            params["cursor_created_at"] = cursor_created_at
            params["cursor_trace_id"] = cursor_trace_id
            comparison = ">" if order_ascending else "<"
            where_sql += f"""
              AND (
                    base.createdAt {comparison} {{cursor_created_at:DateTime64(3)}}
                    OR (
                        base.createdAt = {{cursor_created_at:DateTime64(3)}}
                        AND base.traceId {comparison} {{cursor_trace_id:String}}
                    )
              )"""
        query = f"""
            {trace_filter.cte_sql}
            SELECT
                traceId,
                projectId,
                name,
                environment,
                userId,
                sessionId,
                createdAt,
                updatedAt,
                metadata,
                tags,
                status,
                latency
            FROM trace_base base
            WHERE {where_sql}
            ORDER BY {order_clause}{limit_clause}
            FORMAT JSONEachRow
            """
        rows = await self._query_json_each_row(query, params)
        if include_io:
            payloads_by_trace = await self._fetch_trace_payloads(
                trace_filter.params["project_id"],
                [str(row.get("traceId") or "") for row in rows if row.get("traceId")],
            )
            for row in rows:
                payload = payloads_by_trace.get(str(row.get("traceId") or ""))
                if payload:
                    row.update(payload)
        return rows

    async def _count_trace_rows(self, trace_filter: "TraceFilterSql") -> int:
        rows = await self._query_json_each_row(
            f"""
            {trace_filter.cte_sql}
            SELECT count() AS total
            FROM trace_base base
            WHERE {trace_filter.where_sql}
            FORMAT JSONEachRow
            """,
            trace_filter.params,
        )
        if not rows:
            return 0
        return int(rows[0].get("total") or 0)

    async def _locate_trace_page(
        self,
        trace_filter: "TraceFilterSql",
        anchor_trace_id: str,
        page_size: int,
    ) -> int | None:
        params = {
            **trace_filter.params,
            "anchor_trace_id": anchor_trace_id,
            "anchor_page_size": page_size,
        }
        rows = await self._query_json_each_row(
            f"""
            {trace_filter.cte_sql}
            SELECT page
            FROM (
                SELECT
                    traceId,
                    intDiv(
                        row_number() OVER (
                            ORDER BY
                                toUnixTimestamp64Milli(createdAt) ASC,
                                traceId ASC
                        ) - 1,
                        {{anchor_page_size:UInt32}}
                    ) + 1 AS page
                FROM trace_base base
                WHERE {trace_filter.where_sql}
            )
            WHERE traceId = {{anchor_trace_id:String}}
            LIMIT 1
            FORMAT JSONEachRow
            """,
            params,
        )
        if not rows:
            return None
        page = int(rows[0].get("page") or 0)
        return page if page >= 1 else None

    async def _fetch_trace_payloads(
        self,
        project_id: str,
        trace_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        unique_trace_ids = list(
            dict.fromkeys(trace_id for trace_id in trace_ids if trace_id)
        )
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

    async def _fetch_page_observation_summaries(
        self,
        project_id: str,
        trace_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        unique_trace_ids = list(
            dict.fromkeys(trace_id for trace_id in trace_ids if trace_id)
        )
        if not unique_trace_ids:
            return {}

        summaries: dict[str, dict[str, Any]] = {}
        for chunk in _chunked(unique_trace_ids, 100):
            params: dict[str, Any] = {"project_id": project_id}
            trace_id_placeholders = []
            for index, trace_id in enumerate(chunk):
                param_key = f"summary_trace_id_{index}"
                trace_id_placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = trace_id
            rows = await self._query_json_each_row(
                """
                /* page_observation_summary */
                SELECT
                    trace_id AS traceId,
                    max(end_time) AS lastEndTime,
                    max(if(level IN ('ERROR', 'WARNING'), 1, 0)) AS hasIssue
                FROM observations
                WHERE project_id = {project_id:String}
                  AND trace_id IN (__TRACE_IDS__)
                  AND is_deleted = 0
                GROUP BY trace_id
                FORMAT JSONEachRow
                """.replace("__TRACE_IDS__", ", ".join(trace_id_placeholders)),
                params,
            )
            for row in rows:
                trace_id = str(row.get("traceId") or "")
                if trace_id:
                    summaries[trace_id] = row
        return summaries

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
        trace_ids: list[str] | None = None,
        observation_ids: list[str] | None = None,
        session_ids: list[str] | None = None,
        annotation_item_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "project_id": project_id,
            "queue_id": queue_id,
            "run_id": run_id or "",
        }
        scope_conditions: list[str] = []
        for field, values, prefix in (
            ("trace_id", trace_ids, "queue_trace_id"),
            ("observation_id", observation_ids, "queue_observation_id"),
            ("session_id", session_ids, "queue_session_id"),
        ):
            placeholders = []
            for index, value in enumerate(dict.fromkeys(values or [])):
                param_key = f"{prefix}_{index}"
                placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = value
            if placeholders:
                scope_conditions.append(f"{field} IN ({', '.join(placeholders)})")
        item_placeholders = []
        for index, item_id in enumerate(dict.fromkeys(annotation_item_ids or [])):
            param_key = f"queue_annotation_item_id_{index}"
            item_placeholders.append(f"{{{param_key}:String}}")
            params[param_key] = item_id
        if item_placeholders:
            scope_conditions.append(
                f"metadata['annotationItemId'] IN ({', '.join(item_placeholders)})"
            )
        scope_sql = f"AND ({' OR '.join(scope_conditions)})" if scope_conditions else ""
        rows = await self._query_json_each_row(
            f"""
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
            FROM scores FINAL
            WHERE project_id = {{project_id:String}}
              AND is_deleted = 0
              AND queue_id = {{queue_id:String}}
              AND ({{run_id:String}} = '' OR metadata['paAutoEvaluationRunId'] = {{run_id:String}})
              {scope_sql}
            ORDER BY created_at DESC, id DESC
            FORMAT JSONEachRow
            """,
            params,
        )
        return [_format_score(row) for row in rows]

    async def _fetch_scores_by_trace(
        self,
        project_id: str,
        trace_ids: list[str],
        *,
        observation_id: str | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        unique_trace_ids = list(
            dict.fromkeys(trace_id for trace_id in trace_ids if trace_id)
        )
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
                observation_filter = (
                    "\n                  AND observation_id = {observation_id:String}"
                )
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
                FROM scores FINAL
                WHERE project_id = {project_id:String}
                  AND is_deleted = 0
                  AND trace_id IN (__TRACE_IDS__)__OBSERVATION_FILTER__
                ORDER BY created_at DESC, id DESC
                FORMAT JSONEachRow
                """.replace("__TRACE_IDS__", ", ".join(trace_id_placeholders)).replace(
                    "__OBSERVATION_FILTER__", observation_filter
                ),
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
        unique_trace_ids = list(
            dict.fromkeys(trace_id for trace_id in trace_ids if trace_id)
        )
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
            client = get_clickhouse_http_client()
            if client is None:
                async with create_clickhouse_http_client(self._settings) as client:
                    response = await client.post(
                        self._url,
                        params=request_params,
                        content=query,
                    )
                    response.raise_for_status()
            else:
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

    async def _query_json_each_row_with_external_table(
        self,
        query: str,
        params: dict[str, Any],
        *,
        table_name: str,
        structure: str,
        rows: Iterable[tuple[str, ...]],
    ) -> list[dict[str, Any]]:
        request_params = {
            "user": self._user,
            "password": self._password,
            **{f"param_{key}": value for key, value in params.items()},
        }
        content = _annotation_external_candidate_tsv(rows)
        form_data = {
            "query": query,
            f"{table_name}_structure": structure,
            f"{table_name}_format": "TabSeparated",
        }
        files = {
            table_name: (
                f"{table_name}.tsv",
                content,
                "application/octet-stream",
            )
        }
        try:
            client = get_clickhouse_http_client()
            if client is None:
                async with create_clickhouse_http_client(self._settings) as client:
                    response = await client.post(
                        self._url,
                        params=request_params,
                        data=form_data,
                        files=files,
                    )
                    response.raise_for_status()
            else:
                response = await client.post(
                    self._url,
                    params=request_params,
                    data=form_data,
                    files=files,
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
            "scoreSummary": row.get("scoreSummary")
            or _score_summary(row.get("scores") or []),
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
        shared_client = get_clickhouse_http_client()
        self._owns_client = shared_client is None
        self._client = shared_client or create_clickhouse_http_client(settings)

    async def __aenter__(self) -> "LangfuseClickHouseScoreWriter":
        return self

    async def __aexit__(self, *_args: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client and not self._client.is_closed:
            await self._client.aclose()

    async def upsert_annotation_score(
        self,
        project_id: str,
        user_id: str,
        score_request: dict[str, Any],
    ) -> None:
        await self.upsert_annotation_scores(
            project_id,
            user_id,
            [score_request],
        )

    async def upsert_annotation_scores(
        self,
        project_id: str,
        user_id: str,
        score_requests: list[dict[str, Any]],
    ) -> None:
        await self.upsert_scores(
            project_id,
            user_id,
            score_requests,
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
        await self.upsert_scores(
            project_id,
            user_id,
            [score_request],
            source=source,
        )

    async def upsert_scores(
        self,
        project_id: str,
        user_id: str,
        score_requests: list[dict[str, Any]],
        *,
        source: str = "API",
    ) -> None:
        if not score_requests:
            return
        records = [
            _clickhouse_score_record(project_id, user_id, score_request, source)
            for score_request in score_requests
        ]
        await self._insert_json_each_row(
            "INSERT INTO scores FORMAT JSONEachRow\n"
            + "\n".join(json.dumps(record, ensure_ascii=False) for record in records)
        )
    async def _insert_json_each_row(self, query: str) -> None:
        request_params = {
            "user": self._user,
            "password": self._password,
        }
        try:
            response = await self._client.post(
                self._url,
                params=request_params,
                content=query,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError("Langfuse ClickHouse 写入失败") from exc


def _clickhouse_score_record(
    project_id: str,
    user_id: str,
    score_request: dict[str, Any],
    source: str,
) -> dict[str, Any]:
    now = _clickhouse_datetime_ms(datetime.now(UTC))
    return {
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


@dataclass(frozen=True)
class TraceFilterSql:
    cte_sql: str
    where_sql: str
    params: dict[str, Any]
    requires_aggregation: bool = False


def _build_trace_filter(
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
    keyword: str | None = None,
    statuses: list[str] | None = None,
    tags: list[str] | None = None,
    user_id: str | None = None,
    business_id: str | None = None,
    latency_min: int | None = None,
    latency_max: int | None = None,
    score_queue_id: str | None = None,
    categorical_score_filters: list[dict[str, Any]] | None = None,
    numeric_score_filters: list[dict[str, Any]] | None = None,
) -> TraceFilterSql:
    trace_filters = ["t.project_id = {project_id:String}", "t.is_deleted = 0"]
    aggregate_filters = ["1 = 1"]
    params: dict[str, Any] = {"project_id": project_id}

    if trace_ids:
        trace_id_placeholders = []
        for index, trace_id in enumerate(trace_ids):
            param_key = f"trace_id_{index}"
            trace_id_placeholders.append(f"{{{param_key}:String}}")
            params[param_key] = trace_id
        trace_filters.append(f"t.id IN ({', '.join(trace_id_placeholders)})")
    if start_time is not None:
        trace_filters.append("t.timestamp >= {start_time:DateTime64(3)}")
        params["start_time"] = start_time
    if end_time is not None:
        trace_filters.append("t.timestamp < {end_time:DateTime64(3)}")
        params["end_time"] = end_time
    normalized_environments = _normalize_environments(environments)
    if normalized_environments:
        environment_placeholders = []
        for index, environment in enumerate(normalized_environments):
            param_key = f"environment_{index}"
            environment_placeholders.append(f"{{{param_key}:String}}")
            params[param_key] = environment
        trace_filters.append(
            f"t.environment IN ({', '.join(environment_placeholders)})"
        )
    if session_id:
        trace_filters.append(
            "position(ifNull(t.session_id, ''), {session_id:String}) > 0"
        )
        params["session_id"] = session_id
    _append_metadata_where_filters(
        trace_filters,
        params,
        metadata_key=metadata_key,
        metadata_value=metadata_value,
        metadata_filters=metadata_filters,
    )

    keyword_value = (keyword or "").strip()
    if keyword_value:
        params["keyword"] = keyword_value
        trace_filters.append(
            "("
            "positionCaseInsensitive(t.id, {keyword:String}) > 0 "
            "OR positionCaseInsensitive(ifNull(t.session_id, ''), {keyword:String}) > 0"
            ")"
        )
    if statuses:
        status_placeholders = []
        for index, status in enumerate(statuses):
            param_key = f"status_{index}"
            status_placeholders.append(f"{{{param_key}:String}}")
            params[param_key] = status
        aggregate_filters.append(
            f"base.status IN ({', '.join(status_placeholders)})"
        )
    normalized_tags = _normalize_tags(tags)
    for index, tag in enumerate(normalized_tags):
        param_key = f"tag_{index}"
        params[param_key] = tag
        trace_filters.append(f"has(t.tags, {{{param_key}:String}})")
    if user_id:
        params["user_id"] = user_id
        trace_filters.append(
            "position(ifNull(t.user_id, ''), {user_id:String}) > 0"
        )
    if business_id:
        params["business_id"] = business_id
        trace_filters.append(
            "("
            "position(ifNull(t.metadata['businessId'], ''), {business_id:String}) > 0 "
            "OR position(ifNull(t.metadata['business_id'], ''), {business_id:String}) > 0 "
            "OR position(ifNull(t.metadata['app_id'], ''), {business_id:String}) > 0"
            ")"
        )
    if latency_min is not None:
        params["latency_min"] = latency_min
        aggregate_filters.append("base.latency >= {latency_min:Int64}")
    if latency_max is not None:
        params["latency_max"] = latency_max
        aggregate_filters.append("base.latency <= {latency_max:Int64}")
    if score_queue_id:
        params["score_queue_id"] = score_queue_id.strip()
        aggregate_filters.append(
            """
            base.traceId IN (
                SELECT traceId
                FROM score_candidates sc
                WHERE sc.queueId = {score_queue_id:String}
            )
            """
        )
    _append_score_filter_sql(
        aggregate_filters,
        params,
        categorical_score_filters=categorical_score_filters,
        numeric_score_filters=numeric_score_filters,
    )

    trace_where_sql = "\n                  AND ".join(trace_filters)
    where_sql = "\n              AND ".join(aggregate_filters)
    requires_aggregation = bool(
        statuses
        or latency_min is not None
        or latency_max is not None
        or _has_score_filters(
            score_queue_id=score_queue_id,
            categorical_score_filters=categorical_score_filters,
            numeric_score_filters=numeric_score_filters,
        )
    )

    score_name_placeholders = [
        f"{{categorical_score_name_{index}:String}}"
        for index, item in enumerate(categorical_score_filters or [])
        if str(item.get("name") or "").strip()
    ] + [
        f"{{numeric_score_name_{index}:String}}"
        for index, item in enumerate(numeric_score_filters or [])
        if str(item.get("name") or "").strip()
    ]
    score_source_conditions: list[str] = []
    if score_queue_id:
        score_source_conditions.append("s.queue_id = {score_queue_id:String}")
    if score_name_placeholders:
        score_source_conditions.append(
            f"s.name IN ({', '.join(score_name_placeholders)})"
        )
    score_source_filter = (
        f"\n                  AND ({' OR '.join(score_source_conditions)})"
        if score_source_conditions
        else ""
    )
    evaluator_name_filter = (
        f"\n                  AND o.name IN ({', '.join(score_name_placeholders)})"
        if score_name_placeholders
        else ""
    )
    evaluator_score_union = (
        f"""
                UNION ALL
                SELECT
                    ifNull(o.trace_id, '') AS traceId,
                    '' AS queueId,
                    o.name AS name,
                    ifNull(JSONExtractString(ifNull(o.output, ''), 'label'), '') AS textValue,
                    JSONExtractFloat(ifNull(o.output, ''), 'score') AS numericValue
                FROM observations o
                INNER JOIN candidate_traces candidate
                  ON candidate.traceId = ifNull(o.trace_id, '')
                WHERE o.project_id = {{project_id:String}}
                  AND o.is_deleted = 0
                  AND o.type = 'EVALUATOR'
                  AND JSONHas(ifNull(o.output, ''), 'score'){evaluator_name_filter}
            """
        if score_name_placeholders
        else ""
    )
    score_candidates_cte = (
        f""",
            score_candidates AS (
                SELECT
                    ifNull(s.trace_id, '') AS traceId,
                    ifNull(s.queue_id, '') AS queueId,
                    s.name AS name,
                    {_score_text_value_sql("s")} AS textValue,
                    s.value AS numericValue
                FROM scores s FINAL
                INNER JOIN candidate_traces candidate
                  ON candidate.traceId = ifNull(s.trace_id, '')
                WHERE s.project_id = {{project_id:String}}
                  AND ifNull(s.trace_id, '') != ''{score_source_filter}
                {evaluator_score_union}
            )"""
        if _has_score_filters(
            score_queue_id=score_queue_id,
            categorical_score_filters=categorical_score_filters,
            numeric_score_filters=numeric_score_filters,
        )
        else ""
    )
    candidate_traces_cte = f"""
            candidate_traces AS (
                SELECT
                    t.id AS traceId,
                    t.project_id AS projectId,
                    t.name AS name,
                    t.environment AS environment,
                    t.user_id AS userId,
                    t.session_id AS sessionId,
                    t.timestamp AS createdAt,
                    t.updated_at AS updatedAt,
                    t.metadata AS metadata,
                    t.tags AS tags
                FROM traces t
                WHERE {trace_where_sql}
            )"""
    if requires_aggregation:
        cte_sql = f"""
            WITH {candidate_traces_cte},
            observation_summary AS (
                SELECT
                    o.project_id,
                    o.trace_id,
                    max(o.end_time) AS lastEndTime,
                    max(if(o.level IN ('ERROR', 'WARNING'), 1, 0)) AS hasIssue
                FROM observations o
                INNER JOIN candidate_traces candidate
                  ON candidate.projectId = o.project_id
                 AND candidate.traceId = o.trace_id
                WHERE o.project_id = {{project_id:String}}
                  AND o.is_deleted = 0
                GROUP BY o.project_id, o.trace_id
            ),
            trace_base AS (
                SELECT
                    t.*,
                    if(
                        lower(t.metadata['status']) IN ('failed', 'error')
                        OR observation_summary.hasIssue = 1,
                        'failed',
                        if(lower(t.metadata['status']) IN ('running', 'pending'), 'running', 'success')
                    ) AS status,
                    greatest(
                        0,
                        toUnixTimestamp64Milli(coalesce(observation_summary.lastEndTime, t.updatedAt))
                        - toUnixTimestamp64Milli(t.createdAt)
                    ) AS latency
                FROM candidate_traces t
                LEFT JOIN observation_summary
                  ON observation_summary.project_id = t.projectId
                 AND observation_summary.trace_id = t.traceId
            ){score_candidates_cte}
            """
    else:
        cte_sql = f"""
            WITH {candidate_traces_cte},
            trace_base AS (
                SELECT
                    t.*,
                    if(
                        lower(t.metadata['status']) IN ('failed', 'error'),
                        'failed',
                        if(
                            lower(t.metadata['status']) IN ('running', 'pending'),
                            'running',
                            'success'
                        )
                    ) AS status,
                    greatest(
                        0,
                        toUnixTimestamp64Milli(t.updatedAt)
                        - toUnixTimestamp64Milli(t.createdAt)
                    ) AS latency
                FROM candidate_traces t
            )
            """
    return TraceFilterSql(
        cte_sql=cte_sql,
        where_sql=where_sql,
        params=params,
        requires_aggregation=requires_aggregation,
    )


def _has_score_filters(
    *,
    score_queue_id: str | None,
    categorical_score_filters: list[dict[str, Any]] | None,
    numeric_score_filters: list[dict[str, Any]] | None,
) -> bool:
    if score_queue_id and score_queue_id.strip():
        return True
    return bool(categorical_score_filters or numeric_score_filters)


def _append_score_filter_sql(
    filters: list[str],
    params: dict[str, Any],
    *,
    categorical_score_filters: list[dict[str, Any]] | None,
    numeric_score_filters: list[dict[str, Any]] | None,
) -> None:
    for index, score_filter in enumerate(categorical_score_filters or []):
        name = str(score_filter.get("name") or "").strip()
        if not name:
            continue
        operator = str(score_filter.get("operator") or "equals")
        value = str(score_filter.get("value") or "")
        name_param = f"categorical_score_name_{index}"
        value_param = f"categorical_score_value_{index}"
        params[name_param] = name
        params[value_param] = value
        if operator == "exists":
            score_value_condition = "1 = 1"
        elif operator == "equals":
            score_value_condition = f"sc.textValue = {{{value_param}:String}}"
        else:
            score_value_condition = (
                f"position(sc.textValue, {{{value_param}:String}}) > 0"
            )
        filters.append(
            f"""
            base.traceId IN (
                SELECT traceId
                FROM score_candidates sc
                WHERE sc.name = {{{name_param}:String}}
                  AND {score_value_condition}
            )
            """
        )

    for index, score_filter in enumerate(numeric_score_filters or []):
        name = str(score_filter.get("name") or "").strip()
        expected = _numeric_or_none(score_filter.get("value"))
        if not name or expected is None:
            continue
        operator = str(score_filter.get("operator") or "eq")
        comparison = {
            "eq": "=",
            "gte": ">=",
            "lte": "<=",
            "gt": ">",
            "lt": "<",
        }.get(operator, "=")
        name_param = f"numeric_score_name_{index}"
        value_param = f"numeric_score_value_{index}"
        params[name_param] = name
        params[value_param] = expected
        filters.append(
            f"""
            base.traceId IN (
                SELECT traceId
                FROM score_candidates sc
                WHERE sc.name = {{{name_param}:String}}
                  AND sc.numericValue {comparison} {{{value_param}:Float64}}
            )
            """
        )


def _score_text_value_sql(alias: str) -> str:
    return (
        "coalesce("
        f"nullIf(ifNull({alias}.string_value, ''), ''), "
        f"nullIf(ifNull({alias}.long_string_value, ''), ''), "
        f"if({alias}.value = 0, '', toString({alias}.value))"
        ")"
    )


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


def _build_annotation_source_filter_sql(
    *,
    keyword: str = "",
    metadata_filters: list[dict[str, Any]] | None,
    input_filters: list[dict[str, Any]] | None,
    output_filters: list[dict[str, Any]] | None,
) -> tuple[str, dict[str, Any]]:
    conditions: list[str] = []
    params: dict[str, Any] = {}
    keyword = keyword.strip()
    if keyword:
        params["annotation_source_keyword"] = keyword
        conditions.append(
            "("
            "positionCaseInsensitiveUTF8(candidate_item_id, "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(candidate_object_id, "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(candidate_object_type, "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(source_title, "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(source_input, "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(source_output, "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(toString(source_metadata), "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(trace_id, "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(session_id, "
            "{annotation_source_keyword:String}) > 0 "
            "OR positionCaseInsensitiveUTF8(user_id, "
            "{annotation_source_keyword:String}) > 0"
            ")"
        )
    _append_annotation_source_filters(
        conditions,
        params,
        metadata_filters or [],
        column="source_metadata",
        prefix="annotation_metadata",
        metadata=True,
    )
    _append_annotation_source_filters(
        conditions,
        params,
        input_filters or [],
        column="source_input",
        prefix="annotation_input",
        metadata=False,
    )
    _append_annotation_source_filters(
        conditions,
        params,
        output_filters or [],
        column="source_output",
        prefix="annotation_output",
        metadata=False,
    )
    return " AND ".join(conditions) if conditions else "1 = 1", params


def _annotation_metadata_filters(filters: dict[str, Any]) -> list[dict[str, Any]]:
    result = list(filters.get("metadata_filters") or [])
    metadata_filter = filters.get("metadata_filter")
    if metadata_filter:
        result.insert(0, metadata_filter)
    return result


def _annotation_source_candidates_sql() -> str:
    return """
        SELECT
            c.item_id AS candidate_item_id,
            c.object_id AS candidate_object_id,
            c.object_type AS candidate_object_type,
            c.status AS candidate_status,
            c.assignee_id AS candidate_assignee_id,
            c.created_at AS candidate_created_at,
            c.updated_at AS candidate_updated_at,
            if(c.object_type = 'TRACE', if(empty(t.name), t.id, t.name),
               if(c.object_type = 'OBSERVATION', if(empty(o.name), o.id, o.name),
                  c.object_id)) AS source_title,
            if(c.object_type = 'TRACE', ifNull(t.input, ''),
               if(c.object_type = 'OBSERVATION', ifNull(o.input, ''), ''))
                AS source_input,
            if(c.object_type = 'TRACE', ifNull(t.output, ''),
               if(c.object_type = 'OBSERVATION', ifNull(o.output, ''), ''))
                AS source_output,
            if(c.object_type = 'TRACE', t.metadata,
               if(c.object_type = 'OBSERVATION', o.metadata,
                  CAST(map(), 'Map(String, String)'))) AS source_metadata,
            if(c.object_type = 'TRACE', c.object_id,
               if(c.object_type = 'OBSERVATION', o.trace_id, '')) AS trace_id,
            if(c.object_type = 'OBSERVATION', c.object_id, '') AS observation_id,
            if(c.object_type = 'TRACE', ifNull(t.session_id, ''),
               if(c.object_type = 'OBSERVATION', ifNull(parent_trace.session_id, ''),
                  if(c.object_type = 'SESSION', c.object_id, ''))) AS session_id,
            if(c.object_type = 'TRACE', ifNull(t.user_id, ''),
               if(c.object_type = 'OBSERVATION', ifNull(parent_trace.user_id, ''), ''))
                AS user_id,
            if(c.object_type = 'TRACE', toString(t.timestamp),
               if(c.object_type = 'OBSERVATION', toString(o.start_time), c.created_at))
                AS source_created_at
        FROM annotation_candidates c
        LEFT JOIN (
            SELECT id, project_id, name, input, output, metadata, session_id,
                   user_id, timestamp
            FROM traces FINAL
            WHERE project_id = {project_id:String}
              AND is_deleted = 0
              AND id IN (
                  SELECT object_id
                  FROM annotation_candidates
                  WHERE object_type = 'TRACE'
              )
        ) t
          ON c.object_type = 'TRACE' AND t.id = c.object_id
        LEFT JOIN (
            SELECT id, trace_id, project_id, name, input, output, metadata,
                   start_time
            FROM observations FINAL
            WHERE project_id = {project_id:String}
              AND is_deleted = 0
              AND id IN (
                  SELECT object_id
                  FROM annotation_candidates
                  WHERE object_type = 'OBSERVATION'
              )
        ) o
          ON c.object_type = 'OBSERVATION' AND o.id = c.object_id
        LEFT JOIN (
            SELECT id, project_id, session_id, user_id
            FROM traces FINAL
            WHERE project_id = {project_id:String}
              AND is_deleted = 0
              AND id IN (
                  SELECT trace_id
                  FROM observations FINAL
                  WHERE project_id = {project_id:String}
                    AND is_deleted = 0
                    AND id IN (
                        SELECT object_id
                        FROM annotation_candidates
                        WHERE object_type = 'OBSERVATION'
                    )
              )
        ) parent_trace
          ON c.object_type = 'OBSERVATION' AND parent_trace.id = o.trace_id
    """


def _annotation_candidate_facet_filter_sql(
    filters: dict[str, Any],
    params: dict[str, Any],
    *,
    omitted_filter: str,
) -> str:
    conditions: list[str] = []
    for filter_key, column, param_prefix in (
        ("status", "candidate_status", "annotation_status"),
        ("object_type", "candidate_object_type", "annotation_object_type"),
        ("assignee_ids", "candidate_assignee_id", "annotation_assignee_id"),
    ):
        if filter_key == omitted_filter:
            continue
        values = list(filters.get(filter_key) or [])
        if not values:
            continue
        placeholders: list[str] = []
        for index, value in enumerate(values):
            param_key = f"{param_prefix}_{index}"
            params[param_key] = str(value)
            placeholders.append(f"{{{param_key}:String}}")
        conditions.append(f"{column} IN ({', '.join(placeholders)})")
    return " AND ".join(conditions) if conditions else "1 = 1"


def _annotation_external_candidate_rows(
    candidates: list[dict[str, Any]],
) -> Iterable[tuple[str, ...]]:
    for candidate in candidates:
        assignee = candidate.get("assignee") or {}
        yield (
            str(candidate.get("id") or ""),
            str(candidate.get("objectId") or ""),
            str(candidate.get("objectType") or ""),
            str(candidate.get("status") or ""),
            str(assignee.get("id") or ""),
            str(candidate.get("createdAt") or ""),
            str(candidate.get("updatedAt") or ""),
        )


def _annotation_external_candidate_tsv(rows: Iterable[tuple[str, ...]]) -> bytes:
    content = bytearray()
    for index, row in enumerate(rows):
        if index:
            content.extend(b"\n")
        content.extend(
            "\t".join(_clickhouse_tsv_escape(value) for value in row).encode("utf-8")
        )
    return bytes(content)


def _clickhouse_tsv_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


def _annotation_item_from_clickhouse_external_row(
    row: dict[str, Any],
    *,
    candidate: dict[str, Any],
) -> dict[str, Any]:
    try:
        metadata = json.loads(row.get("sourceMetadata") or "{}")
    except json.JSONDecodeError:
        metadata = {}
    return {
        **candidate,
        "source": {
            "objectId": candidate["objectId"],
            "objectType": candidate["objectType"],
            "title": row.get("sourceTitle") or candidate["objectId"],
            "input": _format_payload(row.get("sourceInput")),
            "output": _format_payload(row.get("sourceOutput")),
            "metadata": metadata if isinstance(metadata, dict) else {},
            "traceId": row.get("traceId") or "",
            "observationId": row.get("observationId") or "",
            "sessionId": row.get("sessionId") or "",
            "userId": row.get("userId") or "",
            "latencyMs": 0,
            "costUsd": 0,
            "createdAt": row.get("sourceCreatedAt") or "",
        },
    }


def _append_annotation_source_filters(
    conditions: list[str],
    params: dict[str, Any],
    value_filters: list[dict[str, Any]],
    *,
    column: str,
    prefix: str,
    metadata: bool,
) -> None:
    for index, value_filter in enumerate(value_filters):
        key = str(value_filter.get("key") or "").strip()
        if metadata and key.startswith("metadata."):
            key = key.removeprefix("metadata.")
        operator = str(value_filter.get("operator") or "contains")
        value = str(value_filter.get("value") or "")
        key_parts = [part for part in key.split(".") if part]
        if operator == "exists" and not key_parts:
            continue
        if operator != "exists" and not key_parts and not value:
            continue

        key_params: list[str] = []
        for part_index, part in enumerate(key_parts):
            key_param = f"{prefix}_key_{index}_{part_index}"
            params[key_param] = part
            key_params.append(f"{{{key_param}:String}}")

        if metadata:
            first_key = key_params[0] if key_params else ""
            existence = f"mapContains({column}, {first_key})" if first_key else "1"
            if len(key_params) > 1:
                nested_keys = ", ".join(key_params[1:])
                existence += (
                    f" AND JSONHas({column}[{first_key}], {nested_keys})"
                )
                extracted = (
                    f"coalesce(nullIf(JSON_VALUE({column}[{first_key}], "
                    f"{{{prefix}_path_{index}:String}}), ''), "
                    f"JSONExtractRaw({column}[{first_key}], {nested_keys}))"
                )
                params[f"{prefix}_path_{index}"] = _clickhouse_json_path(
                    key_parts[1:]
                )
            elif first_key:
                extracted = f"{column}[{first_key}]"
            else:
                extracted = f"toString({column})"
        else:
            payload = f"ifNull({column}, '')"
            existence = (
                f"JSONHas({payload}, {', '.join(key_params)})"
                if key_params
                else f"notEmpty({payload})"
            )
            if key_params:
                params[f"{prefix}_path_{index}"] = _clickhouse_json_path(key_parts)
                extracted = (
                    f"coalesce(nullIf(JSON_VALUE({payload}, "
                    f"{{{prefix}_path_{index}:String}}), ''), "
                    f"JSONExtractRaw({payload}, {', '.join(key_params)}))"
                )
            else:
                extracted = payload

        if operator == "exists":
            conditions.append(f"({existence})")
            continue
        value_param = f"{prefix}_value_{index}"
        params[value_param] = value
        if operator == "equals":
            conditions.append(
                f"(({existence}) AND {extracted} = {{{value_param}:String}})"
            )
        else:
            conditions.append(
                f"(({existence}) AND positionCaseInsensitiveUTF8("
                f"{extracted}, {{{value_param}:String}}) > 0)"
            )


def _clickhouse_json_path(parts: list[str]) -> str:
    return "$" + "".join(
        f".{json.dumps(part, ensure_ascii=False)}" for part in parts
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
        item.strip().lower() for item in str(fields or "").split(",") if item.strip()
    }
    return field_name.lower() in requested


def _trace_count_cache_key(
    *,
    project_id: str,
    time_range: str | None,
    created_at_range: list[str] | None,
    keyword: str | None,
    statuses: list[str] | None,
    environments: list[str] | None,
    tags: list[str] | None,
    session_id: str | None,
    user_id: str | None,
    business_id: str | None,
    latency_min: int | None,
    latency_max: int | None,
    score_queue_id: str | None,
    metadata_key: str | None,
    metadata_value: str | None,
    metadata_filters: list[dict[str, Any]] | None,
    categorical_score_filters: list[dict[str, Any]] | None,
    numeric_score_filters: list[dict[str, Any]] | None,
) -> str:
    def text(value: str | None) -> str | None:
        normalized = str(value or "").strip()
        return normalized or None

    def values(items: list[str] | None) -> list[str]:
        return sorted({item.strip() for item in items or [] if item.strip()})

    def object_filters(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        normalized = [
            {str(key): item[key] for key in sorted(item)} for item in items or []
        ]
        return sorted(
            normalized,
            key=lambda item: json.dumps(item, sort_keys=True, ensure_ascii=False),
        )

    payload = {
        "projectId": project_id,
        "timeRange": time_range,
        "createdAtRange": list(created_at_range or []),
        "keyword": text(keyword),
        "statuses": values(statuses),
        "environments": values(environments),
        "tags": values(tags),
        "sessionId": text(session_id),
        "userId": text(user_id),
        "businessId": text(business_id),
        "latencyMin": latency_min,
        "latencyMax": latency_max,
        "scoreQueueId": text(score_queue_id),
        "metadataKey": text(metadata_key),
        "metadataValue": text(metadata_value),
        "metadataFilters": object_filters(metadata_filters),
        "categoricalScoreFilters": object_filters(categorical_score_filters),
        "numericScoreFilters": object_filters(numeric_score_filters),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


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
    if (
        needle
        and needle not in row["traceId"].lower()
        and needle not in (row.get("sessionId") or "").lower()
    ):
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
    if score_queue_id and not _matches_score_queue_id(
        row.get("scores") or [], score_queue_id
    ):
        return False
    if metadata_key:
        if not isinstance(metadata, dict) or metadata_key not in metadata:
            return False
        if metadata_value and metadata_value not in str(
            metadata.get(metadata_key) or ""
        ):
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
        usage = (
            observation.get("usageDetails")
            or observation.get("providedUsageDetails")
            or {}
        )
        start = _parse_clickhouse_datetime(observation.get("startTime"))
        end = _parse_clickhouse_datetime(observation.get("endTime"))
        duration = ""
        if start and end:
            duration = f"{max(0, round((end - start).total_seconds() * 1000))}ms"
        node = {
            "id": observation["id"],
            "type": _to_chain_node_type(
                observation.get("type"), observation.get("name")
            ),
            "title": observation.get("name")
            or observation.get("type")
            or "Observation",
            "duration": duration,
            "tokensIn": int(usage.get("input") or usage.get("prompt_tokens") or 0),
            "tokensOut": int(
                usage.get("output") or usage.get("completion_tokens") or 0
            ),
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


_shared_clickhouse_reader: LangfuseClickHouseReader | None = None


async def get_langfuse_clickhouse_reader(
    settings: Settings = Depends(get_settings),
) -> LangfuseClickHouseReader:
    global _shared_clickhouse_reader
    if (
        _shared_clickhouse_reader is None
        or _shared_clickhouse_reader._settings is not settings
    ):
        _shared_clickhouse_reader = LangfuseClickHouseReader(settings)
    return _shared_clickhouse_reader


async def get_langfuse_clickhouse_score_writer(
    settings: Settings = Depends(get_settings),
) -> AsyncIterator[LangfuseClickHouseScoreWriter]:
    writer = LangfuseClickHouseScoreWriter(settings)
    try:
        yield writer
    finally:
        await writer.aclose()
