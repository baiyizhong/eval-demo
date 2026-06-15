from functools import lru_cache

from pydantic import AliasChoices, AnyHttpUrl, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "eval-platform-api"
    database_url: str = Field(default="postgresql+psycopg://postgres:postgres@localhost:5432/postgres")
    redis_url: str = Field(default="redis://:myredissecret@localhost:6379/0")
    langfuse_default_base_url: AnyHttpUrl = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("LANGFUSE_DEFAULT_BASE_URL", "LANGFUSE_BASE_URL"),
    )
    langfuse_public_key: str | None = None
    langfuse_secret_key: SecretStr | None = None
    web_cors_origins: tuple[str, ...] = Field(
        default=("http://localhost:5173", "http://127.0.0.1:5173")
    )
    platform_secret_key: str = Field(default="dev-platform-secret")
    key_encryption_secret: str = Field(default="00000000000000000000000000000000")


@lru_cache
def get_settings() -> Settings:
    return Settings()
