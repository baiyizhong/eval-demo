# Backend 数据访问连接池 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `pa-eval-backend` 的全部 PostgreSQL 与 ClickHouse 访问增加统一、可配置、由应用生命周期管理的连接池。

**Architecture:** 新增独立 `app/data_access/` 包，分别管理 PostgreSQL `AsyncConnectionPool`、ClickHouse 共享 `httpx.AsyncClient` 和资源生命周期。业务层保留现有 SQL、Reader/Writer 方法和 `async with await connect(...)` 形态，仅替换连接入口，最大限度降低冲突。

**Tech Stack:** Python 3.11+、FastAPI lifespan、psycopg 3、psycopg-pool、httpx、Pydantic Settings、pytest、uv。

---

## 文件结构

- Create: `pa-eval-backend/app/data_access/__init__.py`：公开稳定入口。
- Create: `pa-eval-backend/app/data_access/config.py`：连接池专用环境配置。
- Create: `pa-eval-backend/app/data_access/postgres.py`：PostgreSQL 池和直连回退。
- Create: `pa-eval-backend/app/data_access/clickhouse.py`：ClickHouse 共享 HTTP 客户端。
- Create: `pa-eval-backend/app/data_access/lifecycle.py`：统一启动和关闭。
- Create: `pa-eval-backend/tests/test_data_access.py`：资源层单元测试和静态守卫。
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`：Reader/Writer 使用共享客户端。
- Modify: `pa-eval-backend/app/langfuse_db.py`：机械替换 61 个 PostgreSQL 连接入口。
- Modify: `pa-eval-backend/app/auto_evaluations.py`、`admin_users.py`、`audit.py`：现有 `_connect()` 委托连接池适配器。
- Modify: `pa-eval-backend/app/main.py`：接入数据访问生命周期。
- Modify: `pa-eval-backend/.env.example`：记录可调参数。
- Modify: `pa-eval-backend/pyproject.toml`、`uv.lock`：加入 `psycopg-pool`。

### Task 1: 独立连接池配置

**Files:**
- Create: `pa-eval-backend/app/data_access/__init__.py`
- Create: `pa-eval-backend/app/data_access/config.py`
- Create: `pa-eval-backend/tests/test_data_access.py`

- [x] **Step 1: 编写配置失败测试**

```python
import pytest
from pydantic import ValidationError

from app.data_access.config import DataAccessPoolSettings


def test_data_access_pool_settings_have_conservative_defaults() -> None:
    settings = DataAccessPoolSettings(_env_file=None)
    assert settings.pa_eval_postgres_pool_min_size == 1
    assert settings.pa_eval_postgres_pool_max_size == 10
    assert settings.pa_eval_postgres_pool_timeout_seconds == 10
    assert settings.pa_eval_clickhouse_http_max_connections == 100
    assert settings.pa_eval_clickhouse_http_max_keepalive_connections == 20


@pytest.mark.parametrize(
    "values",
    [
        {
            "pa_eval_postgres_pool_min_size": 5,
            "pa_eval_postgres_pool_max_size": 4,
        },
        {
            "pa_eval_clickhouse_http_max_connections": 10,
            "pa_eval_clickhouse_http_max_keepalive_connections": 11,
        },
    ],
)
def test_data_access_pool_settings_reject_invalid_bounds(values: dict) -> None:
    with pytest.raises(ValidationError):
        DataAccessPoolSettings(_env_file=None, **values)
```

- [x] **Step 2: 运行测试确认模块不存在**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py -q`

Expected: FAIL，提示 `app.data_access` 不存在。

- [x] **Step 3: 实现配置类**

```python
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
    pa_eval_clickhouse_http_max_keepalive_connections: int = Field(default=20, ge=0)
    pa_eval_clickhouse_http_keepalive_expiry_seconds: float = Field(default=30, gt=0)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_pool_bounds(self) -> "DataAccessPoolSettings":
        if self.pa_eval_postgres_pool_max_size < self.pa_eval_postgres_pool_min_size:
            raise ValueError("PostgreSQL pool max size must be greater than or equal to min size")
        if (
            self.pa_eval_clickhouse_http_max_keepalive_connections
            > self.pa_eval_clickhouse_http_max_connections
        ):
            raise ValueError("ClickHouse keep-alive connections cannot exceed max connections")
        return self


@lru_cache
def get_data_access_pool_settings() -> DataAccessPoolSettings:
    return DataAccessPoolSettings()
```

