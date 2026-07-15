from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.errors import BusinessError
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success
from app.schemas import (
    CreateOrganizationPayload,
    LangfuseOrganization,
    UpdateOrganizationPayload,
)

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


class OrganizationMemberPayload(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str | None = Field(default=None, max_length=120)
    role: str = Field(pattern="^(OWNER|ADMIN|MEMBER|VIEWER|NONE)$")


class UpdateOrganizationMemberPayload(BaseModel):
    role: str = Field(pattern="^(OWNER|ADMIN|MEMBER|VIEWER|NONE)$")


class ImportOrganizationMembersPayload(BaseModel):
    members: list[OrganizationMemberPayload] = Field(default_factory=list)


def _metadata(value: dict[str, Any] | None) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _pa_eval_metadata(value: dict[str, Any] | None) -> dict[str, Any]:
    metadata = _metadata(value)
    pa_eval = metadata.get("paEval")
    return pa_eval if isinstance(pa_eval, dict) else {}


def _to_pa_organization(raw: dict[str, Any]) -> dict[str, Any]:
    organization = LangfuseOrganization.model_validate(raw)
    pa_eval = _pa_eval_metadata(organization.metadata)
    created_at = organization.created_at
    project_count = raw.get("projectCount")

    return {
        "id": organization.id,
        "name": organization.name,
        "description": pa_eval.get("description"),
        "subsystem": pa_eval.get("subsystem"),
        "createdBy": pa_eval.get("createdBy"),
        "createdAt": created_at,
        "updatedAt": organization.updated_at or created_at,
        "projectCount": project_count if project_count is not None else len(organization.projects),
    }


def _paginate(items: list[dict[str, Any]], page: int, page_size: int) -> dict[str, Any]:
    start = (page - 1) * page_size
    return {"total": len(items), "datas": items[start : start + page_size]}


def _matches_keyword(item: dict[str, Any], keyword: str | None) -> bool:
    if not keyword:
        return True
    needle = keyword.lower()
    fields = [item.get("name"), item.get("description"), item.get("subsystem")]
    return any(isinstance(field, str) and needle in field.lower() for field in fields)


def _matches_member_keyword(item: dict[str, Any], keyword: str | None) -> bool:
    if not keyword:
        return True

    needle = keyword.lower()
    fields = [item.get("name"), item.get("email"), item.get("role"), item.get("status")]
    return any(isinstance(field, str) and needle in field.lower() for field in fields)


def _normalize_role_filter(role: str | list[str] | None) -> set[str]:
    if role is None:
        return set()

    if isinstance(role, list):
        return {item for item in role if item}

    return {item for item in role.split(",") if item}


def _merge_pa_eval_metadata(
    metadata: dict[str, Any] | None,
    values: dict[str, Any],
) -> dict[str, Any]:
    merged = dict(_metadata(metadata))
    pa_eval = dict(_pa_eval_metadata(metadata))
    pa_eval.update({key: value for key, value in values.items() if value is not None})
    merged["paEval"] = pa_eval
    return merged


def _default_owner_email(account: str, settings: Settings) -> str:
    domain = settings.pa_eval_default_owner_email_domain.strip().lower()
    return f"{account}@{domain}"


@router.get("")
async def list_organizations(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    rows = await reader.list_organizations_for_user(current_user.user_id)
    organizations = [_to_pa_organization(raw) for raw in rows]
    filtered = [item for item in organizations if _matches_keyword(item, keyword)]
    return success(_paginate(filtered, page, page_size))


@router.get("/member-email-settings")
async def get_member_email_settings(
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    domain = settings.pa_eval_default_owner_email_domain.strip().lower()
    return success({"defaultEmailDomain": domain.removeprefix("@")})


@router.post("")
async def create_organization(
    payload: CreateOrganizationPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    owner_account = payload.default_owner_account
    owner_email = _default_owner_email(owner_account, settings)
    create_payload = {
        "name": payload.name,
        "default_project_name": f"{payload.name} 默认项目",
        "metadata": _merge_pa_eval_metadata(
            None,
            {
                "description": payload.description,
                "subsystem": payload.subsystem,
                "createdBy": current_user.email,
            },
        ),
    }
    created = await reader.create_organization_with_default_project(
        create_payload,
        owner_account,
        owner_email,
    )
    return success(_to_pa_organization(created))


@router.get("/{organization_id}")
async def get_organization(
    organization_id: str,
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    organization = await reader.get_organization(organization_id)
    if organization is None:
        raise BusinessError(code=1004, message="组织不存在", status_code=404)
    return success(_to_pa_organization(organization))


@router.patch("/{organization_id}")
async def update_organization(
    organization_id: str,
    payload: UpdateOrganizationPayload,
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    current = await reader.get_organization(organization_id)
    if current is None:
        raise BusinessError(code=1004, message="组织不存在", status_code=404)

    current_org = LangfuseOrganization.model_validate(current)
    next_metadata = _merge_pa_eval_metadata(
        current_org.metadata,
        {
            "description": payload.description,
            "subsystem": payload.subsystem,
        },
    )
    updated = await reader.update_organization(
        organization_id,
        {
            "name": payload.name or current_org.name,
            "metadata": next_metadata,
        },
    )
    return success(_to_pa_organization(updated))


@router.get("/{organization_id}/members")
async def list_organization_members(
    organization_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=10000, alias="pageSize"),
    keyword: str | None = Query(default=None),
    role: str | list[str] | None = Query(default=None),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    members = await reader.list_organization_members(organization_id)
    role_filter = _normalize_role_filter(role)

    filtered = [
        item
        for item in members
        if _matches_member_keyword(item, keyword)
        and (not role_filter or item["role"] in role_filter)
    ]

    return success(_paginate(filtered, page, page_size))


@router.post("/{organization_id}/members")
async def create_organization_member(
    organization_id: str,
    payload: OrganizationMemberPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    member = await reader.create_organization_member(
        organization_id,
        current_user.user_id,
        payload.model_dump(),
    )
    return success(member)


@router.post("/{organization_id}/members/import")
async def import_organization_members(
    organization_id: str,
    payload: ImportOrganizationMembersPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    members: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for index, member_payload in enumerate(payload.members, start=1):
        member_data = member_payload.model_dump()
        try:
            members.append(
                await reader.create_organization_member(
                    organization_id,
                    current_user.user_id,
                    member_data,
                )
            )
        except BusinessError as exc:
            failures.append(
                {
                    "row": index,
                    "email": member_data["email"],
                    "reason": exc.message,
                }
            )
    return success({"total": len(members), "datas": members, "failures": failures})


@router.patch("/{organization_id}/members/{member_id}")
async def update_organization_member(
    organization_id: str,
    member_id: str,
    payload: UpdateOrganizationMemberPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    member = await reader.update_organization_member(
        organization_id,
        member_id,
        current_user.user_id,
        payload.model_dump(),
    )
    return success(member)


@router.delete("/{organization_id}/members/{member_id}")
async def delete_organization_member(
    organization_id: str,
    member_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    deleted = await reader.delete_organization_member(
        organization_id,
        member_id,
        current_user.user_id,
    )
    return success(deleted)
