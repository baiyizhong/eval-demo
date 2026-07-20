# 人工标注会话 Trace 自动定位与高亮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从人工标注列表点击会话 ID 后，保持现有升序分页并自动打开原始 Trace 所在页，高亮并滚动到目标行。

**Architecture:** Plus 层 Trace 列表新增可选 `anchorTraceId`，通过现有过滤结果的升序窗口行号计算实际页码。前端两个入口传递 `sessionId + traceId`，共享弹窗首次使用锚点定位，随后恢复普通分页并对匹配行应用语义化高亮。

**Tech Stack:** FastAPI、ClickHouse SQL、React、TypeScript、React Query、shadcn/ui Table/Dialog、pytest、Node test runner

---

### Task 1: 后端 Trace 列表支持锚点页定位

**Files:**
- Modify: `pa-eval-backend/tests/test_observability.py`
- Modify: `pa-eval-backend/app/observability.py`
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`

- [ ] **Step 1: 编写 API 参数转发失败测试**

在 `test_observability.py` 新增接口测试，请求：

```python
params={
    "sessionId": "session-1",
    "anchorTraceId": "trace-25",
    "page": 1,
    "pageSize": 20,
}
```

断言 `fake_trace.list_kwargs["anchor_trace_id"] == "trace-25"`。

- [ ] **Step 2: 编写 reader 自动定位失败测试**

为 `LangfuseClickHouseReader.list_traces()` 增加测试，mock `_locate_trace_page()` 返回 2，调用时传 `session_id="session-1"`、`anchor_trace_id="trace-25"`、`page=1`、`page_size=20`。断言 `_fetch_trace_rows()` 收到 `offset=20`、`order_ascending=True`，响应包含 `page == 2`。

- [ ] **Step 3: 运行测试确认 RED**

```bash
cd pa-eval-backend
uv run pytest tests/test_observability.py -k "anchor_trace" -q
```

Expected: FAIL，接口和 reader 尚未接受锚点参数。

- [ ] **Step 4: 实现锚点页计算**

`list_traces()` 新增 `anchor_trace_id` 参数。新增 `_locate_trace_page()`，执行以下 ClickHouse 查询：

```sql
SELECT page
FROM (
  SELECT
    traceId,
    intDiv(
      row_number() OVER (
        ORDER BY toUnixTimestamp64Milli(createdAt) ASC, traceId ASC
      ) - 1,
      {anchor_page_size:UInt32}
    ) + 1 AS page
  FROM trace_base base
  WHERE <现有 trace_filter.where_sql>
)
WHERE traceId = {anchor_trace_id:String}
LIMIT 1
FORMAT JSONEachRow
```

仅当 `session_id` 和 `anchor_trace_id` 都存在时调用。找到页码后使用该页计算 offset；找不到时保留请求页码。响应增加 `page: effective_page`。

`observability.py` 增加 `anchorTraceId` Query 参数并转发。

- [ ] **Step 5: 运行后端测试确认 GREEN**

```bash
cd pa-eval-backend
uv run pytest tests/test_observability.py -q
```

Expected: PASS，现有升序测试继续通过。

### Task 2: 两个人工标注入口传递原始 Trace ID

**Files:**
- Modify: `pa-eval-frontend/src/tests/app-evaluation/annotation-session-traces.test.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-columns.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queue-detail.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-batch.tsx`

- [ ] **Step 1: 编写入口失败断言**

断言 `onOpenSession` 签名接收 `(sessionId: string, traceId: string)`，两个入口点击时都传递 `item.source.sessionId` 和 `item.source.traceId`，两个 `SessionTraceDialog` 都传入 `highlightTraceId`，并使用 `sessionId:traceId` 组合 key。

- [ ] **Step 2: 运行前端测试确认 RED**

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/annotation-session-traces.test.ts
```

Expected: FAIL，当前入口只保存和传递 `sessionId`。

- [ ] **Step 3: 修改入口状态与调用**

两个页面使用：

```ts
type SelectedSessionTrace = {
  sessionId: string
  traceId: string
}
```

状态改为 `SelectedSessionTrace | null`。点击会话 ID 时传入两项数据；关闭弹窗时重置为 `null`。`SessionTraceDialog` 接收 `sessionId` 和 `highlightTraceId`。

- [ ] **Step 4: 运行入口测试确认 GREEN**

运行 `annotation-session-traces.test.ts`，确认入口断言通过。

### Task 3: 前端弹窗定位、高亮和滚动

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-observability/types.ts`
- Modify: `pa-eval-frontend/src/modules/app-observability/views/trace-logs-query.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/session-trace-dialog-utils.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/session-trace-dialog.tsx`
- Modify: `pa-eval-frontend/src/tests/app-evaluation/annotation-session-traces.test.ts`

- [ ] **Step 1: 编写查询和高亮失败测试**

扩展工具测试，断言：

```ts
buildSessionTraceListQuery('session-1', 1, 'trace-25')
```

返回 filters 中的 `anchorTraceId`。源码断言 `TraceListQuery` 和 `buildTraceListQuery()` 映射该字段；弹窗包含 `highlightTraceId`、首次 `page === null` 锚点模式、响应实际页码、`bg-accent/60`、`aria-current`、`scrollIntoView`。

- [ ] **Step 2: 运行测试确认 RED**

运行 `annotation-session-traces.test.ts`，确认因定位和高亮逻辑缺失而失败。

- [ ] **Step 3: 实现首次定位和行高亮**

`TraceListQuery` 新增 `anchorTraceId?: string`；查询构造器映射 `state.filters.anchorTraceId`。

`SessionTraceDialog`：

- 新增 `highlightTraceId` prop。
- 响应类型增加 `page?: number`。
- 分页状态以 `null` 表示首次请求，直接使用响应的实际页码作为当前页。
- 普通翻页不再传锚点。
- 匹配行使用 `cn(isHighlighted && 'bg-accent/60 hover:bg-accent/60')` 和 `aria-current`。
- 使用 ref 和 effect 调用 `scrollIntoView({ block: 'center' })`。

- [ ] **Step 4: 运行前端相关测试确认 GREEN**

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/app-evaluation/annotation-session-traces.test.ts \
  src/tests/app-evaluation/batch-annotation-view.test.ts
```

Expected: PASS。

### Task 4: 质量门禁

- [ ] **Step 1: 后端验证**

```bash
cd pa-eval-backend
uv run pytest tests/test_observability.py -q
uv run ruff check app/observability.py app/langfuse_clickhouse.py tests/test_observability.py
```

- [ ] **Step 2: 前端验证**

```bash
cd pa-eval-frontend
npm run typecheck
npx eslint \
  src/modules/app-evaluation/components/session-trace-dialog.tsx \
  src/modules/app-evaluation/components/session-trace-dialog-utils.ts \
  src/modules/app-evaluation/components/annotation-queue-item-columns.tsx \
  src/modules/app-evaluation/views/annotation-queue-detail.tsx \
  src/modules/app-evaluation/views/annotation-batch.tsx \
  src/modules/app-observability/types.ts \
  src/modules/app-observability/views/trace-logs-query.ts \
  src/tests/app-evaluation/annotation-session-traces.test.ts
npm run build
```

- [ ] **Step 3: 差异检查**

```bash
cd ..
git diff --check
git status --short
```

确认未修改 `langfuse/`、`dify/`，并保留此前工作区改动。按项目规约不自动提交或推送。
