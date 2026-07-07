from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.audit import AdminAuditService, get_admin_audit_service
from app.main import app


class FakeAdminAuditService:
    def __init__(self) -> None:
        self.list_params = None

    async def get_overview(self) -> dict:
        return {
            "service": {
                "name": "PA Eval Backend",
                "status": "healthy",
            },
            "database": {
                "configured": True,
                "connected": True,
            },
            "metrics": {
                "organizations": 2,
                "projects": 3,
                "activeProjects": 2,
                "archivedProjects": 1,
                "users": 4,
                "auditLogs": 5,
            },
            "recentAuditLogs": [
                {
                    "id": "audit-1",
                    "action": "CREATE",
                    "resourceType": "project",
                    "resourceId": "project-1",
                    "actorEmail": "admin@example.com",
                    "status": "SUCCESS",
                    "createdAt": "2026-07-07T10:00:00.000Z",
                }
            ],
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
    ) -> dict:
        self.list_params = {
            "page": page,
            "page_size": page_size,
            "keyword": keyword,
            "action": action,
            "resource_type": resource_type,
            "status": status,
            "actor_email": actor_email,
            "organization_id": organization_id,
            "project_id": project_id,
            "created_from": created_from,
            "created_to": created_to,
        }
        return {
            "total": 1,
            "datas": [
                {
                    "id": "audit-1",
                    "action": "CREATE",
                    "resourceType": "project",
                    "resourceId": "project-1",
                    "actorEmail": "admin@example.com",
                    "status": "SUCCESS",
                    "createdAt": "2026-07-07T10:00:00.000Z",
                }
            ],
        }


def override_service(fake_service: FakeAdminAuditService):
    async def _override() -> AdminAuditService:
        return fake_service  # type: ignore[return-value]

    app.dependency_overrides[get_admin_audit_service] = _override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="admin@example.com",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_get_admin_overview_returns_operational_metrics() -> None:
    fake_service = FakeAdminAuditService()
    override_service(fake_service)

    try:
        response = TestClient(app).get("/api/admin/overview")
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["service"]["status"] == "healthy"
    assert body["data"]["metrics"]["projects"] == 3
    assert body["data"]["recentAuditLogs"][0]["action"] == "CREATE"


def test_list_audit_logs_passes_filters_and_returns_paginated_result() -> None:
    fake_service = FakeAdminAuditService()
    override_service(fake_service)

    try:
        response = TestClient(app).get(
            "/api/audit-logs",
            params={
                "page": 2,
                "pageSize": 20,
                "keyword": "project",
                "action": "CREATE",
                "resourceType": "project",
                "status": "SUCCESS",
                "actorEmail": "admin@example.com",
                "organizationId": "org-1",
                "projectId": "project-1",
                "createdFrom": "2026-07-01T00:00:00.000Z",
                "createdTo": "2026-07-07T23:59:59.999Z",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["total"] == 1
    assert fake_service.list_params == {
        "page": 2,
        "page_size": 20,
        "keyword": "project",
        "action": "CREATE",
        "resource_type": "project",
        "status": "SUCCESS",
        "actor_email": "admin@example.com",
        "organization_id": "org-1",
        "project_id": "project-1",
        "created_from": "2026-07-01T00:00:00.000Z",
        "created_to": "2026-07-07T23:59:59.999Z",
    }


def test_audit_log_payload_normalizes_legacy_action_and_status_values() -> None:
    payload = AdminAuditService._to_audit_log_payload(
        {
            "id": "audit-legacy",
            "actor_user_id": "user-1",
            "actor_email": "admin@example.com",
            "action": "create",
            "resource_type": "project",
            "resource_id": "project-1",
            "organization_id": "",
            "project_id": "project-1",
            "method": "POST",
            "path": "/api/projects",
            "status": "success",
            "status_code": 200,
            "ip_address": "127.0.0.1",
            "user_agent": "pytest",
            "tx_id": "tx-1",
            "metadata": {},
            "create_date": "2026-07-07T10:00:00.000Z",
        }
    )

    assert payload["action"] == "CREATE"
    assert payload["status"] == "SUCCESS"
