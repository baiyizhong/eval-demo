from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.data_access.config import DataAccessPoolSettings


_pool: AsyncConnectionPool[Any] | None = None
_pool_database_url = ""
_pool_timeout_seconds = 10.0


async def start_postgres_pool(
    database_url: str,
    settings: DataAccessPoolSettings,
) -> None:
    global _pool, _pool_database_url, _pool_timeout_seconds

    if not database_url:
        return
    if _pool is not None and _pool_database_url == database_url:
        return
    if _pool is not None:
        await close_postgres_pool()

    pool = AsyncConnectionPool(
        conninfo=database_url,
        min_size=settings.pa_eval_postgres_pool_min_size,
        max_size=settings.pa_eval_postgres_pool_max_size,
        timeout=settings.pa_eval_postgres_pool_timeout_seconds,
        max_idle=settings.pa_eval_postgres_pool_max_idle_seconds,
        max_lifetime=settings.pa_eval_postgres_pool_max_lifetime_seconds,
        kwargs={"row_factory": dict_row},
        open=False,
    )
    try:
        await pool.open(wait=True)
    except Exception:
        await pool.close()
        raise

    _pool = pool
    _pool_database_url = database_url
    _pool_timeout_seconds = settings.pa_eval_postgres_pool_timeout_seconds


async def close_postgres_pool() -> None:
    global _pool, _pool_database_url

    pool = _pool
    _pool = None
    _pool_database_url = ""
    if pool is not None:
        await pool.close()


async def connect_postgres(
    database_url: str,
    *,
    row_factory: Any = dict_row,
) -> Any:
    if (
        _pool is not None
        and _pool_database_url == database_url
        and row_factory is dict_row
    ):
        return _pool.connection(timeout=_pool_timeout_seconds)
    return await psycopg.AsyncConnection.connect(
        database_url,
        row_factory=row_factory,
    )