- [x] **Step 4: 运行配置测试确认通过**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py -q`

Expected: `3 passed`。

### Task 2: PostgreSQL 连接池适配器

**Files:**
- Modify: `pa-eval-backend/pyproject.toml`
- Modify: `pa-eval-backend/uv.lock`
- Create: `pa-eval-backend/app/data_access/postgres.py`
- Modify: `pa-eval-backend/tests/test_data_access.py`

- [x] **Step 1: 使用 uv 添加依赖**

Run: `cd pa-eval-backend && uv add "psycopg-pool>=3.3.0"`

Expected: `pyproject.toml` 和 `uv.lock` 增加 `psycopg-pool`，不生成 `requirements.txt`。

- [x] **Step 2: 编写 PostgreSQL 池失败测试**

```python
@pytest.mark.anyio
async def test_postgres_pool_starts_acquires_and_closes(monkeypatch) -> None:
    events = []

    class FakeConnectionContext:
        async def __aenter__(self):
            events.append("acquire")
            return "pooled-connection"

        async def __aexit__(self, *args):
            events.append("release")

    class FakePool:
        def __init__(self, **kwargs):
            events.append(("init", kwargs))

        async def open(self, *, wait: bool):
            events.append(("open", wait))

        def connection(self, *, timeout: float):
            events.append(("connection", timeout))
            return FakeConnectionContext()

        async def close(self):
            events.append("close")

    monkeypatch.setattr(postgres, "AsyncConnectionPool", FakePool)
    pool_settings = DataAccessPoolSettings(_env_file=None)
    await postgres.start_postgres_pool("postgresql://pool", pool_settings)

    async with await postgres.connect_postgres("postgresql://pool") as connection:
        assert connection == "pooled-connection"

    await postgres.close_postgres_pool()
    assert ("connection", 10) in events
    assert events[-1] == "close"


@pytest.mark.anyio
async def test_postgres_connect_falls_back_when_pool_is_not_started(monkeypatch) -> None:
    direct_connection = object()

    async def fake_connect(conninfo: str, *, row_factory):
        assert conninfo == "postgresql://direct"
        return direct_connection

    monkeypatch.setattr(postgres.psycopg.AsyncConnection, "connect", fake_connect)
    await postgres.close_postgres_pool()
    assert await postgres.connect_postgres("postgresql://direct") is direct_connection
```

- [x] **Step 3: 运行测试确认适配器不存在**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py -q`

Expected: FAIL，提示无法导入 `app.data_access.postgres`。

- [x] **Step 4: 实现 PostgreSQL 池与回退**

实现模块级 `_pool`、`_pool_database_url`、`_pool_timeout_seconds`；`start_postgres_pool()` 使用 `AsyncConnectionPool(..., open=False, kwargs={"row_factory": dict_row})` 并 `await pool.open(wait=True)`；`connect_postgres()` 在 URL 匹配时返回 `pool.connection(timeout=...)`，否则调用 `psycopg.AsyncConnection.connect()`；`close_postgres_pool()` 清空全局引用后幂等关闭。

