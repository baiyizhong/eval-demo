import httpx

from app.config import Settings
from app.data_access.config import (
    DataAccessPoolSettings,
    get_data_access_pool_settings,
)


_client: httpx.AsyncClient | None = None


def start_clickhouse_http_client(
    settings: Settings,
    pool_settings: DataAccessPoolSettings,
) -> None:
    global _client

    if _client is None or _client.is_closed:
        _client = create_clickhouse_http_client(settings, pool_settings)


def get_clickhouse_http_client() -> httpx.AsyncClient | None:
    if _client is None or _client.is_closed:
        return None
    return _client


def create_clickhouse_http_client(
    settings: Settings,
    pool_settings: DataAccessPoolSettings | None = None,
) -> httpx.AsyncClient:
    resolved_pool_settings = pool_settings or get_data_access_pool_settings()
    return httpx.AsyncClient(
        timeout=settings.pa_eval_api_timeout,
        trust_env=False,
        limits=httpx.Limits(
            max_connections=(
                resolved_pool_settings.pa_eval_clickhouse_http_max_connections
            ),
            max_keepalive_connections=(
                resolved_pool_settings.pa_eval_clickhouse_http_max_keepalive_connections
            ),
            keepalive_expiry=(
                resolved_pool_settings.pa_eval_clickhouse_http_keepalive_expiry_seconds
            ),
        ),
    )


async def close_clickhouse_http_client() -> None:
    global _client

    client = _client
    _client = None
    if client is not None and not client.is_closed:
        await client.aclose()
