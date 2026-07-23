from functools import lru_cache
import json
from uuid import uuid4

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    langfuse_base_url: str = Field(default="http://localhost:3000")
    langfuse_admin_api_key: str = Field(default="")
    langfuse_salt: str = Field(default="")
    encryption_key: str = Field(default="")
    langfuse_encryption_key: str = Field(default="")
    admin_api_key: str = Field(default="")
    langfuse_database_url: str = Field(default="")
    langfuse_clickhouse_url: str = Field(default="http://localhost:8123")
    langfuse_clickhouse_user: str = Field(default="clickhouse")
    langfuse_clickhouse_password: str = Field(default="clickhouse")
    pa_eval_default_owner_email: str = Field(default="admin@163.com")
    pa_eval_default_owner_email_domain: str = Field(default="xxx.com")
    pa_eval_api_timeout: float = Field(default=20)
    pa_eval_cors_origins: str = Field(default="*")
    pa_eval_frontend_url: str = Field(default="http://localhost:5173")
    pa_eval_export_storage_dir: str = Field(default=".pa-eval/exports")
    pa_eval_auth_cookie_name: str = Field(default="thisisjustarandomstring")
    pa_eval_auth_secret: str = Field(default="")
    pa_eval_super_admin_emails: str = Field(default="")
    pa_eval_scheduler_enabled: bool = Field(default=False)
    pa_eval_scheduler_poll_interval_seconds: float = Field(default=10)
    pa_eval_scheduler_batch_size: int = Field(default=10)
    pa_eval_scheduler_lease_seconds: int = Field(default=120)
    pa_eval_openjudge_max_concurrency: int = Field(default=32)
    pa_eval_scheduler_instance_id: str = Field(
        default_factory=lambda: f"pa-eval-scheduler-{uuid4().hex}"
    )
    github_client_id: str = Field(default="")
    github_client_secret: str = Field(default="")
    github_oauth_redirect_uri: str = Field(
        default="http://localhost:8000/api/auth/github/callback"
    )
    pa_eval_auth_providers: str = Field(default="github")
    pa_eval_enterprise_auth_url: str = Field(default="")
    pa_eval_enterprise_auth_method: str = Field(default="POST")
    pa_eval_enterprise_auth_headers_json: str = Field(default="{}")
    pa_eval_enterprise_auth_username_field: str = Field(default="username")
    pa_eval_enterprise_auth_password_field: str = Field(default="password")
    pa_eval_enterprise_auth_email_json_path: str = Field(default="data.email")
    pa_eval_enterprise_auth_name_json_path: str = Field(default="data.name")
    pa_eval_enterprise_auth_user_id_json_path: str = Field(default="data.userId")
    pa_eval_enterprise_auth_login_json_path: str = Field(default="data.username")
    pa_eval_oidc_client_id: str = Field(default="")
    pa_eval_oidc_client_secret: str = Field(default="")
    pa_eval_oidc_authorize_url: str = Field(default="")
    pa_eval_oidc_token_url: str = Field(default="")
    pa_eval_oidc_userinfo_url: str = Field(default="")
    pa_eval_oidc_redirect_uri: str = Field(
        default="http://localhost:8000/api/auth/oidc/callback"
    )
    pa_eval_oidc_scope: str = Field(default="openid email profile")

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

    @property
    def scheduler_instance_id(self) -> str:
        return self.pa_eval_scheduler_instance_id

    @property
    def super_admin_emails(self) -> set[str]:
        return {
            item.strip().lower()
            for item in self.pa_eval_super_admin_emails.split(",")
            if item.strip()
        }

    @property
    def auth_providers(self) -> list[str]:
        return [
            item.strip()
            for item in self.pa_eval_auth_providers.split(",")
            if item.strip()
        ]

    @property
    def effective_langfuse_admin_api_key(self) -> str:
        return self.langfuse_admin_api_key or self.admin_api_key

    @property
    def effective_langfuse_encryption_key(self) -> str:
        return self.langfuse_encryption_key or self.encryption_key

    @property
    def enterprise_auth_headers(self) -> dict[str, str]:
        try:
            parsed = json.loads(self.pa_eval_enterprise_auth_headers_json or "{}")
        except json.JSONDecodeError:
            return {}

        if not isinstance(parsed, dict):
            return {}

        return {
            str(key): str(value)
            for key, value in parsed.items()
            if isinstance(key, str) and value is not None
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
