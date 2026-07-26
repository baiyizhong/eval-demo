from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Query,
    UploadFile,
)

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.errors import BusinessError
from app.response import success
from app.skill_store import SkillStore

router = APIRouter(prefix="/api/projects/{project_id}/skills", tags=["skills"])


async def _ensure_project_access(
    settings: Settings,
    project_id: str,
    current_user: CurrentUserContext,
) -> None:
    from app.langfuse_db import LangfuseDatabaseReader

    reader = LangfuseDatabaseReader(settings)
    await reader.ensure_project_visible(project_id, current_user.user_id)


def get_skill_store(settings: Settings = Depends(get_settings)) -> SkillStore:
    return SkillStore(
        skill_root=settings.pa_eval_skill_root,
        builtin_dir=settings.pa_eval_skill_builtin_dir or None,
    )


@router.get("")
async def list_skills(
    project_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
    skill_store: SkillStore = Depends(get_skill_store),
) -> dict[str, Any]:
    await _ensure_project_access(settings, project_id, current_user)
    skills = skill_store.list_skills(project_id)
    return success({"total": len(skills), "datas": skills})


@router.get("/{skill_name}")
async def get_skill(
    project_id: str,
    skill_name: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
    skill_store: SkillStore = Depends(get_skill_store),
) -> dict[str, Any]:
    await _ensure_project_access(settings, project_id, current_user)
    detail = skill_store.get_skill_detail(project_id, skill_name)
    return success(detail)


@router.post("")
async def upload_skill(
    project_id: str,
    name: str = Form(...),
    overwrite: bool = Form(default=False),
    file: UploadFile = File(...),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
    skill_store: SkillStore = Depends(get_skill_store),
) -> dict[str, Any]:
    await _ensure_project_access(settings, project_id, current_user)
    if not file.filename:
        raise BusinessError(4001, "缺少文件名")
    file_bytes = await file.read()
    if not file_bytes:
        raise BusinessError(4001, "上传文件为空")
    result = skill_store.upload_skill(
        project_id=project_id,
        name=name,
        file_bytes=file_bytes,
        filename=file.filename,
        overwrite=overwrite,
    )
    return success(result)


@router.delete("/{skill_name}")
async def delete_skill(
    project_id: str,
    skill_name: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
    skill_store: SkillStore = Depends(get_skill_store),
) -> dict[str, Any]:
    await _ensure_project_access(settings, project_id, current_user)
    skill_store.delete_skill(project_id, skill_name)
    return success({"name": skill_name})
