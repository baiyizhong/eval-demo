# 自动评测报告 Badcase Score 列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让自动评测报告 Badcase 列表返回并展示当前任务当前运行产生的 score 动态列。

**Architecture:** Badcase 接口继续使用 `source_task_id + run_id` 查询本次自动评测 score，并继续用这些数据判断 Badcase。分页 Trace 查询完成后，通过一个局部纯函数按 `traceId` 将同一批 score 覆盖到 Trace 的 `scores` 和 `scoreSummary`，不修改通用 `list_traces_by_ids`，也不混入其他任务或运行的 score。

**Tech Stack:** Python 3.11、FastAPI、ClickHouse reader、pytest、uv。

---

## 文件结构

- 修改 `pa-eval-backend/tests/test_auto_evaluations.py`：增加 Badcase 接口回归测试，验证 task/run 查询参数和返回 score 范围。
- 修改 `pa-eval-backend/app/auto_evaluations.py`：增加报告 score 到 Trace 的聚合函数，并在 Badcase 接口返回前调用。
- 不修改前端组件：`evaluation-report-badcase-table.tsx` 已通过 `createTraceLogColumns({ rows })` 根据 `scores[].name` 动态生成列。

### Task 1: 用回归测试固定当前任务当前运行的 score 返回口径

**Files:**
- Modify: `pa-eval-backend/tests/test_auto_evaluations.py`
- Test: `pa-eval-backend/tests/test_auto_evaluations.py`

- [x] **Step 1: 编写失败的 Badcase 接口测试**

在现有 `test_list_evaluation_report_items_reads_scores_for_report_run` 附近新增测试。Fake reader 返回一条本次运行的 `quality` score，同时让 Trace 基础数据预置一条不相关 score，验证接口必须覆盖而不是合并：

```python
@pytest.mark.anyio
async def test_list_evaluation_report_badcases_attaches_current_run_scores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1"},
            {"exists": 1},
            {
                "source_task_id": "task-1",
                "run_id": "run-2",
                "score_name": "quality",
                "report_template_snapshot": {
                    "badcaseRule": {
                        "mode": "SCORE_THRESHOLD",
                        "operator": "LTE",
                        "threshold": 0.6,
                    }
                },
            },
        ],
        rows_by_fetchall=[
            [
                {
                    "id": "item-1",
                    "source_id": "obs-1",
                    "trace_id": "trace-1",
                    "observation_id": "obs-1",
                    "result_type": "badcase",
                    "execution_status": "COMPLETED",
                    "dataset_flowback_status": "NONE",
                }
            ]
        ],
    )
    captured = {}
    current_run_score = {
        "id": "score-current-run",
        "traceId": "trace-1",
        "observationId": "obs-1",
        "name": "quality",
        "value": 0.5,
        "metadata": {
            "paAutoEvaluationRunId": "run-2",
            "passed": False,
        },
        "createdAt": "2026-07-20T10:00:00Z",
    }

    async def fake_connect(settings):
        return FakeConnection(cursor)

    class FakeReportBadcaseReader:
        def __init__(self, settings):
            pass

        async def list_scores_by_queue(
            self,
            project_id: str,
            queue_id: str,
            *,
            run_id: str | None = None,
        ):
            captured["score_query"] = (project_id, queue_id, run_id)
            return [current_run_score]

        async def list_traces_by_ids(
            self,
            project_id: str,
            trace_ids: list[str],
            *,
            fields: str | None = None,
        ):
            captured["trace_query"] = (project_id, trace_ids, fields)
            return [
                {
                    "traceId": "trace-1",
                    "scores": [
                        {
                            "id": "score-other-task",
                            "name": "manual-quality",
                            "value": 1,
                        }
                    ],
                    "scoreSummary": "manual-quality: 1",
                }
            ]

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(
        auto_evaluations,
        "LangfuseClickHouseReader",
        FakeReportBadcaseReader,
    )

    response = await auto_evaluations.list_evaluation_report_badcases(
        project_id="project-1",
        report_id="report-1",
        page=1,
        page_size=10,
        keyword=None,
        current_user=_override_current_user(),
        settings=auto_evaluations.Settings(),
    )

    assert captured == {
        "score_query": ("project-1", "task-1", "run-2"),
        "trace_query": ("project-1", ["trace-1"], "io,metadata"),
    }
    assert response["data"]["total"] == 1
    assert response["data"]["datas"][0]["scores"] == [current_run_score]
    assert response["data"]["datas"][0]["scoreSummary"] == "quality: 0.5"
```

