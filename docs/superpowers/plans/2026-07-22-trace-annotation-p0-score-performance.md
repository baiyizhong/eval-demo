# Trace 批量加入人工标注 P0 性能优化 Implementation Plan

> **For agentic workers:** Execute with test-driven development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将批量人工标注历史评分预填收敛为 ClickHouse 批量读写，并保证大批量 Job只由专用Worker执行且持续续租。

**Architecture:** `LangfuseClickHouseScoreWriter`提供JSONEachRow批量写能力；Annotation预填复用现有ClickHouse读取和PostgreSQL配置校验，但绕过Langfuse逐条Score API及PostgreSQL历史Score复制。Job调度根据worker配置二选一，运行期间由独立心跳续租。

**Tech Stack:** Python 3.11、FastAPI、asyncio、PostgreSQL、ClickHouse、pytest、uv

---

### Task 1: ClickHouse Score批量写入

**Files:**
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

- [x] 先增加失败测试，断言多个Score只触发一次JSONEachRow写入。
- [x] 实现 `upsert_annotation_scores`，复用统一record构造并一次发送多行。
- [x] 保留单条 `upsert_annotation_score` 包装方法兼容其他调用。
- [x] 运行目标测试。

### Task 2: 批量预填只走ClickHouse

**Files:**
- Modify: `pa-eval-backend/app/annotations.py`
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

- [x] 先修改/增加失败测试，断言预填不调用Langfuse `create_score`、不读取API Key、只调用一次ClickHouse批量写。
- [x] 从Trace批量创建方法移除PostgreSQL历史Score复制调用。
- [x] 将预填写入改为ClickHouse批量写并保持失败返回结构。
- [x] 运行预填和Trace任务目标测试。

### Task 3: 专用Worker调度与租约心跳

**Files:**
- Modify: `pa-eval-backend/app/annotations.py`
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

- [x] 先增加失败测试：worker启用时不注册BackgroundTask，关闭时注册兜底任务。
- [x] 增加独立 `renew_trace_bulk_job_lease` 数据库方法。
- [x] 增加Job心跳上下文，在处理期间定时续租并在结束时可靠停止。
- [x] 增加心跳行为测试并运行目标测试。

### Task 4: 完整验证

- [x] 运行 `uv run pytest tests/test_annotations.py -q`。
- [x] 运行 `uv run ruff check app tests/test_annotations.py`。
- [x] 运行 `git diff --check`并复核未修改Langfuse参考目录、未提交代码。
