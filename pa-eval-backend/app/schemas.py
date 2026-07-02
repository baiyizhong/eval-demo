from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CreateOrganizationPayload(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    subsystem: str = Field(min_length=1)
    description: str | None = None


class UpdateOrganizationPayload(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    subsystem: str | None = Field(default=None, min_length=1)
    description: str | None = None


class CreateOrganizationApiKeyPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class LangfuseOrganization(BaseModel):
    id: str
    name: str
    created_at: str = Field(alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    metadata: dict[str, Any] | None = None
    projects: list[dict[str, Any]] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, extra="allow")


class LangfuseApiKey(BaseModel):
    id: str
    created_at: str = Field(alias="createdAt")
    last_used_at: str | None = Field(default=None, alias="lastUsedAt")
    note: str | None = None
    public_key: str | None = Field(default=None, alias="publicKey")
    display_secret_key: str | None = Field(default=None, alias="displaySecretKey")
    secret_key: str | None = Field(default=None, alias="secretKey")

    model_config = ConfigDict(populate_by_name=True, extra="allow")

