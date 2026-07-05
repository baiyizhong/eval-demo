from typing import Any

from fastapi import APIRouter, Depends, Query

from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _paginate(items: list[dict[str, Any]], page: int, page_size: int) -> dict[str, Any]:
    start = (page - 1) * page_size
    return {"total": len(items), "datas": items[start : start + page_size]}


def _matches_keyword(item: dict[str, Any], keyword: str | None) -> bool:
    if not keyword:
        return True

    needle = keyword.lower()
    fields = [
        item.get("name"),
        item.get("description"),
        item.get("organizationName"),
    ]
    return any(isinstance(field, str) and needle in field.lower() for field in fields)


@router.get("")
async def list_projects(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    status: str | None = Query(default=None, pattern="^(active|archived)$"),
    organization_id: str | None = Query(default=None, alias="organizationId"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    projects = await reader.list_projects_for_user(current_user.user_id)
    filtered = [item for item in projects if _matches_keyword(item, keyword)]

    if organization_id:
        filtered = [
            item for item in filtered if item["organizationId"] == organization_id
        ]

    if status:
        filtered = [item for item in filtered if item["status"] == status]

    return success(_paginate(filtered, page, page_size))
