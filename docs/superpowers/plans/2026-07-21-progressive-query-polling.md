# 递增查询轮询公共策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将自动评测列表的固定 3 秒无限轮询改为可复用的 `2s → 4s → 8s → 16s → 32s` 递增轮询，并在 5 次轮询后停止。

**Architecture:** 在 `src/lib` 中提供一个无 React 状态依赖的纯策略工厂，根据 React Query 查询实例的成功与失败更新次数计算下一次间隔。`DataTable` 放宽 `refetchInterval` 类型以接受 React Query 动态回调，自动评测列表创建并复用该策略；新分页因拥有新的 `queryKey` 和查询实例而从首次请求重新计数。

**Tech Stack:** React 19、TypeScript、TanStack React Query v5、Node.js test runner、Vite

---

## 文件结构

- Create: `pa-eval-frontend/src/lib/progressive-refetch-interval.ts`
  负责递增轮询参数、最小查询状态契约以及间隔计算，不依赖具体业务页面。
- Create: `pa-eval-frontend/src/tests/progressive-refetch-interval.test.ts`
  负责公共策略的运行时行为测试以及自动评测列表接入的源码回归测试。
- Modify: `pa-eval-frontend/src/components/common/data-table/data-table.tsx:1-15,91-100`
  让 `request.refetchInterval` 接受 TanStack React Query 的动态回调类型。
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluations.tsx:1-25,106-120`
  用公共递增策略替换固定 `3000ms` 轮询。

仓库规约禁止自动提交代码，因此以下任务使用 `git diff --check` 作为阶段检查，不执行 `git commit`。

### Task 1: 建立递增轮询公共策略

**Files:**
- Create: `pa-eval-frontend/src/tests/progressive-refetch-interval.test.ts`
- Create: `pa-eval-frontend/src/lib/progressive-refetch-interval.ts`

- [ ] **Step 1: 写入公共策略的失败测试**

创建 `pa-eval-frontend/src/tests/progressive-refetch-interval.test.ts`：

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProgressiveRefetchInterval } from '../lib/progressive-refetch-interval.ts'

function createQueryState(dataUpdateCount: number, errorUpdateCount = 0) {
  return {
    state: {
      dataUpdateCount,
      errorUpdateCount,
    },
  }
}

test('progressive refetch interval excludes the initial request and stops after five polls', () => {
  const getInterval = createProgressiveRefetchInterval()

  assert.equal(getInterval(createQueryState(0)), 2_000)
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((dataUpdateCount) =>
      getInterval(createQueryState(dataUpdateCount))
    ),
    [2_000, 4_000, 8_000, 16_000, 32_000, false]
  )
})

test('progressive refetch interval counts failed requests toward the limit', () => {
  const getInterval = createProgressiveRefetchInterval()

  assert.equal(getInterval(createQueryState(1, 1)), 4_000)
  assert.equal(getInterval(createQueryState(1, 5)), false)
})

test('progressive refetch interval supports reusable schedule options', () => {
  const getInterval = createProgressiveRefetchInterval({
    initialInterval: 1_000,
    multiplier: 3,
    maxAttempts: 2,
  })

  assert.deepEqual(
    [1, 2, 3].map((dataUpdateCount) =>
      getInterval(createQueryState(dataUpdateCount))
    ),
    [1_000, 3_000, false]
  )
})
```

- [ ] **Step 2: 运行测试并确认因公共模块不存在而失败**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/progressive-refetch-interval.test.ts
```

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND` 和 `progressive-refetch-interval.ts`。

- [ ] **Step 3: 编写满足测试的最小公共策略**

创建 `pa-eval-frontend/src/lib/progressive-refetch-interval.ts`：

```ts
export type ProgressiveRefetchIntervalOptions = {
  initialInterval?: number
  multiplier?: number
  maxAttempts?: number
}

type ProgressiveRefetchQuery = {
  state: {
    dataUpdateCount: number
    errorUpdateCount: number
  }
}

export function createProgressiveRefetchInterval({
  initialInterval = 2_000,
  multiplier = 2,
  maxAttempts = 5,
}: ProgressiveRefetchIntervalOptions = {}) {
  return (query: ProgressiveRefetchQuery): number | false => {
    const completedRequestCount =
      query.state.dataUpdateCount + query.state.errorUpdateCount
    const completedPollingCount = Math.max(0, completedRequestCount - 1)

    if (completedPollingCount >= maxAttempts) return false

    return initialInterval * multiplier ** completedPollingCount
  }
}
```

这里将首次请求对应的一个完成计数减掉，因此首次请求不占用 5 次轮询额度；错误更新计数同时参与计算，防止失败时无限轮询。

