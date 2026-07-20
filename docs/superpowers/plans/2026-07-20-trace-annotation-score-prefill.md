# Trace 人工标注历史评分回显 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让从 Trace 创建的新人工标注任务按评分指标回显该 Trace 已有的最新评分值。

**Architecture:** 在 ClickHouse Trace 批量读取接口中增加显式的 `scores` 字段开关，仅在调用方请求时批量加载评分。人工标注预填链路显式请求该字段，前端继续使用现有 `item.scores` 表单初始化逻辑。

**Tech Stack:** Python 3.11、FastAPI、ClickHouse HTTP 查询、pytest、uv、ruff

---

### Task 1: 用失败测试锁定按需评分加载行为

**Files:**
- Modify: `pa-eval-backend/tests/test_observability.py`
- Modify: `pa-eval-backend/tests/test_annotations.py`

- [ ] **Step 1: 新增 ClickHouse 批量 Trace 查询回归测试**

在 `tests/test_observability.py` 增加异步测试，替换 `_fetch_trace_rows` 和 `_fetch_scores_by_trace`，调用：

```python
rows = await reader.list_traces_by_ids(
    "project-1",
    ["trace-1"],
    fields="scores",
)
```

断言返回行包含评分，并断言评分查询收到 `project-1` 和 `trace-1`。

- [ ] **Step 2: 让人工标注测试替身模拟真实字段裁剪**

调整 `FakeAnnotationTraceReader.list_traces_by_ids()`：仅当 `fields` 包含 `scores` 时保留 `scores`；记录本次 `fields`。在 `test_creates_trace_annotation_task_prefills_scores_from_trace_detail` 中断言调用字段为 `scores`。

- [ ] **Step 3: 运行测试并确认 RED**

Run:

```bash
uv run pytest tests/test_observability.py::test_list_traces_by_ids_loads_scores_only_when_requested tests/test_annotations.py::test_creates_trace_annotation_task_prefills_scores_from_trace_detail -q
```

Expected: FAIL；真实批量查询没有附加 `scores`，人工标注预填调用也没有请求 `scores`。

### Task 2: 实现显式评分加载并接入人工标注预填

**Files:**
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Modify: `pa-eval-backend/app/annotations.py`

- [ ] **Step 1: 为批量 Trace 查询增加 `scores` 字段处理**

在 `list_traces_by_ids()` 中解析：

```python
include_scores = _trace_fields_include(fields, "scores")
```

当 `include_scores` 为真时调用 `_fetch_scores_by_trace(project_id, unique_trace_ids)`，为每个 Trace 行设置 `scores` 和 `scoreSummary`；未请求时不增加评分查询。

- [ ] **Step 2: 人工标注预填显式请求评分**

将 `_prefill_annotation_scores_from_trace_rows()` 中的调用改为：

```python
traces = await trace_reader.list_traces_by_ids(
    project_id,
    list(item_by_trace_id),
    fields="scores",
)
```

- [ ] **Step 3: 运行目标测试并确认 GREEN**

Run:

```bash
uv run pytest tests/test_observability.py::test_list_traces_by_ids_loads_scores_only_when_requested tests/test_annotations.py::test_creates_trace_annotation_task_prefills_scores_from_trace_detail -q
```

Expected: `2 passed`。

### Task 3: 回归验证

**Files:**
- Verify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Verify: `pa-eval-backend/app/annotations.py`
- Verify: `pa-eval-backend/tests/test_observability.py`
- Verify: `pa-eval-backend/tests/test_annotations.py`

- [ ] **Step 1: 运行相关测试模块**

```bash
uv run pytest tests/test_observability.py tests/test_annotations.py -q
```

Expected: 全部通过。

- [ ] **Step 2: 运行代码质量检查**

```bash
uv run ruff check app/langfuse_clickhouse.py app/annotations.py tests/test_observability.py tests/test_annotations.py
uv run ruff format --check app/langfuse_clickhouse.py app/annotations.py tests/test_observability.py tests/test_annotations.py
```

Expected: 无 lint 或格式错误。

- [ ] **Step 3: 检查改动范围**

```bash
git diff --check
git diff -- app/langfuse_clickhouse.py app/annotations.py tests/test_observability.py tests/test_annotations.py
```

Expected: 仅包含按需评分读取、人工标注接入及对应测试；不提交代码。
