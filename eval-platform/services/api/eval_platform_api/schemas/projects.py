from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, SecretStr


class ProjectListItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    status: Literal["active", "archived"] = "active"
    trace_count: int = 0
    created_at: str | None = None
    last_active_at: str | None = None
    langfuse_base_url: AnyHttpUrl
    organization_name: str | None = None


class ProjectConnectionTestRequest(BaseModel):
    langfuse_base_url: AnyHttpUrl
    langfuse_public_key: str
    langfuse_secret_key: SecretStr


class ProjectConnectionTestResponse(BaseModel):
    ok: bool
    base_url: str