- [ ] **Step 4: 运行定向测试并确认通过**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/progressive-refetch-interval.test.ts
```

Expected: PASS，显示 `3` 个测试通过、`0` 个失败。

- [ ] **Step 5: 检查本任务变更，不提交代码**

Run:

```bash
git diff --check -- \
  pa-eval-frontend/src/lib/progressive-refetch-interval.ts \
  pa-eval-frontend/src/tests/progressive-refetch-interval.test.ts
```

Expected: exit code `0`，无输出。

### Task 2: 扩展 DataTable 并接入自动评测列表

**Files:**
- Modify: `pa-eval-frontend/src/tests/progressive-refetch-interval.test.ts`
- Modify: `pa-eval-frontend/src/components/common/data-table/data-table.tsx:1-15,91-100`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluations.tsx:1-25,106-120`

- [ ] **Step 1: 先添加自动评测列表接入的失败测试**

在 `pa-eval-frontend/src/tests/progressive-refetch-interval.test.ts` 顶部补充：

```ts
import { readFileSync } from 'node:fs'
```

在文件末尾追加：

```ts
test('auto evaluation list uses the shared progressive polling strategy', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/views/auto-evaluations.tsx',
    'utf8'
  )

  assert.match(source, /createProgressiveRefetchInterval/)
  assert.match(
    source,
    /refetchInterval:\s*autoEvaluationRefetchInterval/
  )
  assert.doesNotMatch(source, /refetchInterval:\s*3000/)
})
```

- [ ] **Step 2: 运行测试并确认接入断言失败**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/progressive-refetch-interval.test.ts
```

Expected: FAIL，失败用例为 `auto evaluation list uses the shared progressive polling strategy`，原因是页面尚未包含 `createProgressiveRefetchInterval`。

- [ ] **Step 3: 扩展 DataTable 的 refetchInterval 类型**

将 `pa-eval-frontend/src/components/common/data-table/data-table.tsx` 的 React Query import 改为：

```ts
import {
  keepPreviousData,
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query'
```

将 `DataTableRequestConfig` 中的固定类型：

```ts
refetchInterval?: number | false
```

替换为：

```ts
refetchInterval?: UseQueryOptions<TResponse>['refetchInterval']
```

这样通用表格既保留固定数字和 `false`，也能接收依据当前 Query 状态动态计算间隔的函数。

- [ ] **Step 4: 在自动评测列表接入公共策略**

在 `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluations.tsx` 的公共库 import 区加入：

```ts
import { createProgressiveRefetchInterval } from '@/lib/progressive-refetch-interval'
```

在组件函数外创建稳定策略实例：

```ts
const autoEvaluationRefetchInterval = createProgressiveRefetchInterval()
```

将列表请求中的：

```ts
refetchInterval: 3000,
```

替换为：

```ts
refetchInterval: autoEvaluationRefetchInterval,
```

策略函数读取每个 React Query 查询实例自己的 `dataUpdateCount` 和 `errorUpdateCount`。首次进入未访问分页时，分页状态进入 `queryKey` 并创建新查询实例，因此从 `2s` 重新开始；返回已访问分页不增加额外重置逻辑。

- [ ] **Step 5: 运行定向测试并确认全部通过**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/progressive-refetch-interval.test.ts
```

Expected: PASS，显示 `4` 个测试通过、`0` 个失败。

- [ ] **Step 6: 运行 TypeScript 类型检查**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: exit code `0`，不存在 `refetchInterval` 回调类型不兼容错误。

- [ ] **Step 7: 运行前端 lint**

Run:

```bash
cd pa-eval-frontend
npm run lint
```

Expected: exit code `0`，无 ESLint error。

- [ ] **Step 8: 运行生产构建**

Run:

```bash
cd pa-eval-frontend
npm run build
```

Expected: exit code `0`，TypeScript 构建和 Vite bundle 均成功。

- [ ] **Step 9: 检查最终差异和格式，不提交代码**

Run:

```bash
git diff --check -- \
  pa-eval-frontend/src/lib/progressive-refetch-interval.ts \
  pa-eval-frontend/src/tests/progressive-refetch-interval.test.ts \
  pa-eval-frontend/src/components/common/data-table/data-table.tsx \
  pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluations.tsx

git diff -- \
  pa-eval-frontend/src/lib/progressive-refetch-interval.ts \
  pa-eval-frontend/src/tests/progressive-refetch-interval.test.ts \
  pa-eval-frontend/src/components/common/data-table/data-table.tsx \
  pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluations.tsx
```

Expected: `git diff --check` exit code `0`；差异只包含公共策略、测试、`DataTable` 类型扩展和自动评测列表接入，不修改详情页、后端、数据库、`langfuse/` 或 `dify/`。