- [x] **Step 5: 运行 PostgreSQL 资源测试确认通过**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py -q`

Expected: 全部通过。

### Task 3: ClickHouse 共享 HTTP 客户端

**Files:**
- Create: `pa-eval-backend/app/data_access/clickhouse.py`
- Modify: `pa-eval-backend/tests/test_data_access.py`

- [x] **Step 1: 编写客户端复用失败测试**

```python
@pytest.mark.anyio
async def test_clickhouse_http_client_is_reused_and_recreated_after_close(monkeypatch) -> None:
    created = []

    class FakeClient:
        is_closed = False

        def __init__(self, **kwargs):
            created.append(kwargs)

        async def aclose(self):
            self.is_closed = True

    monkeypatch.setattr(clickhouse.httpx, "AsyncClient", FakeClient)
    settings = Settings(pa_eval_api_timeout=7)
    pool_settings = DataAccessPoolSettings(
        _env_file=None,
        pa_eval_clickhouse_http_max_connections=30,
        pa_eval_clickhouse_http_max_keepalive_connections=12,
        pa_eval_clickhouse_http_keepalive_expiry_seconds=45,
    )

    first = clickhouse.get_clickhouse_http_client(settings, pool_settings)
    second = clickhouse.get_clickhouse_http_client(settings, pool_settings)
    assert first is second
    assert len(created) == 1
    assert created[0]["trust_env"] is False

    await clickhouse.close_clickhouse_http_client()
    third = clickhouse.get_clickhouse_http_client(settings, pool_settings)
    assert third is not first
    await clickhouse.close_clickhouse_http_client()
```

- [x] **Step 2: 运行测试确认模块不存在**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py -q`

Expected: FAIL，提示无法导入 `app.data_access.clickhouse`。

- [x] **Step 3: 实现共享客户端**

使用模块级 `_client`；创建客户端时传入 `timeout=settings.pa_eval_api_timeout`、`trust_env=False` 和带三项配置的 `httpx.Limits`；重复获取返回相同客户端；关闭时先清空全局引用再 `await client.aclose()`。

- [x] **Step 4: 运行资源层测试确认通过**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py -q`

Expected: 全部通过。

### Task 4: ClickHouse Reader/Writer 接入共享客户端

**Files:**
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Modify: `pa-eval-backend/tests/test_data_access.py`
- Modify: `pa-eval-backend/tests/test_observability.py`

- [x] **Step 1: 编写 Reader/Writer 共享测试**

测试通过 monkeypatch `get_clickhouse_http_client()` 返回同一个 FakeClient，分别构造两个 Reader 和一个 Writer；连续执行查询和写入后断言只有同一客户端收到请求，并断言 `await writer.aclose()` 不关闭共享客户端。

- [x] **Step 2: 运行测试确认仍创建请求级客户端**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py tests/test_observability.py::test_clickhouse_reader_disables_environment_proxy -q`

Expected: FAIL，因为 Reader 仍在每次查询中调用 `httpx.AsyncClient()`。

- [x] **Step 3: 修改 Reader/Writer**

- Reader 构造时通过 `get_clickhouse_http_client(settings)` 保存共享客户端。
- `_query_json_each_row()` 直接调用 `self._client.post(...)`，不再使用 `async with httpx.AsyncClient(...)`。
- Writer 构造时使用同一个共享客户端。
- Writer 的 `aclose()` 保留但不关闭共享客户端。
- FastAPI Writer 依赖保留 yield/finally 结构，以兼容现有覆盖测试。
- 更新原 `trust_env=False` 测试，使其 monkeypatch 新客户端工厂并断言创建参数。

- [x] **Step 4: 运行 ClickHouse 相关测试**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py tests/test_observability.py tests/test_annotations.py tests/test_auto_evaluations.py -q`

Expected: 全部通过。

### Task 5: 全量迁移 PostgreSQL 连接入口

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Modify: `pa-eval-backend/app/admin_users.py`
- Modify: `pa-eval-backend/app/audit.py`
- Modify: `pa-eval-backend/tests/test_data_access.py`

- [x] **Step 1: 编写静态守卫失败测试**

```python
def test_business_modules_do_not_open_postgres_connections_directly() -> None:
    app_dir = Path("app")
    offenders = []
    for path in app_dir.glob("*.py"):
        if path.name == "postgres.py":
            continue
        if "psycopg.AsyncConnection.connect(" in path.read_text():
            offenders.append(path.as_posix())
    assert offenders == []
```

- [x] **Step 2: 运行守卫并确认列出四个模块**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py::test_business_modules_do_not_open_postgres_connections_directly -q`

