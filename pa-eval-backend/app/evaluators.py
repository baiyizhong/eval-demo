from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.auth_context import CurrentUserContext, get_current_user_context
from app.errors import BusinessError
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success

router = APIRouter(prefix="/api/evaluators", tags=["evaluators"])

EvaluatorType = Literal["LLM_AS_JUDGE", "CODE", "WORKFLOW", "SDK"]
EvaluatorProvider = Literal["LANGFUSE", "DIFY", "HIAGENT", "N8N", "OPENJUDGE"]


class ModelConfigPayload(BaseModel):
    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)


class CreateEvaluatorPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: EvaluatorType
    provider: EvaluatorProvider
    project_id: str = Field(alias="projectId", min_length=1)
    description: str = Field(default="", max_length=1000)
    variables: list[str] = Field(default_factory=list)
    prompt: str | None = None
    model_config_payload: ModelConfigPayload | None = Field(
        default=None,
        alias="modelConfig",
    )
    output_definition: dict[str, Any] | None = Field(
        default=None,
        alias="outputDefinition",
    )
    source_code: str | None = Field(default=None, alias="sourceCode")
    source_code_language: Literal["PYTHON", "TYPESCRIPT"] | None = Field(
        default=None,
        alias="sourceCodeLanguage",
    )
    endpoint_url: str | None = Field(default=None, alias="endpointUrl")
    auth_type: Literal["NONE", "BEARER", "BASIC", "API_KEY"] | None = Field(
        default=None,
        alias="authType",
    )
    auth_token: str | None = Field(default=None, alias="authToken")
    input_mapping: dict[str, Any] | None = Field(default=None, alias="inputMapping")
    output_mapping: dict[str, Any] | None = Field(default=None, alias="outputMapping")
    sdk_package: str | None = Field(default=None, alias="sdkPackage")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_by_type(self) -> "CreateEvaluatorPayload":
        if self.type in {"LLM_AS_JUDGE", "CODE"} and self.provider != "LANGFUSE":
            raise ValueError("Langfuse 原生评估器 provider 必须为 LANGFUSE")

        if self.type == "LLM_AS_JUDGE":
            if not self.prompt:
                raise ValueError("LLM-as-Judge 评估器必须填写 prompt")
            if self.model_config_payload is None:
                raise ValueError("LLM-as-Judge 评估器必须填写模型配置")

        if self.type == "CODE":
            if not self.source_code:
                raise ValueError("Code 评估器必须填写源码")
            if not self.source_code_language:
                raise ValueError("Code 评估器必须选择源码语言")

        if self.type == "WORKFLOW":
            if self.provider not in {"DIFY", "HIAGENT", "N8N"}:
                raise ValueError("工作流评估器 provider 必须为 DIFY、HIAGENT 或 N8N")
            if not self.endpoint_url:
                raise ValueError("工作流评估器必须填写工作流地址")

        if self.type == "SDK":
            if self.provider != "OPENJUDGE":
                raise ValueError("SDK 评估器 provider 必须为 OPENJUDGE")
            if not self.sdk_package:
                raise ValueError("OpenJudge 评估器必须填写 SDK 标识")

        return self

    def to_storage_payload(self) -> dict[str, Any]:
        base = {
            "name": self.name,
            "type": self.type,
            "provider": self.provider,
            "project_id": self.project_id,
            "description": self.description,
            "variables": self.variables,
        }

        if self.type in {"LLM_AS_JUDGE", "CODE"}:
            model_config = (
                self.model_config_payload.model_dump()
                if self.model_config_payload
                else None
            )
            storage = {
                **base,
                "prompt": self.prompt,
                "model_config": model_config,
                "output_definition": self.output_definition,
            }
            if self.type == "CODE":
                storage.update(
                    {
                        "source_code": self.source_code,
                        "source_code_language": self.source_code_language,
                    }
                )
            return storage

        if self.type == "WORKFLOW":
            return {
                **base,
                "config": {
                    "endpointUrl": self.endpoint_url,
                    "authType": self.auth_type or "NONE",
                    "authToken": self.auth_token,
                    "inputMapping": self.input_mapping or {},
                    "outputMapping": self.output_mapping or {},
                },
            }

        return {
            **base,
            "config": {
                "sdkPackage": self.sdk_package,
                "inputMapping": self.input_mapping or {},
                "outputMapping": self.output_mapping or {},
            },
        }


def _paginate(items: list[dict[str, Any]], page: int, page_size: int) -> dict[str, Any]:
    start = (page - 1) * page_size
    return {"total": len(items), "datas": items[start : start + page_size]}


def _matches_keyword(item: dict[str, Any], keyword: str | None) -> bool:
    if not keyword:
        return True

    needle = keyword.lower()
    fields = [
        item.get("name"),
        item.get("type"),
        item.get("provider"),
        item.get("version"),
        item.get("description"),
        item.get("projectName"),
    ]
    return any(isinstance(field, str) and needle in field.lower() for field in fields)


@router.get("")
async def list_evaluators(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    evaluator_type: str | None = Query(
        default=None,
        alias="type",
        pattern="^(LLM_AS_JUDGE|CODE|WORKFLOW|SDK)$",
    ),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    evaluators = await reader.list_evaluators_for_user(current_user.user_id)
    filtered = [item for item in evaluators if _matches_keyword(item, keyword)]

    if evaluator_type:
        filtered = [item for item in filtered if item["type"] == evaluator_type]

    return success(_paginate(filtered, page, page_size))


@router.post("")
async def create_evaluator(
    payload: CreateEvaluatorPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    storage_payload = payload.to_storage_payload()

    if payload.type in {"LLM_AS_JUDGE", "CODE"}:
        evaluator = await reader.create_langfuse_evaluator(
            storage_payload,
            current_user.user_id,
            current_user.email,
        )
    else:
        evaluator = await reader.create_pa_evaluator(
            storage_payload,
            current_user.user_id,
            current_user.email,
        )

    return success(evaluator)


@router.get("/{evaluator_id}")
async def get_evaluator(
    evaluator_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    evaluator = await reader.get_evaluator_for_user(
        evaluator_id,
        current_user.user_id,
    )
    return success(evaluator)


@router.delete("/{evaluator_id}")
async def delete_evaluator(
    evaluator_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    evaluator = await reader.get_evaluator_for_user(
        evaluator_id,
        current_user.user_id,
    )
    if evaluator["provider"] == "LANGFUSE":
        raise BusinessError(
            4018,
            "Langfuse 原生评估器由 Langfuse 管理，请在 Langfuse 中删除",
            409,
        )

    await reader.delete_pa_evaluator_for_user(evaluator_id, current_user.user_id)
    return success({"id": evaluator_id})
