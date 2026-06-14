from pydantic import AnyHttpUrl, BaseModel


class ProjectConnectionTestRequest(BaseModel):
    langfuse_base_url: AnyHttpUrl
    langfuse_public_key: str
    langfuse_secret_key: str


class ProjectConnectionTestResponse(BaseModel):
    ok: bool
    base_url: str
