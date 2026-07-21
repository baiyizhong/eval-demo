from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DataAccessPoolSettings(BaseSettings):
    pa_eval_postgres_pool_min_size: int = Field(default=1, ge=0)
    pa_eval_postgres_pool_max_size: int = Field(default=10, gt=0)
    pa_eval_postgres_pool_timeout_seconds: float = Field(default=10, gt=0)
    pa_eval_postgres_pool_max_idle_seconds: float = Field(default=300, gt=0)
    pa_eval_postgres_pool_max_lifetime_seconds: float = Field(default=1800, gt=0)
    pa_eval_clickhouse_http_max_connections: int = Field(default=100, gt=0)
    pa_eval_clickhouse_http_max_keepalive_connections: int = Field(
        default=20,
        ge=0,
    )
    pa_eval_clickhouse_http_keepalive_expiry_seconds: float = Field(
        default=30,
        gt=0,
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_pool_bounds(self) -> "DataAccessPoolSettings":
        if self.pa_eval_postgres_pool_max_size < self.pa_eval_postgres_pool_min_size:
            raise ValueError(
                "PostgreSQL pool max size must be greater than or equal to min size"
            )
        if (
            self.pa_eval_clickhouse_http_max_keepalive_connections
            > self.pa_eval_clickhouse_http_max_connections
        ):
            raise ValueError(
                "ClickHouse keep-alive connections cannot exceed max connections"
            )
        return self


@lru_cache
def get_data_access_pool_settings() -> DataAccessPoolSettings:
    return DataAccessPoolSettings()
