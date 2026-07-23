# Trace Input/Output Advanced Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Trace 日志高级筛选中增加与 Metadata 同级、同交互的 Input/Output 多条件筛选，并保证列表、计数、URL 状态和全部匹配项批量操作语义一致。

**Architecture:** 前端用一个 Trace 模块私有对象条件编辑器承载 Metadata/Input/Output，查询构造统一规范化三个条件数组。后端 API 解析两个新增 JSON 参数，并在 ClickHouse Trace `input`/`output` 字段上使用参数绑定生成 JSON 顶层 key 条件；同一筛选构造器供列表、计数和批量 ID 遍历复用。

**Tech Stack:** React 19、TypeScript、DataTable/FilterPanel、Node test runner、FastAPI、Pydantic、Python 3.11、ClickHouse SQL、pytest、uv、Ruff。

**约束:** 遵循仓库规约，不执行 `git commit`、`git push` 或创建 PR；不修改 `langfuse/`、`dify/`；不修改数据库结构。

---

## 文件结构

- Modify: `pa-eval-frontend/src/modules/app-observability/types.ts` — 增加 Input/Output 查询字段并将条件类型泛化为 Trace 对象条件。
- Modify: `pa-eval-frontend/src/modules/app-observability/components/trace-log-filters.tsx` — 注册 URL 字段、渲染三个同级编辑器并复用私有组件。
- Modify: `pa-eval-frontend/src/modules/app-observability/views/trace-logs-query.ts` — 统一规范化和序列化三类对象条件。
- Modify: `pa-eval-frontend/mock/observability.ts` — mock Trace 列表按三个对象条件过滤。
- Modify: `pa-eval-frontend/src/tests/app-observability/trace-log-filters.test.ts` — 验证字段层级和编辑器复用。
- Modify: `pa-eval-frontend/src/tests/app-observability/trace-logs-query.test.ts` — 验证序列化、空 key 和操作符规范化。
- Modify: `pa-eval-frontend/src/tests/app-observability/trace-log-mock-filters.test.ts` — 验证 mock JSON key 筛选。
- Modify: `pa-eval-backend/app/observability.py` — 接收、解析、透传 Input/Output 条件。
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py` — 列表、计数、批量遍历、缓存 key 和内存匹配支持新增条件。
- Modify: `pa-eval-backend/app/annotations.py` — 全部匹配项筛选快照白名单支持新增条件。
- Modify: `pa-eval-backend/tests/test_observability.py` — 覆盖 API 解析、SQL 条件和内存语义。
- Modify: `pa-eval-backend/tests/test_annotations.py` — 覆盖批量筛选快照规范化。

### Task 1: 前端查询类型与序列化

- [ ] **Step 1: 写失败测试**

在 `trace-logs-query.test.ts` 增加用例，输入三类条件并断言 Input/Output 被序列化、空 key 被剔除、未知操作符回退为 `contains`：

```ts
test('trace logs query serializes input and output object filters', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      filters: {
        inputFilters: [
          { key: 'question', operator: 'contains', value: '发票' },
          { key: ' ', operator: 'equals', value: 'ignored' },
        ],
        outputFilters: [
          { key: 'answer', operator: 'equals', value: '已开具' },
          { key: 'reason', operator: 'invalid', value: '缺少参数' },
        ],
      },
    },
    'project-1'
  )

  assert.deepEqual(JSON.parse(query.inputFilters!), [
    { key: 'question', operator: 'contains', value: '发票' },
  ])
  assert.deepEqual(JSON.parse(query.outputFilters!), [
    { key: 'answer', operator: 'equals', value: '已开具' },
    { key: 'reason', operator: 'contains', value: '缺少参数' },
  ])
  assert.equal(query.timeRange, undefined)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd pa-eval-frontend && node --test --experimental-strip-types src/tests/app-observability/trace-logs-query.test.ts`

Expected: FAIL，`inputFilters`/`outputFilters` 为 `undefined`。

- [ ] **Step 3: 实现最小查询支持**

在 `types.ts` 的 `TraceListQuery` 增加：

```ts
inputFilters?: string
outputFilters?: string
```

将条件类型命名泛化为：

```ts
export type TraceObjectFilterOperator = 'equals' | 'contains' | 'exists'
export type TraceObjectFilter = {
  key: string
  operator: TraceObjectFilterOperator
  value?: string
}
```

在 `trace-logs-query.ts` 用同一个 `normalizeObjectFilters()` 处理 Metadata/Input/Output，并在返回对象增加：

```ts
inputFilters: serializeJsonFilter(inputFilters),
outputFilters: serializeJsonFilter(outputFilters),
```

规范化函数必须 trim key、丢弃空 key并限制操作符集合。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd pa-eval-frontend && node --test --experimental-strip-types src/tests/app-observability/trace-logs-query.test.ts`

