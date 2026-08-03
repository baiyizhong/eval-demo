from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator

from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    retention_days: int | None = Field(default=None, ge=1, le=30, alias="retentionDays")


class CreateProjectPayload(ProjectPayload):
    organization_id: str = Field(alias="organizationId", min_length=1)


class ProjectApiKeyPayload(BaseModel):
    note: str = Field(default="", max_length=200)


class ProjectMemberPayload(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: str = Field(pattern="^(OWNER|ADMIN|MEMBER|VIEWER)$")


class UpdateProjectMemberPayload(BaseModel):
    role: str = Field(pattern="^(OWNER|ADMIN|MEMBER|VIEWER|NONE)$")


class DefaultModelPayload(BaseModel):
    llm_connection_id: str = Field(alias="llmConnectionId", min_length=1)
    model: str = Field(min_length=1, max_length=120)
    temperature: str = Field(default="0.2", max_length=20)


class LlmConnectionPayload(BaseModel):
    provider: str = Field(min_length=1, max_length=120)
    adapter: str = Field(
        pattern=(
            "^(anthropic|openai|openai-compatible|azure|bedrock|"
            "google-vertex-ai|google-ai-studio)$"
        )
    )
    secret_key: str | None = Field(default=None, alias="secretKey", max_length=4000)
    base_url: str = Field(default="", alias="baseUrl", max_length=1000)
    custom_models: list[str] = Field(default_factory=list, alias="customModels")
    with_default_models: bool = Field(default=True, alias="withDefaultModels")


class ModelDefinitionPayload(BaseModel):
    model_name: str = Field(alias="modelName", min_length=1, max_length=120)
    match_pattern: str = Field(default="", alias="matchPattern", max_length=200)
    unit: str = Field(default="TOKENS", max_length=60)
    input_price: str = Field(default="", alias="inputPrice", max_length=60)
    output_price: str = Field(default="", alias="outputPrice", max_length=60)
    tokenizer_id: str = Field(default="", alias="tokenizerId", max_length=120)

    @field_validator("input_price", "output_price")
    @classmethod
    def validate_price(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            return ""
        try:
            price = Decimal(normalized)
        except InvalidOperation as exc:
            raise ValueError("价格必须是非负数字") from exc
        if not price.is_finite() or price < 0:
            raise ValueError("价格必须是非负数字")
        return normalized


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


def _project_payload(payload: ProjectPayload) -> dict[str, Any]:
    data: dict[str, Any] = {
        "name": payload.name.strip(),
        "description": (payload.description or "").strip(),
    }
    if payload.retention_days is not None:
        data["retentionDays"] = payload.retention_days
    return data


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
    if await reader.is_super_admin(current_user.user_id):
        projects = await reader.list_projects()
    else:
        projects = await reader.list_projects_for_user(current_user.user_id)
    filtered = [item for item in projects if _matches_keyword(item, keyword)]

    if organization_id:
        filtered = [
            item for item in filtered if item["organizationId"] == organization_id
        ]

    if status:
        filtered = [item for item in filtered if item["status"] == status]

    return success(_paginate(filtered, page, page_size))


@router.post("")
async def create_project(
    payload: CreateProjectPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    project = await reader.create_project_for_user(
        organization_id=payload.organization_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
        payload=_project_payload(payload),
    )
    return success(project)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    payload: ProjectPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    project = await reader.update_project_for_user(
        project_id=project_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
        payload=_project_payload(payload),
    )
    return success(project)


@router.post("/{project_id}/archive")
async def archive_project(
    project_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    project = await reader.archive_project_for_user(
        project_id=project_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
    )
    return success(project)


@router.post("/{project_id}/restore")
async def restore_project(
    project_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    project = await reader.restore_project_for_user(
        project_id=project_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
    )
    return success(project)


@router.get("/{project_id}/settings/models")
async def get_project_model_settings(
    project_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    settings = await reader.get_project_model_settings_for_user(
        project_id,
        current_user.user_id,
    )
    return success(settings)


@router.get("/{project_id}/settings/members")
async def get_project_members(
    project_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    members = await reader.list_project_users_for_user(
        project_id,
        current_user.user_id,
    )
    return success(members)


@router.post("/{project_id}/settings/members")
async def create_project_member(
    project_id: str,
    payload: ProjectMemberPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    member = await reader.create_project_member_for_user(
        project_id,
        current_user.user_id,
        payload.model_dump(),
    )
    return success(member)


@router.patch("/{project_id}/settings/members/{member_id}")
async def update_project_member(
    project_id: str,
    member_id: str,
    payload: UpdateProjectMemberPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    member = await reader.update_project_member_for_user(
        project_id,
        member_id,
        current_user.user_id,
        payload.model_dump(),
    )
    return success(member)


@router.delete("/{project_id}/settings/members/{member_id}")
async def delete_project_member(
    project_id: str,
    member_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    deleted = await reader.delete_project_member_for_user(
        project_id, member_id, current_user.user_id
    )
    return success(deleted)


@router.patch("/{project_id}/settings/models/default")
async def update_project_default_model(
    project_id: str,
    payload: DefaultModelPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    default_model = await reader.update_project_default_model_for_user(
        project_id=project_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
        payload={
            "llmConnectionId": payload.llm_connection_id,
            "model": payload.model,
            "temperature": payload.temperature,
        },
    )
    return success(default_model)


@router.post("/{project_id}/settings/models/llm-connections")
async def create_project_llm_connection(
    project_id: str,
    payload: LlmConnectionPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    connection = await reader.create_project_llm_connection_for_user(
        project_id=project_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
        payload={
            "provider": payload.provider,
            "adapter": payload.adapter,
            "secretKey": payload.secret_key,
            "baseUrl": payload.base_url,
            "customModels": payload.custom_models,
            "withDefaultModels": payload.with_default_models,
        },
    )
    return success(connection)


@router.patch("/{project_id}/settings/models/llm-connections/{connection_id}")
async def update_project_llm_connection(
    project_id: str,
    connection_id: str,
    payload: LlmConnectionPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    connection = await reader.update_project_llm_connection_for_user(
        project_id=project_id,
        connection_id=connection_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
        payload={
            "provider": payload.provider,
            "adapter": payload.adapter,
            "secretKey": payload.secret_key,
            "baseUrl": payload.base_url,
            "customModels": payload.custom_models,
            "withDefaultModels": payload.with_default_models,
        },
    )
    return success(connection)


@router.delete("/{project_id}/settings/models/llm-connections/{connection_id}")
async def delete_project_llm_connection(
    project_id: str,
    connection_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    deleted = await reader.delete_project_llm_connection_for_user(
        project_id=project_id,
        connection_id=connection_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
    )
    return success(deleted)


@router.post("/{project_id}/settings/models/definitions")
async def create_project_model_definition(
    project_id: str,
    payload: ModelDefinitionPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    model_definition = await reader.create_project_model_definition_for_user(
        project_id=project_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
        payload={
            "modelName": payload.model_name,
            "matchPattern": payload.match_pattern,
            "unit": payload.unit,
            "inputPrice": payload.input_price,
            "outputPrice": payload.output_price,
            "tokenizerId": payload.tokenizer_id,
        },
    )
    return success(model_definition)


@router.patch("/{project_id}/settings/models/definitions/{model_id}")
async def update_project_model_definition(
    project_id: str,
    model_id: str,
    payload: ModelDefinitionPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    model_definition = await reader.update_project_model_definition_for_user(
        project_id=project_id,
        model_id=model_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
        payload={
            "modelName": payload.model_name,
            "matchPattern": payload.match_pattern,
            "unit": payload.unit,
            "inputPrice": payload.input_price,
            "outputPrice": payload.output_price,
            "tokenizerId": payload.tokenizer_id,
        },
    )
    return success(model_definition)


@router.delete("/{project_id}/settings/models/definitions/{model_id}")
async def delete_project_model_definition(
    project_id: str,
    model_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    deleted = await reader.delete_project_model_definition_for_user(
        project_id=project_id,
        model_id=model_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
    )
    return success(deleted)


@router.get("/{project_id}/settings/api-keys")
async def list_project_api_keys(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    api_keys = await reader.list_project_api_keys(
        project_id=project_id,
        user_id=current_user.user_id,
    )
    return success(_paginate(api_keys, page, page_size))


@router.post("/{project_id}/settings/api-keys")
async def create_project_api_key(
    project_id: str,
    payload: ProjectApiKeyPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    note = payload.note.strip() or "未命名 Key"
    api_key = await reader.create_project_api_key(
        project_id=project_id,
        note=note,
        user_email=current_user.email,
        user_id=current_user.user_id,
    )
    return success(api_key)


@router.patch("/{project_id}/settings/api-keys/{key_id}")
async def update_project_api_key(
    project_id: str,
    key_id: str,
    payload: ProjectApiKeyPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    api_key = await reader.update_project_api_key(
        project_id=project_id,
        key_id=key_id,
        note=payload.note.strip() or "未命名 Key",
        user_email=current_user.email,
        user_id=current_user.user_id,
    )
    return success(api_key)


@router.delete("/{project_id}/settings/api-keys/{key_id}")
async def delete_project_api_key(
    project_id: str,
    key_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    deleted = await reader.delete_project_api_key(
        project_id=project_id,
        key_id=key_id,
        user_id=current_user.user_id,
    )
    return success(deleted)
