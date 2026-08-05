from functools import lru_cache
from uuid import uuid4

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    langfuse_base_url: str = Field(default="http://localhost:3000")
    langfuse_admin_api_key: str = Field(default="")
    langfuse_salt: str = Field(default="")
    langfuse_encryption_key: str = Field(default="")
    langfuse_database_url: str = Field(default="")
    langfuse_clickhouse_url: str = Field(default="http://localhost:8123")
    langfuse_clickhouse_user: str = Field(default="clickhouse")
    langfuse_clickhouse_password: str = Field(default="clickhouse")
    pa_eval_default_owner_email: str = Field(default="admin@163.com")
    pa_eval_default_owner_email_domain: str = Field(default="xxx.com")
    pa_eval_api_timeout: float = Field(default=20)
    pa_eval_cors_origins: str = Field(default="*")
    pa_eval_frontend_url: str = Field(default="http://localhost:5173")
    pa_eval_backend_url: str = Field(default="http://localhost:8000")
    pa_eval_remote_callback_secret: str = Field(default="")
    pa_eval_export_storage_dir: str = Field(default=".pa-eval/exports")
    pa_eval_auth_cookie_name: str = Field(default="thisisjustarandomstring")
    pa_eval_auth_secret: str = Field(default="")
    pa_eval_scheduler_enabled: bool = Field(default=False)
    pa_eval_scheduler_poll_interval_seconds: float = Field(default=10)
    pa_eval_scheduler_batch_size: int = Field(default=10)
    pa_eval_scheduler_lease_seconds: int = Field(default=120)
    pa_eval_scheduler_instance_id: str = Field(
        default_factory=lambda: f"pa-eval-scheduler-{uuid4().hex}"
    )
    pa_eval_trace_bulk_worker_enabled: bool = Field(default=True)
    pa_eval_trace_bulk_worker_poll_interval_seconds: float = Field(default=5)
    pa_eval_trace_bulk_worker_batch_size: int = Field(default=4)
    pa_eval_trace_bulk_worker_lease_seconds: int = Field(default=120)
    pa_eval_trace_bulk_worker_instance_id: str = Field(
        default_factory=lambda: f"pa-trace-bulk-worker-{uuid4().hex}"
    )
    pa_eval_annotation_score_concurrency: int = Field(default=8)
    pa_eval_annotation_advanced_filter_max_offset: int = Field(
        default=100_000,
        ge=0,
    )
    pa_eval_trace_count_cache_ttl_seconds: float = Field(default=30, ge=0)
    pa_eval_trace_count_cache_max_entries: int = Field(default=1024, gt=0)
    github_client_id: str = Field(default="")
    github_client_secret: str = Field(default="")
    pa_eval_log_level: str = Field(default="INFO")
    pa_eval_log_dir: str = Field(default=".pa-eval/logs")
    pa_eval_log_file_name: str = Field(default="pa-eval-backend.log")
    pa_eval_log_retention_days: int = Field(default=30, ge=1)
    pa_eval_log_json_enabled: bool = Field(default=False)
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

    @property
    def scheduler_instance_id(self) -> str:
        return self.pa_eval_scheduler_instance_id


@lru_cache
def get_settings() -> Settings:
    return Settings()