Expected: PASS。

### Task 2: 前端三个同级条件编辑器与 URL 状态

- [ ] **Step 1: 写失败测试**

在 `trace-log-filters.test.ts` 增加断言：

```ts
test('trace log advanced filters expose sibling metadata input output editors', () => {
  assert.match(source, /fieldId:\s*'inputFilters'/)
  assert.match(source, /fieldId:\s*'outputFilters'/)
  assert.match(source, /id:\s*'metadataFilters'[\s\S]*label:\s*'Metadata'/)
  assert.match(source, /id:\s*'inputFilters'[\s\S]*label:\s*'Input'/)
  assert.match(source, /id:\s*'outputFilters'[\s\S]*label:\s*'Output'/)
  assert.match(source, /function ObjectFilterEditor/)
  assert.match(source, /添加 \{label\} 条件/)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd pa-eval-frontend && node --test --experimental-strip-types src/tests/app-observability/trace-log-filters.test.ts`

Expected: FAIL，缺少新增 URL 字段和筛选字段。

- [ ] **Step 3: 实现同级筛选字段**

在 `traceLogUrlFilters` 增加两个 `json` binding。在 `buildTraceLogFilterGroups()` 的同一个 `fields` 数组中紧跟 Metadata 插入 Input、Output：

```tsx
{
  id: 'inputFilters',
  type: 'custom',
  label: 'Input',
  render: ({ value, setValue }) => (
    <ObjectFilterEditor
      label='Input'
      value={value}
      onChange={(nextValue) => setValue(nextValue, 'inputFilters')}
    />
  ),
},
```

Output 使用相同结构。将 `MetadataFilterEditor`/`MetadataTextInput` 泛化为 `ObjectFilterEditor`/`ObjectFilterTextInput`，三者都显示 `placeholder='key'`，新增按钮文案为 `添加 ${label} 条件`，保留 composition 事件处理。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd pa-eval-frontend && node --test --experimental-strip-types src/tests/app-observability/trace-log-filters.test.ts src/tests/app-observability/trace-logs-query.test.ts`

Expected: PASS。

- [ ] **Step 5: 补齐 mock 行为测试与实现**

在 `trace-log-mock-filters.test.ts` 构造含 JSON Input/Output 的 Trace，断言 key 条件命中；纯文本 payload、缺失 key 和空 key 不命中/不生效。`mock/observability.ts` 新增解析 JSON 数组参数、解析 payload 对象和对象条件 AND 匹配 helper，并接入 Trace 列表过滤链。

Run: `cd pa-eval-frontend && node --test --experimental-strip-types src/tests/app-observability/trace-log-mock-filters.test.ts`

Expected: PASS。

### Task 3: 后端 API 参数解析与 ClickHouse 筛选

- [ ] **Step 1: 写 API 失败测试**

在 `tests/test_observability.py` 增加请求：

```python
def test_lists_project_traces_passes_input_output_filters() -> None:
    fake_db = FakeDatabaseReader()
    fake_trace = FakeTraceReader()
    override_readers(fake_db, fake_trace)
    try:
        response = TestClient(app).get(
            "/api/projects/project-1/traces",
            params={
                "inputFilters": '[{"key":"question","operator":"contains","value":"发票"}]',
                "outputFilters": '[{"key":"answer","operator":"exists","value":""}]',
            },
        )
    finally:
        clear_overrides()
    assert response.status_code == 200
    assert fake_trace.list_kwargs["input_filters"] == [
        {"key": "question", "operator": "contains", "value": "发票"}
    ]
    assert fake_trace.list_kwargs["output_filters"] == [
        {"key": "answer", "operator": "exists", "value": ""}
    ]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd pa-eval-backend && uv run pytest tests/test_observability.py::test_lists_project_traces_passes_input_output_filters -q`

Expected: FAIL，reader kwargs 缺少新增字段。

- [ ] **Step 3: 实现 API 解析和透传**

在 `observability.py:list_traces` 增加 `inputFilters`、`outputFilters` Query 参数，复用重命名后的 `_parse_trace_object_filters()`，并透传到 reader。解析函数保持空 key 丢弃、操作符白名单和非法 JSON 返回 `None`。

- [ ] **Step 4: 写 SQL 构造失败测试**

在 `tests/test_observability.py` 调用 `_build_trace_filter()`，传入 Input contains 与 Output exists，断言 SQL 含参数化的 `JSONHas(ifNull(t.input, ''), ...)`、Input value 比较和 Output key 判断，并断言用户 key/value 只出现在 params 中。

- [ ] **Step 5: 实现 ClickHouse 条件 helper**

在 `langfuse_clickhouse.py` 增加：

```python
def _append_trace_payload_where_filters(
    filters: list[str],
    params: dict[str, Any],
    *,
    column: str,
    prefix: str,
    value_filters: list[dict[str, Any]] | None,
) -> None:
    ...