- [x] **Step 2: 运行测试并确认因缺少聚合而失败**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_auto_evaluations.py::test_list_evaluation_report_badcases_attaches_current_run_scores -q
```

Expected: FAIL；返回的 `scores` 仍是 `score-other-task`，说明测试准确捕获当前缺陷。

### Task 2: 在 Badcase 返回链路附加当前运行 score

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py:3741`
- Modify: `pa-eval-backend/app/auto_evaluations.py:4644`
- Test: `pa-eval-backend/tests/test_auto_evaluations.py`

- [x] **Step 1: 增加局部聚合函数**

在 `_evaluation_report_items_from_scores` 之后、`_score_result_type` 之前增加：

```python
def _attach_evaluation_report_scores_to_traces(
    traces: list[dict[str, Any]],
    scores: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    scores_by_trace: dict[str, list[dict[str, Any]]] = {}
    for score in scores:
        trace_id = str(score.get("traceId") or "").strip()
        if trace_id:
            scores_by_trace.setdefault(trace_id, []).append(score)

    return [
        {
            **trace,
            "scores": trace_scores,
            "scoreSummary": _score_summary(trace_scores),
        }
        for trace in traces
        for trace_scores in [
            scores_by_trace.get(str(trace.get("traceId") or "").strip(), [])
        ]
    ]
```

- [x] **Step 2: 在 Badcase 接口复用同一个 reader，并在返回前调用聚合函数**

将 score 和 Trace 查询改为同一 reader，并修改返回数据：

```python
    trace_reader = LangfuseClickHouseReader(settings)
    scores = await trace_reader.list_scores_by_queue(
        project_id,
        source_task_id,
        run_id=run_id,
    )
```

```python
    traces = await trace_reader.list_traces_by_ids(
        project_id,
        page_trace_ids,
        fields="io,metadata",
    )
    traces_with_scores = _attach_evaluation_report_scores_to_traces(
        traces,
        scores,
    )
    return success({"total": len(trace_ids), "datas": traces_with_scores})
```

- [x] **Step 3: 运行聚焦测试并确认通过**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_auto_evaluations.py::test_list_evaluation_report_badcases_attaches_current_run_scores -q
```

Expected: `1 passed`。

- [x] **Step 4: 运行自动评测后端测试文件**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_auto_evaluations.py -q
```

Expected: 全部通过，无失败和错误。

- [x] **Step 5: 运行后端静态检查**

Run:

```bash
cd pa-eval-backend
uv run ruff check app/auto_evaluations.py tests/test_auto_evaluations.py
```

Expected: `All checks passed!`。

### Task 3: 验证前端动态列契约未被破坏

**Files:**
- Verify: `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-badcase-table.tsx`
- Verify: `pa-eval-frontend/src/modules/app-observability/components/trace-log-columns.tsx`

- [x] **Step 1: 运行前端类型检查**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: TypeScript 编译完成且退出码为 0。

- [x] **Step 2: 检查最终差异范围**

Run:

```bash
git diff -- pa-eval-backend/app/auto_evaluations.py pa-eval-backend/tests/test_auto_evaluations.py docs/superpowers/specs/2026-07-20-evaluation-report-badcase-score-design.md docs/superpowers/plans/2026-07-20-evaluation-report-badcase-score.md
```

Expected: 仅包含 Badcase score 聚合、对应回归测试和本次设计/计划文档；不包含提交、推送或 PR 操作。

## 规约说明

项目明确禁止自动提交代码，因此本计划不包含 `git commit`、`git push` 或创建 PR 的步骤。
