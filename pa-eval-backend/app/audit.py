from datetime import datetime
from typing import Any
from uuid import uuid4

import psycopg
from fastapi import APIRouter, Depends, Query, Request
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.auth_context import (
    CurrentUserContext,
    get_current_user_context,
    parse_access_token,
)
from app.config import Settings, get_settings
from app.langfuse_db import LangfuseDatabaseConfigError
from app.response import success

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])
audit_router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SPECIAL_ACTIONS = {
    "archive": "ARCHIVE",
    "restore": "RESTORE",
    "rerun": "RERUN",
    "scores": "SAVE_SCORES",
    "dataset-items": "ADD_TO_DATASET",
    "annotation-task": "CREATE_ANNOTATION_TASK",
    "flowback": "FLOWBACK",
}


class AdminAuditService:
    def __init__(self, settings: Settings) -> None:
        self._database_url = settings.langfuse_database_url

    async def get_overview(self) -> dict[str, Any]:
        if not self._database_url:
            return {
                "service": {"name": "PA Eval Backend", "status": "degraded"},
                "database": {"configured": False, "connected": False},
                "metrics": self._empty_metrics(),
                "recentAuditLogs": [],
            }

        try:
            async with await self._connect() as connection:
                async with connection.cursor() as cursor:
                    metrics = await self._load_overview_metrics(cursor)
                    recent = await self._load_recent_audit_logs(cursor, limit=5)
        except psycopg.Error:
            return {
                "service": {"name": "PA Eval Backend", "status": "degraded"},
                "database": {"configured": True, "connected": False},
                "metrics": self._empty_metrics(),
                "recentAuditLogs": [],
            }

        return {
            "service": {"name": "PA Eval Backend", "status": "healthy"},
            "database": {"configured": True, "connected": True},
            "metrics": metrics,
            "recentAuditLogs": recent,
        }

    async def list_audit_logs(
        self,
        *,
        page: int,
        page_size: int,
        keyword: str | None,
        action: str | None,
        resource_type: str | None,
        status: str | None,
        actor_email: str | None,
        organization_id: str | None,
        project_id: str | None,
        created_from: str | None,
        created_to: str | None,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        filters: list[str] = []
        params: dict[str, Any] = {
            "limit": page_size,
            "offset": (page - 1) * page_size,
        }

        if keyword:
            filters.append(
                """
                (
                    actor_email ILIKE %(keyword)s
                    OR action ILIKE %(keyword)s
                    OR resource_type ILIKE %(keyword)s
                    OR resource_id ILIKE %(keyword)s
                    OR path ILIKE %(keyword)s
                    OR tx_id ILIKE %(keyword)s
                )
                """
            )
            params["keyword"] = f"%{keyword}%"
        if action:
            filters.append("UPPER(action) = UPPER(%(action)s)")
            params["action"] = action
        if resource_type:
            filters.append("resource_type = %(resource_type)s")
            params["resource_type"] = resource_type
        if status:
            filters.append("status = %(status)s")
            params["status"] = status
        if actor_email:
            filters.append("actor_email ILIKE %(actor_email)s")
            params["actor_email"] = f"%{actor_email}%"
        if organization_id:
            filters.append("organization_id = %(organization_id)s")
            params["organization_id"] = organization_id
        if project_id:
            filters.append("project_id = %(project_id)s")
            params["project_id"] = project_id
        if created_from:
            filters.append("create_date >= %(created_from)s")
            params["created_from"] = _parse_datetime_filter(created_from)
        if created_to:
            filters.append("create_date <= %(created_to)s")
            params["created_to"] = _parse_datetime_filter(created_to)

        where_sql = "WHERE " + " AND ".join(filters) if filters else ""
        async with await self._connect() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    f"SELECT COUNT(id)::int AS total FROM pa_audit_logs {where_sql}",
                    params,
                )
                total_row = await cursor.fetchone()
                await cursor.execute(
                    f"""
                    SELECT
                        id,
                        actor_user_id,
                        actor_email,
                        action,
                        resource_type,
                        resource_id,
                        organization_id,
                        project_id,
                        method,
                        path,
                        status,
                        status_code,
                        ip_address,
                        user_agent,
                        tx_id,
                        metadata,
                        create_date
                    FROM pa_audit_logs
                    {where_sql}
                    ORDER BY create_date DESC, id DESC
                    LIMIT %(limit)s OFFSET %(offset)s
                    """,
                    params,
                )
                rows = list(await cursor.fetchall())

        return {
            "total": (total_row or {}).get("total", 0),
            "datas": [self._to_audit_log_payload(row) for row in rows],
        }

    async def record_http_request(
        self,
        *,
        request: Request,
        status_code: int,
        settings: Settings,
    ) -> None:
        if not self._database_url:
            return
        if not should_audit_request(request):
            return

        payload = parse_access_token(
            request.cookies.get(settings.pa_eval_auth_cookie_name),
            settings,
        )
        actor_user_id = ""
        actor_email = ""
        if payload:
            actor_user_id = str(payload.get("langfuseUserId") or "")
            actor_email = str(payload.get("email") or "")

        resource = infer_audit_resource(request.method, request.url.path)
        status = "SUCCESS" if status_code < 400 else "FAILED"
        audit_id = f"paaudit_{uuid4().hex}"
        now = datetime.utcnow()

        try:
            async with await self._connect() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        INSERT INTO pa_audit_logs (
                            create_by,
                            update_by,
                            create_date,
                            update_date,
                            id,
                            actor_user_id,
                            actor_email,
                            action,
                            resource_type,
                            resource_id,
                            organization_id,
                            project_id,
                            method,
                            path,
                            status,
                            status_code,
                            ip_address,
                            user_agent,
                            tx_id,
                            metadata
                        )
                        VALUES (
                            %(create_by)s,
                            %(update_by)s,
                            %(create_date)s,
                            %(update_date)s,
                            %(id)s,
                            %(actor_user_id)s,
                            %(actor_email)s,
                            %(action)s,
                            %(resource_type)s,
                            %(resource_id)s,
                            %(organization_id)s,
                            %(project_id)s,
                            %(method)s,
                            %(path)s,
                            %(status)s,
                            %(status_code)s,
                            %(ip_address)s,
                            %(user_agent)s,
                            %(tx_id)s,
                            %(metadata)s
                        )
                        """,
                        {
                            "create_by": actor_email or "anonymous",
                            "update_by": actor_email or "anonymous",
                            "create_date": now,
                            "update_date": now,
                            "id": audit_id,
                            "actor_user_id": actor_user_id,
                            "actor_email": actor_email,
                            "action": resource["action"],
                            "resource_type": resource["resource_type"],
                            "resource_id": resource["resource_id"],
                            "organization_id": resource["organization_id"],
                            "project_id": resource["project_id"],
                            "method": request.method.upper(),
                            "path": request.url.path,
                            "status": status,
                            "status_code": status_code,
                            "ip_address": request.client.host if request.client else "",
                            "user_agent": request.headers.get("user-agent", "")[:500],
                            "tx_id": audit_id,
                            "metadata": Jsonb(
                                {
                                    "query": sanitize_query_params(
                                        dict(request.query_params)
                                    ),
                                }
                            ),
                        },
                    )
        except psycopg.Error:
            return

    async def _connect(self) -> psycopg.AsyncConnection:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()
        return await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        )

    async def _load_overview_metrics(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
    ) -> dict[str, int]:
        queries = {
            "organizations": "SELECT COUNT(id)::int AS count FROM organizations",
            "projects": "SELECT COUNT(id)::int AS count FROM projects",
            "activeProjects": "SELECT COUNT(id)::int AS count FROM projects WHERE deleted_at IS NULL",
            "archivedProjects": "SELECT COUNT(id)::int AS count FROM projects WHERE deleted_at IS NOT NULL",
            "users": "SELECT COUNT(id)::int AS count FROM users",
            "auditLogs": "SELECT COUNT(id)::int AS count FROM pa_audit_logs",
        }
        metrics: dict[str, int] = {}
        for key, sql in queries.items():
            await cursor.execute(sql, {})
            row = await cursor.fetchone()
            metrics[key] = int((row or {}).get("count") or 0)
        return metrics

    async def _load_recent_audit_logs(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        *,
        limit: int,
    ) -> list[dict[str, Any]]:
        await cursor.execute(
            """
            SELECT
                id,
                actor_user_id,
                actor_email,
                action,
                resource_type,
                resource_id,
                organization_id,
                project_id,
                method,
                path,
                status,
                status_code,
                ip_address,
                user_agent,
                tx_id,
                metadata,
                create_date
            FROM pa_audit_logs
            ORDER BY create_date DESC, id DESC
            LIMIT %(limit)s
            """,
            {"limit": limit},
        )
        return [self._to_audit_log_payload(row) for row in await cursor.fetchall()]

    @staticmethod
    def _empty_metrics() -> dict[str, int]:
        return {
            "organizations": 0,
            "projects": 0,
            "activeProjects": 0,
            "archivedProjects": 0,
            "users": 0,
            "auditLogs": 0,
        }

    @staticmethod
    def _to_audit_log_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "actorUserId": row.get("actor_user_id") or "",
            "actorEmail": row.get("actor_email") or "",
            "action": normalize_audit_value(row.get("action")),
            "resourceType": row.get("resource_type") or "",
            "resourceId": row.get("resource_id") or "",
            "organizationId": row.get("organization_id") or "",
            "projectId": row.get("project_id") or "",
            "method": row.get("method") or "",
            "path": row.get("path") or "",
            "status": normalize_audit_value(row.get("status")),
            "statusCode": row.get("status_code") or 0,
            "ipAddress": row.get("ip_address") or "",
            "userAgent": row.get("user_agent") or "",
            "txId": row.get("tx_id") or "",
            "metadata": row.get("metadata") or {},
            "createdAt": _format_datetime(row.get("create_date")),
        }


def get_admin_audit_service(
    settings: Settings = Depends(get_settings),
) -> AdminAuditService:
    return AdminAuditService(settings)


@admin_router.get("/overview")
async def get_admin_overview(
    current_user: CurrentUserContext = Depends(get_current_user_context),
    service: AdminAuditService = Depends(get_admin_audit_service),
) -> dict[str, Any]:
    _ = current_user
    return success(await service.get_overview())


@audit_router.get("")
async def list_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None, alias="resourceType"),
    status: str | None = Query(default=None, pattern="^(SUCCESS|FAILED)$"),
    actor_email: str | None = Query(default=None, alias="actorEmail"),
    organization_id: str | None = Query(default=None, alias="organizationId"),
    project_id: str | None = Query(default=None, alias="projectId"),
    created_from: str | None = Query(default=None, alias="createdFrom"),
    created_to: str | None = Query(default=None, alias="createdTo"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    service: AdminAuditService = Depends(get_admin_audit_service),
) -> dict[str, Any]:
    _ = current_user
    return success(
        await service.list_audit_logs(
            page=page,
            page_size=page_size,
            keyword=keyword,
            action=action,
            resource_type=resource_type,
            status=status,
            actor_email=actor_email,
            organization_id=organization_id,
            project_id=project_id,
            created_from=created_from,
            created_to=created_to,
        )
    )


async def audit_http_request(
    request: Request,
    *,
    status_code: int,
    settings: Settings,
) -> None:
    await AdminAuditService(settings).record_http_request(
        request=request,
        status_code=status_code,
        settings=settings,
    )


def should_audit_request(request: Request) -> bool:
    if request.method.upper() not in WRITE_METHODS:
        return False
    path = request.url.path
    return path.startswith("/api/") and not path.startswith("/api/admin")


def infer_audit_resource(method: str, path: str) -> dict[str, str]:
    segments = [segment for segment in path.split("/") if segment]
    if segments and segments[0] == "api":
        segments = segments[1:]

    action = _infer_action(method, segments)
    resource_type = segments[0] if segments else "unknown"
    resource_id = ""
    organization_id = ""
    project_id = ""

    if len(segments) >= 2:
        if segments[0] == "projects":
            project_id = segments[1]
            if len(segments) >= 3:
                resource_type = segments[2]
            if len(segments) >= 4:
                resource_id = segments[3]
            else:
                resource_type = "project"
                resource_id = project_id
        elif segments[0] == "organizations":
            organization_id = segments[1]
            if len(segments) >= 3:
                resource_type = segments[2]
            if len(segments) >= 4:
                resource_id = segments[3]
            else:
                resource_type = "organization"
                resource_id = organization_id
        else:
            resource_id = segments[1]

    return {
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "organization_id": organization_id,
        "project_id": project_id,
    }


def sanitize_query_params(query: dict[str, str]) -> dict[str, str]:
    sensitive_tokens = ("key", "secret", "token", "password", "credential")
    sanitized: dict[str, str] = {}
    for key, value in query.items():
        if any(token in key.lower() for token in sensitive_tokens):
            sanitized[key] = "***"
        else:
            sanitized[key] = value
    return sanitized


def normalize_audit_value(value: Any) -> str:
    return str(value or "").upper()


def _infer_action(method: str, segments: list[str]) -> str:
    for segment in reversed(segments):
        if segment in SPECIAL_ACTIONS:
            return SPECIAL_ACTIONS[segment]

    method = method.upper()
    if method == "POST":
        return "CREATE"
    if method in {"PUT", "PATCH"}:
        return "UPDATE"
    if method == "DELETE":
        return "DELETE"
    return method


def _format_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        formatted = value.isoformat(timespec="milliseconds")
        return formatted.replace("+00:00", "Z")
    return str(value or "")


def _parse_datetime_filter(value: str) -> datetime:
    normalized = value.strip().replace("T", " ").replace("Z", "")
    return datetime.fromisoformat(normalized)