Expected: FAIL，offenders 包含 `langfuse_db.py`、`auto_evaluations.py`、`admin_users.py`、`audit.py`。

- [x] **Step 3: 迁移连接入口**

- 在四个模块导入 `connect_postgres`。
- `langfuse_db.py` 将 61 个 `psycopg.AsyncConnection.connect(` 精确替换为 `connect_postgres(`，保留其余参数、缩进、SQL 和事务结构。
- 其他三个模块仅将各自 `_connect()` 内的 `psycopg.AsyncConnection.connect()` 改为 `connect_postgres()`。
- 不删除 `psycopg` 导入，因为游标类型、异常类型仍在使用。

- [x] **Step 4: 运行 PostgreSQL 相关测试和静态守卫**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py tests/test_projects.py tests/test_organizations.py tests/test_evaluators.py tests/test_auto_evaluations.py tests/test_admin_users.py tests/test_admin_audit.py -q`

Expected: 全部通过。

### Task 6: 应用生命周期与环境变量

**Files:**
- Create: `pa-eval-backend/app/data_access/lifecycle.py`
- Modify: `pa-eval-backend/app/data_access/__init__.py`
- Modify: `pa-eval-backend/app/main.py`
- Modify: `pa-eval-backend/.env.example`
- Modify: `pa-eval-backend/tests/test_data_access.py`

- [x] **Step 1: 编写生命周期顺序失败测试**

为 `start_data_access_resources()`、后台任务 start/stop 和 `close_data_access_resources()` 设置事件记录，进入 `create_app()` 的 lifespan，断言顺序为：`resources-start`、`scheduler-start`、`worker-start`、`worker-stop`、`scheduler-stop`、`resources-close`。

- [x] **Step 2: 运行测试确认资源生命周期未接入**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py -q`

Expected: FAIL，因为 `main.py` 尚未调用数据访问生命周期。

- [x] **Step 3: 实现资源生命周期并接入 FastAPI**

`start_data_access_resources(settings, pool_settings)` 调用 PostgreSQL 和 ClickHouse start；关闭函数先关闭 ClickHouse、再关闭 PostgreSQL。`main.py` 在后台任务启动前调用 start，在两个后台任务 stop 后调用 close，并使用 `get_data_access_pool_settings()`。

- [x] **Step 4: 补充 `.env.example`**

追加设计文档中的八个 `PA_EVAL_POSTGRES_POOL_*` 与 `PA_EVAL_CLICKHOUSE_HTTP_*` 参数及默认值，不写真实凭据。

- [x] **Step 5: 运行资源与生命周期测试**

Run: `cd pa-eval-backend && uv run pytest tests/test_data_access.py -q`

Expected: 全部通过。

### Task 7: 全量验证与差异审查

**Files:**
- Verify all files listed above.

- [x] **Step 1: 运行后端全量测试**

Run: `cd pa-eval-backend && uv run pytest -q`

Expected: 全部通过。

- [x] **Step 2: 运行 Ruff 检查和格式检查**

Run: `cd pa-eval-backend && uv run ruff check app tests && uv run ruff format --check app tests`

Expected: `All checks passed!`，格式检查无差异。

- [x] **Step 3: 检查直连守卫和最终差异**

Run:

```bash
cd pa-eval-backend
rg -n "psycopg\.AsyncConnection\.connect" app
git diff --check
git diff --stat
```

Expected: 直连只出现在 `app/data_access/postgres.py`；无空白错误；业务改动仅是连接入口、生命周期和配置。

## 规约说明

项目禁止自动提交代码，本计划不包含 `git commit`、`git push` 或创建 PR。

## 执行记录

- 后端全量测试通过，共 `340 passed`。
- `uv run ruff check app tests` 通过。
- 本次新增和原本已格式化的目标文件通过 `ruff format --check`；全仓仍有 18 个历史文件不符合 formatter，为避免无关冲突未做全文件重排。
- `uv lock --check --default-index https://pypi.mirrors.ustc.edu.cn/simple/` 通过。
- PostgreSQL 直连只保留在 `app/data_access/postgres.py` 的生命周期外回退路径。
