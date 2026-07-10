from typing import Any

from fastapi import APIRouter

from app.config import get_settings
from app.response import success

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/user/session")
async def get_user_session() -> dict[str, Any]:
    owner_email = get_settings().pa_eval_default_owner_email
    return success(
        {
            "user": {
                "id": 1,
                "name": owner_email,
                "email": owner_email,
            },
            "superAdmin": True,
            "permissions": [],
            "orgs": [],
        }
    )


@router.get("/sidebar")
async def get_sidebar() -> dict[str, Any]:
    owner_email = get_settings().pa_eval_default_owner_email
    return success(
        {
            "user": {
                "name": owner_email,
                "email": owner_email,
                "avatar": "/avatars/shadcn.jpg",
            },
            "teams": [
                {
                    "name": "PA Eval",
                    "logo": "Command",
                    "plan": "Langfuse",
                }
            ],
            "menuGroups": [
                {
                    "title": "工作台",
                    "items": [
                        {
                            "title": "项目管理",
                            "url": "/apps",
                            "activeMatch": "prefix",
                            "icon": "Boxes",
                        },
                        {
                            "title": "组织管理",
                            "url": "/settings/info",
                            "activeMatch": "prefix",
                            "icon": "Building2",
                        },
                    ],
                }
            ],
        }
    )
