# 取消定时任务自动轮询 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除定时任务页任务列表和执行日志的固定 3 秒自动轮询，同时保留首次加载、查询状态变化和手动刷新行为。

**Architecture:** 直接删除两个 `DataTable` request 配置中的 `refetchInterval`，让请求回归 React Query 的正常查询生命周期。通过现有 scheduled-jobs 源码测试锁定“不配置自动轮询、保留手动 invalidate”的行为。

**Tech Stack:** React 19、TypeScript、TanStack React Query v5、Node.js test runner

---

### Task 1: 移除任务列表和执行日志轮询

**Files:**
- Modify: `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`
- Modify: `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx:122-140`

- [ ] **Step 1: 添加失败测试**

在 `scheduled-jobs-source.test.ts` 末尾增加：

```ts
test('scheduled job tables do not poll and keep manual refresh invalidation', () => {
  assert.doesNotMatch(pageSource, /refetchInterval/)
  assert.match(pageSource, /query\.queryKey\[0\] === 'scheduled-job-tasks'/)
  assert.match(pageSource, /query\.queryKey\[0\] === 'scheduled-job-logs'/)
  assert.match(pageSource, /toast\.success\('定时任务数据已刷新'\)/)
})
```

- [ ] **Step 2: 验证测试因现有轮询配置失败**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: 新测试 FAIL，源码仍包含 `refetchInterval: 3000`。

- [ ] **Step 3: 删除两个固定轮询配置**

从 `taskTableRequest` 删除：

```ts
refetchInterval: 3000,
```

从 `logTableRequest` 删除：

```ts
refetchInterval: 3000,
```

- [ ] **Step 4: 验证测试通过**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: 全部测试通过，新测试确认无 `refetchInterval` 且手动刷新逻辑仍存在。

- [ ] **Step 5: 执行质量门禁**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
npx eslint src/modules/scheduled-jobs/index.tsx src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
npm run build
```

Expected: 类型检查、定向 ESLint 和构建均以 exit code `0` 完成。

- [ ] **Step 6: 检查差异，不提交代码**

Run:

```bash
git diff --check -- \
  pa-eval-frontend/src/modules/scheduled-jobs/index.tsx \
  pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: exit code `0`，差异只包含测试断言和两处轮询配置删除。
