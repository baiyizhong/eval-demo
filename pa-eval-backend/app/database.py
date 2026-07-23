import logging
import psycopg
import psycopg_pool
import httpx
from psycopg.rows import dict_row
from app.config import Settings

logger = logging.getLogger(__name__)

_pool: psycopg_pool.AsyncConnectionPool | None = None
_http_client: httpx.AsyncClient | None = None

def init_db_pool(settings: Settings) -> None:
    global _pool
    if _pool is not None:
        return
    if not settings.langfuse_database_url:
        logger.warning("LANGFUSE_DATABASE_URL is not set, database pool initialization skipped.")
        return
    logger.info("Initializing database connection pool...")
    _pool = psycopg_pool.AsyncConnectionPool(
        conninfo=settings.langfuse_database_url,
        open=True,
        kwargs={"row_factory": dict_row},
    )

async def close_db_pool() -> None:
    global _pool
    if _pool is not None:
        logger.info("Closing database connection pool...")
        await _pool.close()
        _pool = None

def get_db_pool() -> psycopg_pool.AsyncConnectionPool | None:
    return _pool

def init_http_client() -> None:
    global _http_client
    if _http_client is None:
        logger.info("Initializing shared HTTP client...")
        _http_client = httpx.AsyncClient(trust_env=False)

async def close_http_client() -> None:
    global _http_client
    if _http_client is not None:
        logger.info("Closing shared HTTP client...")
        await _http_client.aclose()
        _http_client = None

def get_http_client() -> httpx.AsyncClient:
    if _http_client is None:
        init_http_client()
    return _http_client

class PooledConnectionWrapper:
    def __init__(self, pool_context_manager, connection):
        self.pool_context_manager = pool_context_manager
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.pool_context_manager:
            await self.pool_context_manager.__aexit__(exc_type, exc_val, exc_tb)

async def get_db_connection(settings: Settings):
    global _pool
    if _pool is not None:
        pool_ctx = _pool.connection()
        connection = await pool_ctx.__aenter__()
        return PooledConnectionWrapper(pool_ctx, connection)
    else:
        conn = await psycopg.AsyncConnection.connect(
            settings.langfuse_database_url,
            row_factory=dict_row,
        )
        return conn
