# 批量标注源数据 ID 取消悬停展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让批量标注工作台的源数据 ID 列只显示普通截断文本，不再触发悬停展示框。

**Architecture:** 仅调整 `AnnotationItemTableRows` 的 `sourceDataId` 渲染分支，绕过通用 `SummaryTableCell`。Input、Output、Metadata 继续复用 `SummaryTableCell` 和 `HoverPreviewCell`。

**Tech Stack:** React、TypeScript、shadcn/ui Table、Node test runner

---

### Task 1: 源数据 ID 改为普通文本

**Files:**
- Modify: `pa-eval-frontend/src/tests/app-evaluation/batch-annotation-view.test.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-batch.tsx`

- [ ] **Step 1: 编写失败测试**

在批量工作台源码测试中提取 `columnVisibility.sourceDataId` 分支，断言该分支包含普通 `TableCell`、`item.objectId` 和 `truncate`，并且不包含 `SummaryTableCell` 或 `HoverPreviewCell`：

```ts
const sourceDataIdBranch = pageSource.match(
  /\{columnVisibility\.sourceDataId \? \(([\s\S]*?)\) : null\}/
)?.[1]

assert.ok(sourceDataIdBranch)
assert.match(sourceDataIdBranch, /<TableCell/)
assert.match(sourceDataIdBranch, /item\.objectId/)
assert.match(sourceDataIdBranch, /truncate/)
assert.doesNotMatch(sourceDataIdBranch, /SummaryTableCell|HoverPreviewCell/)
```

同时保留 `SummaryTableCell` 内使用 `HoverPreviewCell` 的断言，保护其他预览列。

- [ ] **Step 2: 运行测试确认 RED**

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/batch-annotation-view.test.ts
```

Expected: FAIL，当前源数据 ID 分支仍调用 `SummaryTableCell`。

- [ ] **Step 3: 实现最小页面改动**

将源数据 ID 分支改为：

```tsx
{columnVisibility.sourceDataId ? (
  <TableCell className='max-w-[220px]'>
    <span className='block truncate font-mono text-xs'>{item.objectId}</span>
  </TableCell>
) : null}
```

不修改 `SummaryTableCell` 和公共 `HoverPreviewCell`。

- [ ] **Step 4: 运行测试确认 GREEN**

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/app-evaluation/batch-annotation-view.test.ts \
  src/tests/app-evaluation/annotation-batch-edit-completed.test.ts
```

Expected: PASS。

### Task 2: 质量门禁

**Files:**
- Verify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-batch.tsx`
- Verify: `pa-eval-frontend/src/tests/app-evaluation/batch-annotation-view.test.ts`

- [ ] **Step 1: 运行静态检查**

```bash
cd pa-eval-frontend
npm run typecheck
npx eslint \
  src/modules/app-evaluation/views/annotation-batch.tsx \
  src/tests/app-evaluation/batch-annotation-view.test.ts
npx prettier --check \
  src/modules/app-evaluation/views/annotation-batch.tsx \
  src/tests/app-evaluation/batch-annotation-view.test.ts
```

- [ ] **Step 2: 运行生产构建**

```bash
cd pa-eval-frontend
npm run build
```

- [ ] **Step 3: 检查差异**

```bash
cd ..
git diff --check
git status --short
```

确认不修改公共 `HoverPreviewCell`，并保留进入任务前的其他未提交改动。按项目规约不自动提交或推送。
