# 批量标注支持编辑已完成数据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让批量标注工作台可以给已完成数据新增或修改评分指标，同时兼容旧的待标注批量接口调用。

**Architecture:** 在 `batch-scores` 请求中新增 `expectedMatchCount` 作为新模式标识。新模式按过滤后的全部选中项校验和保存，旧 `expectedPendingCount` 模式继续只处理 `PENDING`；前端批量工作台切换到新模式并仅传精确 `itemIds`。

**Tech Stack:** React、TypeScript、FastAPI、Pydantic、pytest、Node test runner

---

### Task 1: 后端新增全部选中项批量保存模式

**Files:**
- Modify: `pa-eval-backend/tests/test_annotations.py`
- Modify: `pa-eval-backend/app/annotations.py`

- [ ] **Step 1: 编写已完成项批量保存失败测试**

在 `test_annotations.py` 新增测试，请求只选择 `item-done` 并传入：

```python
{
    "filters": {"itemIds": ["item-done"]},
    "scores": [{"configId": "score-1", "value": 3, "stringValue": "", "comment": "补充指标"}],
    "expectedMatchCount": 1,
}
```

断言 HTTP 200、`successCount == 1`、`skippedCount == 0`、`successItemIds == ["item-done"]`，并确认调用了 `prepare_scores` 和 `complete_item`。

- [ ] **Step 2: 编写混合状态与数量变化失败测试**

新增测试选择 `item-1` 和 `item-done`，断言新模式会保存两条；另新增数量不一致测试，将 `expectedMatchCount` 设为 2 但只传一个有效 `itemId`，断言 HTTP 409、业务码 `1027`、信息为“批量标注选中数据已变化，请刷新列表后重试”。

- [ ] **Step 3: 运行后端定向测试确认 RED**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_annotations.py -k "bulk_saves_completed or bulk_saves_mixed or bulk_rejects_changed_selected_count" -q
```

Expected: FAIL，因为 `expectedMatchCount` 尚未触发新模式，已完成项仍被跳过或出现响应断言不匹配。

- [ ] **Step 4: 实现新旧模式兼容逻辑**

在 `AnnotationBatchScorePayload` 新增：

```python
expected_match_count: int | None = Field(default=None, alias="expectedMatchCount")
```

在 `save_annotation_batch_scores()` 中：

```python
filtered = _filter_annotation_items(items, payload.filters)
pending_items = [item for item in filtered if item["status"] == "PENDING"]
completed_count = len([item for item in filtered if item["status"] == "COMPLETED"])
uses_match_count = payload.expected_match_count is not None
target_items = filtered if uses_match_count else pending_items

if uses_match_count and payload.expected_match_count != len(target_items):
    raise BusinessError(
        code=1027,
        message="批量标注选中数据已变化，请刷新列表后重试",
        status_code=409,
    )
if not uses_match_count and payload.expected_pending_count is not None and (
    payload.expected_pending_count != len(pending_items)
):
    raise BusinessError(
        code=1027,
        message="批量标注命中数量已变化，请刷新预览后重试",
        status_code=409,
    )
```

大批量确认和评分循环改为使用 `target_items`；新模式 `skippedCount` 返回 0，兼容模式仍返回 `completed_count`；过滤摘要使用 `len(target_items)`。

- [ ] **Step 5: 运行后端新旧模式测试确认 GREEN**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_annotations.py -k "bulk_saves_annotation_scores or bulk_saves_completed or bulk_saves_mixed or bulk_rejects_changed_selected_count" -q
```

Expected: PASS，新模式处理已完成项，旧 `expectedPendingCount` 测试保持通过。

### Task 2: 前端批量工作台切换到新模式

**Files:**
- Modify: `pa-eval-frontend/src/tests/app-evaluation/batch-annotation-view.test.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/annotation-api.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-batch.tsx`

- [ ] **Step 1: 编写前端请求源码失败断言**

在 `batch-annotation-view.test.ts` 中将原 `expectedPendingCount` 断言替换为：

```ts
assert.match(pageSource, /expectedMatchCount:\s*targetIds\.length/)
assert.doesNotMatch(
  pageSource,
  /filters:\s*\{\s*status:\s*\['PENDING'\],\s*itemIds:\s*targetIds/
)
```

同时断言 API helper 输入类型包含 `expectedMatchCount: number`。

- [ ] **Step 2: 运行前端定向测试确认 RED**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/batch-annotation-view.test.ts
```

Expected: FAIL，当前页面仍发送 `status=PENDING` 和 `expectedPendingCount`。

- [ ] **Step 3: 修改 API helper 和页面请求**

将 `saveProjectAnnotationBatchScores()` 输入类型改为：

```ts
input: {
  filters: AnnotationBatchFiltersInput
  scores: AnnotationScoreFormInput['scores']
  expectedMatchCount: number
  confirmLargeBatch?: boolean
}
```

页面批量请求改为：

```ts
{
  filters: { itemIds: targetIds },
  scores: submittedInput.scores,
  expectedMatchCount: targetIds.length,
  confirmLargeBatch: targetIds.length > 100,
}
```

- [ ] **Step 4: 运行前端定向测试确认 GREEN**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/batch-annotation-view.test.ts
```

Expected: PASS。

### Task 3: 回归与质量门禁

**Files:**
- Verify: `pa-eval-backend/app/annotations.py`
- Verify: `pa-eval-backend/tests/test_annotations.py`
- Verify: `pa-eval-frontend/src/modules/app-evaluation/api/annotation-api.ts`
- Verify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-batch.tsx`
- Verify: `pa-eval-frontend/src/tests/app-evaluation/batch-annotation-view.test.ts`

- [ ] **Step 1: 运行后端人工标注测试**

```bash
cd pa-eval-backend
uv run pytest tests/test_annotations.py -q
```

- [ ] **Step 2: 运行前端人工标注相关测试**

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/app-evaluation/batch-annotation-view.test.ts \
  src/tests/app-evaluation/annotation-query-invalidation.test.ts \
  src/tests/app-evaluation/annotation-score-form-values.test.ts
```

- [ ] **Step 3: 运行静态检查与构建**

```bash
cd pa-eval-backend
uv run ruff check app/annotations.py tests/test_annotations.py

cd ../pa-eval-frontend
npm run typecheck
npx eslint \
  src/modules/app-evaluation/api/annotation-api.ts \
  src/modules/app-evaluation/views/annotation-batch.tsx \
  src/tests/app-evaluation/batch-annotation-view.test.ts
npm run build
```

- [ ] **Step 4: 检查最终差异**

```bash
cd ..
git diff --check
git status --short
```

确认只包含本任务文件以及进入本任务前已经存在的未提交改动。根据项目规约，不自动执行 `git commit` 或 `git push`。
