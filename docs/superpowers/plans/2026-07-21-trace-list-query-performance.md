# Trace 日志查询性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保持 Trace 日志功能及完整 IO 返回不变，显著降低大数据量列表查询的扫描量和耗时。

**Architecture:** 使用基础筛选快路径和聚合筛选有界路径；增加向后兼容的 keyset cursor；使用进程内 30 秒 TTL 缓存精确总数。所有改动集中在 Plus 层查询构造、路由参数和对应测试中。

**Tech Stack:** Python 3.11、FastAPI、ClickHouse SQL、pytest、uv、Ruff

---

### Task 1: 固定列表时间边界

**Files:**
- Modify: `pa-eval-backend/app/observability.py`
- Test: `pa-eval-backend/tests/test_observability.py`

- [ ] 编写失败测试：带 keyword/status/score 等非时间筛选但没有显式时间时，仍向 reader 传递 `time_range="1d"`。
- [ ] 用 `uv run pytest tests/test_observability.py -q` 验证测试因现有无界行为失败。
- [ ] 简化 `_resolve_trace_time_range()`：只有显式日期区间返回 `None`，否则返回显式 quick range 或 `1d`。
- [ ] 运行目标测试确认通过。

### Task 2: 建立基础筛选快路径

**Files:**
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Test: `pa-eval-backend/tests/test_observability.py`

- [ ] 编写失败测试：无状态/延迟/Score 筛选时，count SQL 不包含 `observation_summary`，分页后 Observation 只接收当前页 Trace ID。
- [ ] 运行目标测试确认按预期失败。
- [ ] 将 Trace 基础 CTE 与 Observation 派生字段拆开；基础路径先 count/page Trace，再聚合当前页 Observation。
- [ ] 保持 status、latency、Score、metadata 和完整 IO 响应不变，运行目标测试确认通过。

### Task 3: 约束聚合和 Score 筛选候选集

**Files:**
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Test: `pa-eval-backend/tests/test_observability.py`

- [ ] 编写失败测试：聚合路径的 Observation 和 Score CTE 必须关联有时间边界的候选 Trace，Score 条件必须下推 name/queue。
- [ ] 运行目标测试确认失败。
- [ ] 为状态、延迟、Score 路径生成 `candidate_traces`，Observation/Score 仅处理候选 Trace。
- [ ] 运行目标测试及现有 Observability 测试确认通过。

### Task 4: 增加兼容游标分页

**Files:**
- Modify: `pa-eval-backend/app/observability.py`
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Modify: `pa-eval-frontend/src/modules/app-observability/types.ts`
- Test: `pa-eval-backend/tests/test_observability.py`

- [ ] 编写失败测试：游标参数透传；SQL 使用 createdAt/traceId seek 条件且不使用 OFFSET；响应包含 `nextCursor/hasMore`。
- [ ] 运行目标测试确认失败。
- [ ] 新增可选 `cursorCreatedAt/cursorTraceId` 参数和 keyset SQL；旧分页分支保持不变。
- [ ] 更新响应类型并运行目标测试确认通过。

### Task 5: 增加精确总数 TTL 缓存

**Files:**
- Create: `pa-eval-backend/app/trace_count_cache.py`
- Modify: `pa-eval-backend/app/config.py`
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Test: `pa-eval-backend/tests/test_trace_count_cache.py`
- Test: `pa-eval-backend/tests/test_observability.py`

- [ ] 编写失败测试：30 秒内相同规范化筛选只执行一次 count，不同项目/筛选不共享；过期后重新计算；容量有界。
- [ ] 运行测试确认失败。
- [ ] 实现无外部依赖的单进程 TTL/LRU 缓存，TTL 和容量从环境变量配置。
- [ ] 接入列表 count，缓存 key 使用原始语义时间范围而不是每次计算出的当前时间。
- [ ] 运行缓存及 Observability 测试确认通过。

### Task 6: 基准、回归和静态检查

**Files:**
- Create: `pa-eval-backend/scripts/benchmark_trace_list_query.py`
- Test: `pa-eval-backend/tests/test_trace_query_benchmark.py`

- [ ] 编写确定性合成数据基准测试，校验新旧结果一致并记录扫描规模。
- [ ] 实现旧全量聚合与新候选集聚合基准，分别执行多轮并输出中位数/P95/加速比。
- [ ] 检查本地 ClickHouse/Plus 服务；可用时执行真实接口冷/热查询对比，不可用时明确报告原因。
- [ ] 运行 `uv run pytest tests/test_observability.py tests/test_trace_count_cache.py tests/test_trace_query_benchmark.py -q`。
- [ ] 运行 `uv run ruff check app tests scripts/benchmark_trace_list_query.py`。
- [ ] 检查 `git diff`，确认未修改 `langfuse/`、未写入密钥、未提交代码。
