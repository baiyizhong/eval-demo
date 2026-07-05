from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    langfuse_base_url: str = Field(default="http://localhost:3000")
    langfuse_admin_api_key: str = Field(default="")
    langfuse_database_url: str = Field(default="")
    pa_eval_default_owner_email: str = Field(default="admin@163.com")
    pa_eval_api_timeout: float = Field(default=20)
    pa_eval_cors_origins: str = Field(default="*")
    pa_eval_frontend_url: str = Field(default="http://localhost:5173")
    pa_eval_auth_cookie_name: str = Field(default="thisisjustarandomstring")
    pa_eval_auth_secret: str = Field(default="")
    github_client_id: str = Field(default="")
    github_client_secret: str = Field(default="")
    github_oauth_redirect_uri: str = Field(
        default="http://localhost:8000/api/auth/github/callback"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [
            item.strip()
            for item in self.pa_eval_cors_origins.split(",")
            if item.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
