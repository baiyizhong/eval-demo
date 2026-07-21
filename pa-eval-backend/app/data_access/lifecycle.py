from app.config import Settings
from app.data_access.clickhouse import (
    close_clickhouse_http_client,
    start_clickhouse_http_client,
)
from app.data_access.config import DataAccessPoolSettings
from app.data_access.postgres import close_postgres_pool, start_postgres_pool


async def start_data_access_resources(
    settings: Settings,
    pool_settings: DataAccessPoolSettings,
) -> None:
    await start_postgres_pool(settings.langfuse_database_url, pool_settings)
    try:
        start_clickhouse_http_client(settings, pool_settings)
    except Exception:
        await close_postgres_pool()
        raise


async def close_data_access_resources() -> None:
    try:
        await close_clickhouse_http_client()
    finally:
        await close_postgres_pool()
