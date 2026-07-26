# Backend 数据访问连接池设计

## 背景

`pa-eval-backend` 当前没有应用级数据访问连接池：

- PostgreSQL 访问直接调用 `psycopg.AsyncConnection.connect()`，请求或任务结束后关闭连接。
- ClickHouse 查询在每次 SQL 请求中创建并关闭 `httpx.AsyncClient`。
- ClickHouse 写入仅在单次请求或后台任务范围内复用 `httpx.AsyncClient`。
- FastAPI lifespan 只管理调度器和 Trace 批处理 Worker，没有统一管理数据访问资源。

这会重复建立 PostgreSQL 和 ClickHouse HTTP 连接，并且无法集中控制连接上限、等待时间和 Keep-Alive。

## 目标

- 覆盖后端全部 PostgreSQL 数据访问，包括 `langfuse_db.py`、自动评测、审计和管理员模块。
- 覆盖全部 ClickHouse 查询与写入请求。
- PostgreSQL 使用进程级异步连接池；ClickHouse 使用进程级共享 HTTP 客户端及其内部连接池。
- 数据访问实现、参数和生命周期独立封装，业务模块只依赖稳定入口。
- 保留业务 SQL、Reader/Writer 公共方法和 FastAPI 路由行为，降低与并行业务改动冲突的概率。
- 未启动应用生命周期时保留安全的直连或独立客户端回退，兼容测试和独立执行场景。

## 非目标

- 不调整业务 SQL、表结构或数据库索引。
- 不引入 PgBouncer、ClickHouse Proxy 等新部署组件。
- 不修改 Langfuse 和 Dify 参考目录。
- 不把 Langfuse Admin API 等其他 HTTP 客户端纳入本次连接池改造。
- 不改变现有 API 请求和响应格式。

## 模块设计

新增 `pa-eval-backend/app/data_access/` 包：

### `config.py`

定义独立的 `DataAccessPoolSettings`，从 `.env` 或环境变量读取以下配置：

- `PA_EVAL_POSTGRES_POOL_MIN_SIZE`，默认 `1`。
- `PA_EVAL_POSTGRES_POOL_MAX_SIZE`，默认 `10`。
- `PA_EVAL_POSTGRES_POOL_TIMEOUT_SECONDS`，默认 `10`。
- `PA_EVAL_POSTGRES_POOL_MAX_IDLE_SECONDS`，默认 `300`。
- `PA_EVAL_POSTGRES_POOL_MAX_LIFETIME_SECONDS`，默认 `1800`。
- `PA_EVAL_CLICKHOUSE_HTTP_MAX_CONNECTIONS`，默认 `100`。
- `PA_EVAL_CLICKHOUSE_HTTP_MAX_KEEPALIVE_CONNECTIONS`，默认 `20`。
- `PA_EVAL_CLICKHOUSE_HTTP_KEEPALIVE_EXPIRY_SECONDS`，默认 `30`。

配置校验保证 PostgreSQL 最大连接数不小于最小连接数，ClickHouse Keep-Alive 连接数不超过最大连接数，所有时间和连接数量为正数。

### `postgres.py`

封装进程级 `AsyncConnectionPool`：

- `start_postgres_pool()` 根据主应用 `Settings.langfuse_database_url` 创建并打开连接池。
- `close_postgres_pool()` 幂等关闭连接池。
- `connect_postgres()` 保持与现有 `AsyncConnection.connect()` 相似的异步调用形式。
- 当连接池已启动且请求的连接串与池一致时，返回池连接上下文；退出上下文时归还连接。
- 当连接池未启动或使用不同连接串时，回退到现有直连行为，退出上下文时关闭连接。
- 池统一使用 `dict_row`，保持业务代码得到字典行结构。

`langfuse_db.py` 中的连接点只机械替换连接函数名，不改 SQL、事务或游标结构。其他模块已有 `_connect()` 包装函数，仅修改包装函数内部实现。

### `clickhouse.py`

封装共享 `httpx.AsyncClient`：

