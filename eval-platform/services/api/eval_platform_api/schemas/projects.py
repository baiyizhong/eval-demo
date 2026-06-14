from pydantic import AnyHttpUrl, BaseModel, SecretStr


class ProjectConnectionTestRequest(BaseModel):
    langfuse_base_url: AnyHttpUrl
    langfuse_public_key: str
    langfuse_secret_key: SecretStr


class ProjectConnectionTestResponse(BaseModel):
    ok: bool
    base_url: str
