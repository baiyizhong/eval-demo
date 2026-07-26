from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CreateOrganizationPayload(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    subsystem: str = Field(min_length=1)
    description: str | None = None
    default_owner_account: str = Field(
        alias="defaultOwnerAccount",
        min_length=1,
        max_length=64,
        pattern=r"^[a-z0-9]+$",
    )

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("default_owner_account", mode="before")
    @classmethod
    def normalize_default_owner_account(cls, value: str) -> str:
        return value.strip().lower() if isinstance(value, str) else value


class UpdateOrganizationPayload(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    subsystem: str | None = Field(default=None, min_length=1)
    description: str | None = None


class LangfuseOrganization(BaseModel):
    id: str
    name: str
    created_at: str = Field(alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    metadata: dict[str, Any] | None = None
    projects: list[dict[str, Any]] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, extra="allow")