- `start_clickhouse_http_client()` 按连接池配置创建客户端。
- `get_clickhouse_http_client()` 仅返回由应用生命周期启动的共享客户端。
- 应用生命周期外由 Reader/Writer 创建临时客户端，避免测试、脚本或热重载跨事件循环复用连接。
- `close_clickhouse_http_client()` 幂等关闭客户端。
- 使用 `httpx.Limits` 设置最大连接数、最大 Keep-Alive 连接数和 Keep-Alive 存活时间。
- 客户端不保存 ClickHouse 用户名、密码或 SQL 参数；现有 Reader/Writer 仍在单次请求中传递认证参数，避免敏感配置进入全局日志。

`LangfuseClickHouseReader` 和 `LangfuseClickHouseScoreWriter` 保留现有构造方式与公共方法。应用运行期间底层请求使用共享客户端；生命周期外使用临时客户端。现有 `aclose()` 和异步上下文接口保留：共享客户端由 lifespan 关闭，临时 Writer 客户端由自身关闭。

### `lifecycle.py`

提供：

- `start_data_access_resources()`：先启动 PostgreSQL 池，再启动 ClickHouse HTTP 客户端。
- `close_data_access_resources()`：关闭 ClickHouse 客户端和 PostgreSQL 池。

FastAPI lifespan 在启动调度器与批处理 Worker 之前启动数据访问资源；关闭时先停止后台任务，再关闭数据访问资源，防止任务退出阶段使用已关闭的池。

## 数据流

### PostgreSQL

1. 业务代码调用现有模块包装函数或 `connect_postgres()`。
2. 适配层判断主连接池是否已启动且连接串匹配。
3. 匹配时从池中获取连接；否则建立临时直连。
4. `async with` 结束后，池连接归还连接池，临时连接正常关闭。

### ClickHouse

1. Reader 或 Writer 请求共享 `AsyncClient`。
2. `AsyncClient` 从内部 HTTP 连接池获取或复用 Keep-Alive 连接。
3. Reader/Writer 继续使用原有 URL、认证参数、超时和请求内容。
4. 单次请求结束不关闭共享客户端；应用关闭时统一释放。
5. 生命周期外的临时客户端在请求或 Writer 上下文结束时释放。

## 容量边界

- PostgreSQL 最大连接数是每个后端进程的上限。多 Worker 部署的总连接上限为 `进程数 × PA_EVAL_POSTGRES_POOL_MAX_SIZE`。
- 后台调度器和 HTTP 请求共享进程内 PostgreSQL 池；池耗尽时最多等待配置的 timeout。
- ClickHouse 最大 HTTP 连接数同样按进程计算。
- 默认值保持保守，生产环境应结合后端进程数、PostgreSQL `max_connections` 和 ClickHouse 容量调整。

## 错误处理

- PostgreSQL 未配置连接串时延续现有 `LangfuseDatabaseConfigError` 行为。
- 连接池启动失败时应用启动失败，避免服务处于部分可用状态。
- 获取连接超时保留 `psycopg_pool.PoolTimeout`，由现有异常处理中间件记录内部错误，不在响应中暴露连接信息。
- ClickHouse 请求继续将 `httpx.HTTPError` 转换为 `LangfuseUpstreamError`。
- 关闭函数幂等，支持启动失败后的清理和测试重复调用。

## 测试策略

按 TDD 实现以下行为：

1. 独立配置类校验默认值与非法 min/max 组合。
2. PostgreSQL 资源启动时使用配置创建池，并在关闭时释放。
3. 已启动时 `connect_postgres()` 使用池连接；未启动或连接串不匹配时使用直连。
4. ClickHouse 客户端使用配置生成 `httpx.Limits`，重复获取返回同一个客户端，关闭后可重新创建。
5. Reader 连续查询复用共享客户端，不再为每条 SQL 创建客户端。
6. Writer 的请求级依赖清理不会关闭共享客户端。
7. FastAPI lifespan 按“资源启动 → 后台任务启动 → 后台任务停止 → 资源关闭”的顺序执行。
8. 静态守卫测试确保业务目录不再直接调用 `psycopg.AsyncConnection.connect()`，唯一允许的直连回退位于 `app/data_access/postgres.py`。
9. 运行后端全量测试、Ruff 和格式检查。

## 迁移和回滚

- 无数据库表结构变更，不需要 Alembic。
- 所有新参数有默认值，不配置环境变量也可启动。
- 回滚时恢复原连接入口并删除数据访问资源启动逻辑即可，不涉及数据迁移。
- 不自动提交、推送或创建 PR。
