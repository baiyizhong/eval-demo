# 批量标注高级筛选 ClickHouse 下推 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不新增表结构、不修改前端与 API 合约的前提下，将批量标注工作台 metadata/input/output 高级筛选、总数、分页和 facet 计数下推到 ClickHouse，消除 Python 全量 Trace payload 扫描。

**Architecture:** PostgreSQL 只读取标注队列成员、状态、分配人与排序字段，并将轻量候选集作为 ClickHouse External Table 传入。ClickHouse 在单次过滤查询中关联 `traces`/`observations`，完成源字段过滤、精确总数与分页；filter-counts 使用同一候选集执行一次聚合查询。普通无高级筛选路径保持不变。

**Tech Stack:** Python 3.11、FastAPI、PostgreSQL、ClickHouse HTTP External Table、pytest、uv、Ruff

---

### Task 1: 锁定 External Table 与筛选 SQL 合约

**Files:**
- Modify: `pa-eval-backend/tests/test_annotations.py`
- Modify: `pa-eval-backend/tests/test_observability.py`
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`

- [ ] 编写失败测试，要求高级筛选查询只调用一次 ClickHouse 下推方法，不调用 `list_trace_sources`。
- [ ] 编写失败测试，覆盖 metadata/input/output 的 `contains`、`equals`、`exists`、空 key 与嵌套 key 参数化 SQL。
- [ ] 编写失败测试，覆盖 External Table 请求体与候选字段 schema。
- [ ] 运行目标测试，确认因下推方法和 External Table 支持尚不存在而失败。
- [ ] 实现参数化筛选 SQL builder 和 External Table HTTP 查询方法。
- [ ] 运行目标测试确认通过。

### Task 2: PostgreSQL 轻量候选查询

**Files:**
- Modify: `pa-eval-backend/tests/test_annotations.py`
- Modify: `pa-eval-backend/app/langfuse_db.py`

- [ ] 编写失败测试，断言高级筛选候选 SQL 不 Join `traces`、`observations`、`trace_sessions`，但保留队列、状态、分配人、时间、itemIds 与排序字段。
- [ ] 运行测试确认现有源字段候选 SQL 不满足要求。
- [ ] 新增只返回标注业务字段的候选读取方法，并复用现有权限校验与参数绑定。
- [ ] 运行目标测试确认通过。

### Task 3: 列表过滤、总数与分页一次下推

**Files:**
- Modify: `pa-eval-backend/tests/test_annotations.py`
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Modify: `pa-eval-backend/app/annotations.py`

- [ ] 编写失败测试，覆盖空结果、第一页、第二页、跨批次顺序、Trace/Observation 候选和精确 total。
- [ ] 运行测试确认当前 Python `_scan_annotation_items_page` 路径失败。
- [ ] 实现 ClickHouse 候选 Join、源字段过滤、summary 行与 page 行单查询返回。
- [ ] 路由仅在 metadata/input/output 高级筛选存在时使用新路径；无高级筛选路径保持原样。
- [ ] 删除当前列表 Python 全量源数据扫描分页辅助函数。
- [ ] 运行标注模块测试确认通过。

### Task 4: filter-counts 一次下推

**Files:**
- Modify: `pa-eval-backend/tests/test_annotations.py`
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Modify: `pa-eval-backend/app/annotations.py`

- [ ] 编写失败测试，验证 status/objectType/assigneeIds 分别忽略自身条件并保留其他条件。
- [ ] 运行测试确认当前 Python 批次累计路径失败。
- [ ] 实现单次 ClickHouse 聚合查询并删除 `_scan_annotation_item_filter_counts`。
- [ ] 运行标注模块测试确认通过。

### Task 5: 性能基准与完整验证

**Files:**
- Create: `pa-eval-backend/scripts/benchmark_annotation_advanced_filters.py`
- Modify: `pa-eval-backend/tests/test_annotations.py`

- [ ] 固化 20,000 条候选、5% 命中、pageSize=50 的确定性基准。
- [ ] 输出优化前后中位耗时、峰值内存、CH 返回/处理行数和调用次数。
- [ ] 运行 `uv run pytest tests/test_annotations.py -q`。
- [ ] 运行 `uv run pytest -q`。
- [ ] 运行 `uv run ruff check app tests scripts/benchmark_annotation_advanced_filters.py`。
- [ ] 运行 `git diff --check` 并确认没有数据库迁移、前端、`langfuse/` 或 `dify/` 改动。
- [ ] 独立代码审查最终 diff，修复所有 Critical/Important 问题。

