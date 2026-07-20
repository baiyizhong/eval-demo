# 人工标注编辑保存去重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 人工编辑保存只通过 Langfuse API 写一次，并确保评分读取只返回相同 ID 的最新版本。

**Architecture:** 保存链路区分人工编辑与新任务历史预填：编辑关闭 ClickHouse write-through，预填继续保留。ClickHouse 查询通过 `FINAL` 和 `is_deleted = 0` 返回逻辑最终态。

**Tech Stack:** Python、FastAPI、Langfuse Public API、ClickHouse、pytest、uv、ruff

---

### Task 1: 锁定人工编辑单写行为

**Files:**
- Modify: `pa-eval-backend/tests/test_annotations.py`
- Modify: `pa-eval-backend/app/annotations.py`

- [ ] 增加测试：调用 `_save_annotation_scores_with_langfuse_api()` 时 Langfuse client 收到评分，但 ClickHouse writer 不得收到写入。
- [ ] 运行目标测试，确认当前实现因 ClickHouse writer 被调用而失败。
- [ ] 为 `_write_annotation_score_requests()` 增加显式 `write_through_clickhouse` 开关；人工编辑传 `False`，历史预填传 `True`。
- [ ] 再次运行目标测试，确认通过。

### Task 2: 锁定最终态评分读取

**Files:**
- Modify: `pa-eval-backend/tests/test_observability.py`
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`

- [ ] 增加查询回归断言：队列评分和 Trace 评分 SQL 包含 `FROM scores FINAL` 与 `is_deleted = 0`。
- [ ] 运行目标测试，确认当前非最终态查询失败。
- [ ] 修改两个评分读取 SQL 使用 `FINAL` 并过滤删除版本。
- [ ] 再次运行目标测试，确认通过。

### Task 3: 回归验证

**Files:**
- Verify: `pa-eval-backend/app/annotations.py`
- Verify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Verify: `pa-eval-backend/tests/test_annotations.py`
- Verify: `pa-eval-backend/tests/test_observability.py`

- [ ] 运行 `uv run pytest tests/test_annotations.py tests/test_observability.py -q`。
- [ ] 运行后端完整 `uv run pytest -q`。
- [ ] 运行 `uv run ruff check .` 和生产文件格式检查。
- [ ] 运行 `git diff --check`，确认不提交代码。