```

helper 对每个非空顶层 key 生成参数化 `JSONHas`；`exists` 只生成存在判断；其他操作符通过 `JSON_VALUE` 和 `JSONExtractRaw` 的安全表达式提取值后生成等于或包含判断。调用点使用 `column="t.input"/"t.output"`，禁止将用户输入拼进 SQL。

把 `input_filters`、`output_filters` 贯穿 `list_traces()`、`count_traces()`、`list_trace_ids_for_bulk()`、`_build_trace_filter()`、`_trace_count_cache_key()` 和 `_matches_trace()`。内存匹配先用 `_payload_to_object()`，只接受 dict，再按 AND 语义匹配顶层 key。

- [ ] **Step 6: 运行后端相关测试确认通过**

Run: `cd pa-eval-backend && uv run pytest tests/test_observability.py -q`

Expected: PASS。

### Task 4: 全部匹配项批量筛选快照

- [ ] **Step 1: 写失败测试**

在 `tests/test_annotations.py` 为 `_normalize_trace_filter_snapshot()` 增加：

```python
def test_normalizes_trace_input_output_filter_snapshot() -> None:
    normalized = _normalize_trace_filter_snapshot(
        {
            "inputFilters": '[{"key":"question","operator":"contains","value":"发票"}]',
            "outputFilters": [{"key": "answer", "operator": "exists", "value": ""}],
        }
    )
    assert normalized["input_filters"][0]["key"] == "question"
    assert normalized["output_filters"][0]["key"] == "answer"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd pa-eval-backend && uv run pytest tests/test_annotations.py -q -k 'trace_input_output_filter_snapshot'`

Expected: FAIL，normalized 缺少新增字段。

- [ ] **Step 3: 实现筛选快照白名单**

在 `_normalize_trace_filter_snapshot()` 的 JSON 数组映射中加入：

```python
("inputFilters", "input_filters"),
("outputFilters", "output_filters"),
```

`count_traces()` 和 `list_trace_ids_for_bulk()` 已在 Task 3 接收这两个规范化字段，因此无需新增另一套批量过滤逻辑。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd pa-eval-backend && uv run pytest tests/test_annotations.py -q -k 'trace_filter_snapshot or trace_input_output_filter_snapshot'`

Expected: PASS。

### Task 5: 全量质量验证

- [ ] **Step 1: 运行前端定向测试**

Run: `cd pa-eval-frontend && node --test --experimental-strip-types src/tests/app-observability/trace-log-filters.test.ts src/tests/app-observability/trace-logs-query.test.ts src/tests/app-observability/trace-log-mock-filters.test.ts`

Expected: PASS。

- [ ] **Step 2: 运行前端质量门禁**

Run: `cd pa-eval-frontend && npm run typecheck && npm run lint`

Expected: 两条命令退出码均为 0。

- [ ] **Step 3: 运行后端定向测试与静态检查**

Run: `cd pa-eval-backend && uv run pytest tests/test_observability.py tests/test_annotations.py -q`

Expected: PASS。

Run: `cd pa-eval-backend && uv run ruff check app/observability.py app/langfuse_clickhouse.py app/annotations.py tests/test_observability.py tests/test_annotations.py`

Expected: `All checks passed!`。

- [ ] **Step 4: 检查改动范围**

Run: `git diff --check && git status --short`

Expected: 无空白错误；只有设计、计划和本功能相关文件发生变化；不提交代码。
