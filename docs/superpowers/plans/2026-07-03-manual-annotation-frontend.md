# Manual Annotation Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend mock experience for “应用评测 / 人工评测”, including task management, queue item table, standalone annotation detail page, cross-page continuous annotation, and add-to-dataset dialog.

**Architecture:** Extend the existing `app-evaluation` module instead of creating a new top-level module. Keep all mock data in `data/`, mock stateful operations in `api/`, route views in `views/`, and module-private UI in `components/`. Reuse `Page`, `PageNav`, `PageAction`, `DataTable`, `Drawer`, `FormDialog`, `Card`, `Badge`, `BaseForm`, `json-editor`, `toast`, and `confirm()`.

**Tech Stack:** React 19, TypeScript, Vite, React Router 8, React Query, TanStack Table, Tailwind CSS v4, shadcn/ui-style components, Zod, React Hook Form, Sonner.

---

## Ground Rules

- 本计划只修改 `pa-eval-frontend/` 和测试文件，不修改 `pa-eval-backend/`、`langfuse/`、数据库迁移或后端接口。
- 项目规约禁止自动提交代码。本计划不包含 `git commit` 步骤；每个任务结束用 `git status --short` 检查变更。
- Python 依赖管理规则不适用于本前端任务。
- 所有命令在 `pa-eval-frontend/` 目录执行，除非步骤明确说明在仓库根目录执行。
- 本计划不新增 shadcn/ui 底层组件；执行时优先使用 `src/components/ui/` 已有组件。

## File Structure

### Create

- `pa-eval-frontend/src/modules/app-evaluation/data/mock-annotations.ts`
  - 静态 mock 数据：score configs、项目用户、annotation queues、queue items、source snapshots、scores。
- `pa-eval-frontend/src/modules/app-evaluation/api/mock-annotation-api.ts`
  - Stateful mock API：分页查询、创建/更新/删除任务、导出、保存评分、连续标注导航、加入数据集。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-status-badge.tsx`
  - 队列 item 状态 badge。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-object-type-badge.tsx`
  - TRACE / OBSERVATION / SESSION badge。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-columns.tsx`
  - 人工评测任务列表列定义。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-row-actions.tsx`
  - 任务列表行操作菜单。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-form-drawer.tsx`
  - 新建/编辑任务抽屉表单。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-columns.tsx`
  - 队列数据列表列定义。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx`
  - 队列数据选中态批量导出和删除。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-source-panel.tsx`
  - 标注详情页左侧源对象摘要、上下文详情、历史评分。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-score-form.tsx`
  - 标注详情页右侧 score configs 表单。
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-dataset-dialog.tsx`
  - 加入数据集 Dialog。
- `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queues.tsx`
  - 人工评测任务列表页。
- `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queue-detail.tsx`
  - 任务队列详情页。
- `pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx`
  - 独立标注详情页。
- `pa-eval-frontend/src/tests/app-evaluation/mock-annotation-api.test.ts`
  - mock API 行为测试。

### Modify

- `pa-eval-frontend/src/modules/app-evaluation/types.ts`
  - 增加人工评测相关类型和 labels。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-page-nav.tsx`
  - 增加“人工评测”二级导航。
- `pa-eval-frontend/src/modules/app-evaluation/index.tsx`
  - 保持模块出口，必要时导出新增 view。
- `pa-eval-frontend/src/routes/index.tsx`
  - 挂载人工评测列表、任务详情、标注详情路由。

---

## Task 1: Mock API Test Coverage

**Files:**
- Create: `pa-eval-frontend/src/tests/app-evaluation/mock-annotation-api.test.ts`
- Later implementation target: `pa-eval-frontend/src/modules/app-evaluation/api/mock-annotation-api.ts`
- Later implementation target: `pa-eval-frontend/src/modules/app-evaluation/data/mock-annotations.ts`
- Later implementation target: `pa-eval-frontend/src/modules/app-evaluation/types.ts`

- [ ] **Step 1: Write failing mock API tests**

Create `pa-eval-frontend/src/tests/app-evaluation/mock-annotation-api.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DataTableQueryState } from '@/components/common/data-table'
import {
  addProjectAnnotationItemToDatasetMock,
  createProjectAnnotationQueueMock,
  deleteProjectAnnotationQueueItemsMock,
  exportProjectAnnotationQueueItemsMock,
  getProjectAnnotationNavigationMock,
  listProjectAnnotationQueueItemsMock,
  listProjectAnnotationQueuesMock,
  resetProjectAnnotationMocks,
  saveProjectAnnotationScoresMock,
} from '../../modules/app-evaluation/api/mock-annotation-api.ts'

const baseQuery: DataTableQueryState = {
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
}

describe('mock annotation api', () => {
  it('lists annotation queues by project and keyword', async () => {
    resetProjectAnnotationMocks()

    const all = await listProjectAnnotationQueuesMock(
      'project_customer_agent',
      baseQuery
    )
    const keyword = await listProjectAnnotationQueuesMock(
      'project_customer_agent',
      { ...baseQuery, keyword: '客服' }
    )

    assert.ok(all.total >= 2)
    assert.equal(
      all.datas.every((queue) => queue.projectId === 'project_customer_agent'),
      true
    )
    assert.equal(
      keyword.datas.every(
        (queue) =>
          queue.name.includes('客服') || queue.description.includes('客服')
      ),
      true
    )
  })

  it('creates queues with selected score configs and assignees', async () => {
    resetProjectAnnotationMocks()

    const created = await createProjectAnnotationQueueMock(
      'project_customer_agent',
      {
        name: '人工评测回归任务',
        description: '验证创建任务 mock 闭环',
        scoreConfigIds: ['score_accuracy', 'score_usability'],
        assigneeIds: ['user_annotator_a'],
      }
    )

    assert.equal(created.name, '人工评测回归任务')
    assert.deepEqual(created.scoreConfigIds, [
      'score_accuracy',
      'score_usability',
    ])
    assert.deepEqual(created.assigneeIds, ['user_annotator_a'])

    const listed = await listProjectAnnotationQueuesMock(
      'project_customer_agent',
      { ...baseQuery, keyword: '回归任务' }
    )

    assert.equal(listed.total, 1)
    assert.equal(listed.datas[0]?.id, created.id)
  })

  it('filters queue items and deletes selected items only', async () => {
    resetProjectAnnotationMocks()

    const pending = await listProjectAnnotationQueueItemsMock(
      'project_customer_agent',
      'queue_customer_quality',
      {
        ...baseQuery,
        filters: { status: ['PENDING'] },
      }
    )

    assert.ok(pending.total >= 1)
    assert.equal(
      pending.datas.every((item) => item.status === 'PENDING'),
      true
    )

    const deletedIds = pending.datas.slice(0, 2).map((item) => item.id)
    await deleteProjectAnnotationQueueItemsMock(
      'project_customer_agent',
      'queue_customer_quality',
      deletedIds
    )

    const afterDelete = await listProjectAnnotationQueueItemsMock(
      'project_customer_agent',
      'queue_customer_quality',
      baseQuery
    )

    assert.equal(
      afterDelete.datas.some((item) => deletedIds.includes(item.id)),
      false
    )
  })

  it('saves scores, marks item completed, and navigates across pages', async () => {
    resetProjectAnnotationMocks()

    const saved = await saveProjectAnnotationScoresMock(
      'project_customer_agent',
      'queue_customer_quality',
      'aqi_customer_001',
      {
        scores: [
          {
            configId: 'score_accuracy',
            value: 4,
            stringValue: '',
            comment: '答案准确',
          },
          {
            configId: 'score_usability',
            value: true,
            stringValue: '',
            comment: '可以沉淀',
          },
        ],
      }
    )

    assert.equal(saved.status, 'COMPLETED')
    assert.equal(saved.scores.length, 2)
    assert.ok(saved.completedAt)
    assert.ok(saved.completedBy)

    const navigation = await getProjectAnnotationNavigationMock(
      'project_customer_agent',
      'queue_customer_quality',
      'aqi_customer_001',
      { ...baseQuery, pageSize: 1 }
    )

    assert.equal(navigation.current.id, 'aqi_customer_001')
    assert.ok(navigation.next)
    assert.equal(navigation.total >= 2, true)
  })

  it('exports selected items and adds current item to a dataset', async () => {
    resetProjectAnnotationMocks()

    const exported = await exportProjectAnnotationQueueItemsMock(
      'project_customer_agent',
      'queue_customer_quality',
      ['aqi_customer_001', 'aqi_customer_002']
    )

    assert.equal(exported.items.length, 2)
    assert.equal(exported.queue.id, 'queue_customer_quality')

    const datasetItem = await addProjectAnnotationItemToDatasetMock(
      'project_customer_agent',
      'queue_customer_quality',
      'aqi_customer_001',
      {
        datasetId: 'dataset_customer_eval',
        input: { text: '用户要求退款' },
        expectedOutput: { answer: '解释退款流程' },
        metadata: { source: 'manual_annotation' },
      }
    )

    assert.equal(datasetItem.datasetId, 'dataset_customer_eval')
    assert.equal(datasetItem.sourceTraceId, 'trace_customer_001')
    assert.equal(datasetItem.metadata.source, 'manual_annotation')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd pa-eval-frontend
npx tsx src/tests/app-evaluation/mock-annotation-api.test.ts
```

Expected: FAIL because `mock-annotation-api.ts` does not exist.

- [ ] **Step 3: Record current status**

Run from repository root:

```bash
git status --short
```

Expected: only the new test file is untracked or modified for this task.

---

## Task 2: Annotation Types, Static Data, and Mock API

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/types.ts`
- Create: `pa-eval-frontend/src/modules/app-evaluation/data/mock-annotations.ts`
- Create: `pa-eval-frontend/src/modules/app-evaluation/api/mock-annotation-api.ts`
- Test: `pa-eval-frontend/src/tests/app-evaluation/mock-annotation-api.test.ts`

- [ ] **Step 1: Add annotation types**

Append these exports to `pa-eval-frontend/src/modules/app-evaluation/types.ts`:

```ts
export type AnnotationObjectType = 'TRACE' | 'OBSERVATION' | 'SESSION'

export type AnnotationItemStatus = 'PENDING' | 'COMPLETED'

export type ScoreDataType = 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN' | 'TEXT'

export type ProjectUserRecord = {
  id: string
  name: string
  email: string
}

export type ScoreConfigRecord = {
  id: string
  projectId: string
  name: string
  dataType: ScoreDataType
  description: string
  minValue?: number
  maxValue?: number
  categories?: string[]
  archived?: boolean
}

export type AnnotationQueueRecord = {
  id: string
  projectId: string
  name: string
  description: string
  scoreConfigIds: string[]
  assigneeIds: string[]
  completedCount: number
  pendingCount: number
  scoreConfigs: ScoreConfigRecord[]
  assignees: ProjectUserRecord[]
  createdAt: string
  updatedAt: string
}

export type AnnotationQueueFormInput = {
  name: string
  description: string
  scoreConfigIds: string[]
  assigneeIds: string[]
}

export type AnnotationScoreRecord = {
  id: string
  configId: string
  name: string
  dataType: ScoreDataType
  value: number | boolean | null
  stringValue: string
  comment: string
  authorUserId: string
  createdAt: string
  updatedAt: string
}

export type AnnotationSourceSnapshot = {
  objectId: string
  objectType: AnnotationObjectType
  title: string
  input: unknown
  output: unknown
  metadata: JsonObject
  traceId: string
  observationId: string
  sessionId: string
  userId: string
  latencyMs: number
  costUsd: number
  createdAt: string
}

export type AnnotationQueueItemRecord = {
  id: string
  projectId: string
  queueId: string
  objectId: string
  objectType: AnnotationObjectType
  status: AnnotationItemStatus
  source: AnnotationSourceSnapshot
  scores: AnnotationScoreRecord[]
  completedAt: string
  completedBy: ProjectUserRecord | null
  createdAt: string
  updatedAt: string
}

export type AnnotationQueueMetricSummary = {
  total: number
  pending: number
  completed: number
  completionRate: number
  updatedAt: string
}

export type AnnotationScoreFormInput = {
  scores: {
    configId: string
    value: number | boolean | null
    stringValue: string
    comment: string
  }[]
}

export type AddAnnotationItemToDatasetInput = {
  datasetId: string
  input: unknown
  expectedOutput: unknown
  metadata: JsonObject
}

export type AnnotationQueueExportPayload = {
  queue: AnnotationQueueRecord
  items: AnnotationQueueItemRecord[]
}

export type AnnotationNavigationResult = {
  current: AnnotationQueueItemRecord
  previous: AnnotationQueueItemRecord | null
  next: AnnotationQueueItemRecord | null
  index: number
  total: number
}

export const annotationObjectTypeLabels: Record<AnnotationObjectType, string> = {
  TRACE: 'Trace',
  OBSERVATION: 'Observation',
  SESSION: 'Session',
}

export const annotationItemStatusLabels: Record<AnnotationItemStatus, string> = {
  PENDING: '待处理',
  COMPLETED: '已完成',
}

export const scoreDataTypeLabels: Record<ScoreDataType, string> = {
  NUMERIC: '数值',
  CATEGORICAL: '分类',
  BOOLEAN: '布尔',
  TEXT: '文本',
}
```

- [ ] **Step 2: Add static mock data**

Create `pa-eval-frontend/src/modules/app-evaluation/data/mock-annotations.ts` with project `project_customer_agent`, queues `queue_customer_quality` and `queue_badcase_review`, at least 16 queue items in `queue_customer_quality`, and score configs matching the test IDs:

```ts
import type {
  AnnotationQueueItemRecord,
  AnnotationQueueRecord,
  ProjectUserRecord,
  ScoreConfigRecord,
} from '../types'

export const mockAnnotationUsers: ProjectUserRecord[] = [
  {
    id: 'user_annotator_a',
    name: '张三',
    email: 'zhangsan@example.com',
  },
  {
    id: 'user_annotator_b',
    name: '李四',
    email: 'lisi@example.com',
  },
]

export const mockScoreConfigs: ScoreConfigRecord[] = [
  {
    id: 'score_accuracy',
    projectId: 'project_customer_agent',
    name: '准确性',
    dataType: 'NUMERIC',
    description: '回答是否准确覆盖用户诉求',
    minValue: 1,
    maxValue: 5,
  },
  {
    id: 'score_usability',
    projectId: 'project_customer_agent',
    name: '是否可用',
    dataType: 'BOOLEAN',
    description: '该回答是否可直接沉淀为样本',
  },
  {
    id: 'score_error_type',
    projectId: 'project_customer_agent',
    name: '错误类型',
    dataType: 'CATEGORICAL',
    description: '人工归因错误类型',
    categories: ['意图识别错误', '事实错误', '格式错误', '无错误'],
  },
  {
    id: 'score_comment',
    projectId: 'project_customer_agent',
    name: '综合备注',
    dataType: 'TEXT',
    description: '人工标注综合说明',
  },
]

export const mockAnnotationQueues: AnnotationQueueRecord[] = [
  {
    id: 'queue_customer_quality',
    projectId: 'project_customer_agent',
    name: '客服会话质量人工评测',
    description: '客服 Agent 回复准确性与可用性人工标注',
    scoreConfigIds: ['score_accuracy', 'score_usability', 'score_error_type'],
    assigneeIds: ['user_annotator_a', 'user_annotator_b'],
    completedCount: 0,
    pendingCount: 0,
    scoreConfigs: [],
    assignees: [],
    createdAt: '2026-07-01T09:00:00.000Z',
    updatedAt: '2026-07-03T09:00:00.000Z',
  },
  {
    id: 'queue_badcase_review',
    projectId: 'project_customer_agent',
    name: '客服 Badcase 复核',
    description: '客服 badcase 数据沉淀前人工复核',
    scoreConfigIds: ['score_accuracy', 'score_comment'],
    assigneeIds: ['user_annotator_a'],
    completedCount: 0,
    pendingCount: 0,
    scoreConfigs: [],
    assignees: [],
    createdAt: '2026-07-02T09:00:00.000Z',
    updatedAt: '2026-07-03T09:30:00.000Z',
  },
]

export const mockAnnotationQueueItems: AnnotationQueueItemRecord[] =
  Array.from({ length: 16 }, (_, index) => {
    const number = String(index + 1).padStart(3, '0')
    const completed = index > 11

    return {
      id: `aqi_customer_${number}`,
      projectId: 'project_customer_agent',
      queueId: 'queue_customer_quality',
      objectId: `trace_customer_${number}`,
      objectType: index % 3 === 0 ? 'TRACE' : index % 3 === 1 ? 'OBSERVATION' : 'SESSION',
      status: completed ? 'COMPLETED' : 'PENDING',
      source: {
        objectId: `trace_customer_${number}`,
        objectType: index % 3 === 0 ? 'TRACE' : index % 3 === 1 ? 'OBSERVATION' : 'SESSION',
        title: `用户退款咨询 ${number}`,
        input: {
          userMessage: `用户要求退款并咨询订单 ${number} 的处理进度`,
        },
        output: {
          assistantMessage: '已解释退款流程，并提示预计到账时间。',
        },
        metadata: {
          channel: 'web',
          intent: 'refund',
          priority: index < 3 ? 'high' : 'normal',
        },
        traceId: `trace_customer_${number}`,
        observationId: `obs_customer_${number}`,
        sessionId: `session_customer_${Math.ceil((index + 1) / 3)}`,
        userId: `customer_${number}`,
        latencyMs: 1200 + index * 80,
        costUsd: Number((0.002 + index * 0.0001).toFixed(4)),
        createdAt: `2026-07-03T08:${String(index).padStart(2, '0')}:00.000Z`,
      },
      scores: [],
      completedAt: completed ? `2026-07-03T10:${number.slice(1)}:00.000Z` : '',
      completedBy: completed ? mockAnnotationUsers[0] : null,
      createdAt: `2026-07-03T08:${String(index).padStart(2, '0')}:00.000Z`,
      updatedAt: `2026-07-03T08:${String(index).padStart(2, '0')}:00.000Z`,
    }
  }).concat([
    {
      id: 'aqi_badcase_001',
      projectId: 'project_customer_agent',
      queueId: 'queue_badcase_review',
      objectId: 'trace_badcase_001',
      objectType: 'TRACE',
      status: 'PENDING',
      source: {
        objectId: 'trace_badcase_001',
        objectType: 'TRACE',
        title: 'Badcase 退款拒答',
        input: { userMessage: '为什么我的退款被拒绝' },
        output: { assistantMessage: '请联系人工客服。' },
        metadata: { channel: 'app', intent: 'refund' },
        traceId: 'trace_badcase_001',
        observationId: 'obs_badcase_001',
        sessionId: 'session_badcase_001',
        userId: 'customer_badcase_001',
        latencyMs: 1800,
        costUsd: 0.0031,
        createdAt: '2026-07-03T09:10:00.000Z',
      },
      scores: [],
      completedAt: '',
      completedBy: null,
      createdAt: '2026-07-03T09:10:00.000Z',
      updatedAt: '2026-07-03T09:10:00.000Z',
    },
  ])
```

- [ ] **Step 3: Implement mock API**

Create `pa-eval-frontend/src/modules/app-evaluation/api/mock-annotation-api.ts` with these exports:

```ts
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import { createProjectDatasetItemMock } from './mock-dataset-api'
import {
  mockAnnotationQueueItems,
  mockAnnotationQueues,
  mockAnnotationUsers,
  mockScoreConfigs,
} from '../data/mock-annotations'
import type {
  AddAnnotationItemToDatasetInput,
  AnnotationNavigationResult,
  AnnotationQueueExportPayload,
  AnnotationQueueFormInput,
  AnnotationQueueItemRecord,
  AnnotationQueueMetricSummary,
  AnnotationQueueRecord,
  AnnotationScoreFormInput,
  AnnotationScoreRecord,
} from '../types'

let queues = clone(mockAnnotationQueues)
let items = clone(mockAnnotationQueueItems)

const currentUser = mockAnnotationUsers[0]
const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

export function resetProjectAnnotationMocks() {
  queues = clone(mockAnnotationQueues)
  items = clone(mockAnnotationQueueItems)
}

export async function listProjectAnnotationQueuesMock(
  projectId: string,
  query: DataTableQueryState
): Promise<DataTableListResponse<AnnotationQueueRecord>> {
  await delay()
  const keyword = query.keyword.trim().toLowerCase()
  const assignees = query.filters.assigneeIds as string[] | undefined
  const pendingState = query.filters.pendingState as string[] | undefined

  const rows = queues
    .filter((queue) => queue.projectId === projectId)
    .map(hydrateQueue)
    .filter((queue) => {
      if (!keyword) return true
      return [queue.name, queue.description].join(' ').toLowerCase().includes(keyword)
    })
    .filter((queue) => {
      if (!assignees?.length) return true
      return assignees.some((id) => queue.assigneeIds.includes(id))
    })
    .filter((queue) => {
      if (!pendingState?.length) return true
      if (pendingState.includes('hasPending')) return queue.pendingCount > 0
      if (pendingState.includes('completed')) return queue.pendingCount === 0
      return true
    })

  return paginate(rows, query)
}

export async function getProjectAnnotationQueueMock(
  projectId: string,
  queueId: string
): Promise<AnnotationQueueRecord> {
  await delay()
  return hydrateQueue(findQueue(projectId, queueId))
}

export async function getProjectAnnotationQueueMetricSummaryMock(
  projectId: string,
  queueId: string
): Promise<AnnotationQueueMetricSummary> {
  await delay()
  const queueItems = listQueueItems(projectId, queueId)
  const completed = queueItems.filter((item) => item.status === 'COMPLETED').length
  const pending = queueItems.filter((item) => item.status === 'PENDING').length

  return {
    total: queueItems.length,
    pending,
    completed,
    completionRate: queueItems.length ? Math.round((completed / queueItems.length) * 100) : 0,
    updatedAt: hydrateQueue(findQueue(projectId, queueId)).updatedAt,
  }
}

export async function createProjectAnnotationQueueMock(
  projectId: string,
  input: AnnotationQueueFormInput
): Promise<AnnotationQueueRecord> {
  await delay()
  const now = new Date().toISOString()
  const queue: AnnotationQueueRecord = {
    id: `queue_${Date.now()}`,
    projectId,
    name: input.name,
    description: input.description,
    scoreConfigIds: input.scoreConfigIds,
    assigneeIds: input.assigneeIds,
    completedCount: 0,
    pendingCount: 0,
    scoreConfigs: [],
    assignees: [],
    createdAt: now,
    updatedAt: now,
  }

  queues = [queue, ...queues]
  return hydrateQueue(queue)
}

export async function updateProjectAnnotationQueueMock(
  projectId: string,
  queueId: string,
  input: AnnotationQueueFormInput
): Promise<AnnotationQueueRecord> {
  await delay()
  const index = queues.findIndex((queue) => queue.projectId === projectId && queue.id === queueId)
  if (index < 0) throw new Error('人工评测任务不存在或已不可用')

  queues[index] = {
    ...queues[index],
    name: input.name,
    description: input.description,
    scoreConfigIds: input.scoreConfigIds,
    assigneeIds: input.assigneeIds,
    updatedAt: new Date().toISOString(),
  }

  return hydrateQueue(queues[index])
}

export async function deleteProjectAnnotationQueueMock(
  projectId: string,
  queueId: string
): Promise<void> {
  await delay()
  queues = queues.filter((queue) => queue.projectId !== projectId || queue.id !== queueId)
  items = items.filter((item) => item.projectId !== projectId || item.queueId !== queueId)
}

export async function listProjectAnnotationQueueItemsMock(
  projectId: string,
  queueId: string,
  query: DataTableQueryState
): Promise<DataTableListResponse<AnnotationQueueItemRecord>> {
  await delay()
  return paginate(filterQueueItems(projectId, queueId, query), query)
}

export async function getProjectAnnotationQueueItemMock(
  projectId: string,
  queueId: string,
  itemId: string
): Promise<AnnotationQueueItemRecord> {
  await delay()
  return findQueueItem(projectId, queueId, itemId)
}

export async function getProjectAnnotationNavigationMock(
  projectId: string,
  queueId: string,
  itemId: string,
  query: DataTableQueryState
): Promise<AnnotationNavigationResult> {
  await delay()
  const rows = filterQueueItems(projectId, queueId, { ...query, page: 1, pageSize: Number.MAX_SAFE_INTEGER })
  const index = rows.findIndex((item) => item.id === itemId)
  if (index < 0) throw new Error('当前筛选条件下找不到该标注数据')

  return {
    current: rows[index],
    previous: rows[index - 1] ?? null,
    next: rows[index + 1] ?? null,
    index,
    total: rows.length,
  }
}

export async function saveProjectAnnotationScoresMock(
  projectId: string,
  queueId: string,
  itemId: string,
  input: AnnotationScoreFormInput
): Promise<AnnotationQueueItemRecord> {
  await delay()
  const index = items.findIndex(
    (item) => item.projectId === projectId && item.queueId === queueId && item.id === itemId
  )
  if (index < 0) throw new Error('标注数据不存在或已不可用')

  const now = new Date().toISOString()
  const scores: AnnotationScoreRecord[] = input.scores.map((score) => {
    const config = mockScoreConfigs.find((item) => item.id === score.configId)
    if (!config) throw new Error('评分指标不存在')
    const existing = items[index].scores.find((item) => item.configId === score.configId)

    return {
      id: existing?.id ?? `score_${Date.now()}_${score.configId}`,
      configId: score.configId,
      name: config.name,
      dataType: config.dataType,
      value: score.value,
      stringValue: score.stringValue,
      comment: score.comment,
      authorUserId: currentUser.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  })

  items[index] = {
    ...items[index],
    status: 'COMPLETED',
    scores,
    completedAt: items[index].completedAt || now,
    completedBy: currentUser,
    updatedAt: now,
  }
  touchQueue(projectId, queueId)
  return items[index]
}

export async function deleteProjectAnnotationQueueItemsMock(
  projectId: string,
  queueId: string,
  itemIds: string[]
): Promise<void> {
  await delay()
  items = items.filter(
    (item) =>
      item.projectId !== projectId ||
      item.queueId !== queueId ||
      !itemIds.includes(item.id)
  )
  touchQueue(projectId, queueId)
}

export async function exportProjectAnnotationQueueMock(
  projectId: string,
  queueId: string,
  query: DataTableQueryState
): Promise<AnnotationQueueExportPayload> {
  await delay()
  return {
    queue: hydrateQueue(findQueue(projectId, queueId)),
    items: filterQueueItems(projectId, queueId, {
      ...query,
      page: 1,
      pageSize: Number.MAX_SAFE_INTEGER,
    }),
  }
}

export async function exportProjectAnnotationQueueItemsMock(
  projectId: string,
  queueId: string,
  itemIds: string[]
): Promise<AnnotationQueueExportPayload> {
  await delay()
  return {
    queue: hydrateQueue(findQueue(projectId, queueId)),
    items: listQueueItems(projectId, queueId).filter((item) => itemIds.includes(item.id)),
  }
}

export async function addProjectAnnotationItemToDatasetMock(
  projectId: string,
  queueId: string,
  itemId: string,
  input: AddAnnotationItemToDatasetInput
) {
  await delay()
  const item = findQueueItem(projectId, queueId, itemId)
  return createProjectDatasetItemMock(projectId, input.datasetId, {
    input: input.input,
    expectedOutput: input.expectedOutput,
    metadata: {
      ...input.metadata,
      source: 'manual_annotation',
      annotationQueueId: queueId,
      annotationQueueItemId: itemId,
      annotatorUserId: currentUser.id,
      scoreIds: item.scores.map((score) => score.id),
    },
    sourceTraceId: item.source.traceId,
    sourceObservationId: item.source.observationId,
  })
}

function filterQueueItems(projectId: string, queueId: string, query: DataTableQueryState) {
  const keyword = query.keyword.trim().toLowerCase()
  const statuses = query.filters.status as string[] | undefined
  const objectTypes = query.filters.objectType as string[] | undefined
  const annotators = query.filters.completedBy as string[] | undefined

  return listQueueItems(projectId, queueId).filter((item) => {
    if (statuses?.length && !statuses.includes(item.status)) return false
    if (objectTypes?.length && !objectTypes.includes(item.objectType)) return false
    if (annotators?.length && !annotators.includes(item.completedBy?.id ?? '')) return false
    if (!keyword) return true

    return stringifySearch([
      item.id,
      item.objectId,
      item.objectType,
      item.source.title,
      item.source.input,
      item.source.output,
      item.source.metadata,
    ])
      .toLowerCase()
      .includes(keyword)
  })
}

function hydrateQueue(queue: AnnotationQueueRecord): AnnotationQueueRecord {
  const queueItems = items.filter((item) => item.projectId === queue.projectId && item.queueId === queue.id)
  return {
    ...queue,
    completedCount: queueItems.filter((item) => item.status === 'COMPLETED').length,
    pendingCount: queueItems.filter((item) => item.status === 'PENDING').length,
    scoreConfigs: mockScoreConfigs.filter((config) => queue.scoreConfigIds.includes(config.id)),
    assignees: mockAnnotationUsers.filter((user) => queue.assigneeIds.includes(user.id)),
  }
}

function findQueue(projectId: string, queueId: string) {
  const queue = queues.find((item) => item.projectId === projectId && item.id === queueId)
  if (!queue) throw new Error('人工评测任务不存在或已不可用')
  return queue
}

function findQueueItem(projectId: string, queueId: string, itemId: string) {
  const item = items.find(
    (row) => row.projectId === projectId && row.queueId === queueId && row.id === itemId
  )
  if (!item) throw new Error('标注数据不存在或已不可用')
  return item
}

function listQueueItems(projectId: string, queueId: string) {
  return items.filter((item) => item.projectId === projectId && item.queueId === queueId)
}

function touchQueue(projectId: string, queueId: string) {
  const index = queues.findIndex((queue) => queue.projectId === projectId && queue.id === queueId)
  if (index >= 0) queues[index] = { ...queues[index], updatedAt: new Date().toISOString() }
}

function paginate<T>(rows: T[], query: DataTableQueryState): DataTableListResponse<T> {
  const start = (query.page - 1) * query.pageSize
  return {
    total: rows.length,
    datas: rows.slice(start, start + query.pageSize),
  }
}

function stringifySearch(values: unknown[]) {
  return values.map((value) => JSON.stringify(value)).join(' ')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
```

- [ ] **Step 4: Run mock API tests**

Run:

```bash
cd pa-eval-frontend
npx tsx src/tests/app-evaluation/mock-annotation-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck for new types**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Record current status**

Run from repository root:

```bash
git status --short
```

Expected: new annotation type, data, API, and test files are visible; no unrelated files are modified by this task.

---

## Task 3: Evaluation Navigation and Routes

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-page-nav.tsx`
- Modify: `pa-eval-frontend/src/routes/index.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/index.tsx`
- Create later views from later tasks:
  - `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queues.tsx`
  - `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queue-detail.tsx`
  - `pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx`

- [ ] **Step 1: Add initial route view stubs**

Create these minimal files so route wiring can typecheck before full page implementation:

`pa-eval-frontend/src/modules/app-evaluation/views/annotation-queues.tsx`

```tsx
import { Page } from '@/components/common/page'
import { EvaluationPageNav } from '../components/evaluation-page-nav'

export function ProjectAnnotationQueues() {
  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav />
        <section className='rounded-lg border bg-card p-4 text-card-foreground'>
          人工评测任务列表
        </section>
      </div>
    </Page>
  )
}
```

`pa-eval-frontend/src/modules/app-evaluation/views/annotation-queue-detail.tsx`

```tsx
import { useNavigate, useParams } from 'react-router'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'

export function ProjectAnnotationQueueDetail() {
  const navigate = useNavigate()
  const { projectId = 'project_customer_agent' } = useParams()

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() =>
            navigate(`/projects/${projectId}/evaluation/annotation-queues`)
          }
        >
          <span className='text-sm font-medium'>人工评测任务详情</span>
        </PageAction>
      </div>
    </Page>
  )
}
```

`pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx`

```tsx
import { useNavigate, useParams } from 'react-router'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'

export function ProjectAnnotationItemAnnotate() {
  const navigate = useNavigate()
  const {
    projectId = 'project_customer_agent',
    queueId = '',
  } = useParams()

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() =>
            navigate(`/projects/${projectId}/evaluation/annotation-queues/${queueId}`)
          }
        >
          <span className='text-sm font-medium'>人工标注详情</span>
        </PageAction>
      </div>
    </Page>
  )
}
```

- [ ] **Step 2: Extend EvaluationPageNav**

Modify `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-page-nav.tsx`:

```tsx
import { ClipboardCheck, Database } from 'lucide-react'
import { useLocation, useParams } from 'react-router'
import { PageNav } from '@/components/common/page-nav'

type EvaluationPageNavProps = {
  buttonGroups?: React.ComponentProps<typeof PageNav>['buttonGroups']
}

export function EvaluationPageNav({ buttonGroups }: EvaluationPageNavProps) {
  const location = useLocation()
  const { projectId = 'project_customer_agent' } = useParams()
  const basePath = `/projects/${projectId}/evaluation`

  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: [
          {
            title: '数据集',
            href: `${basePath}/datasets`,
            icon: Database,
            isActive: location.pathname.startsWith(`${basePath}/datasets`),
          },
          {
            title: '人工评测',
            href: `${basePath}/annotation-queues`,
            icon: ClipboardCheck,
            isActive: location.pathname.startsWith(
              `${basePath}/annotation-queues`
            ),
          },
        ],
      }}
      buttonGroups={buttonGroups}
    />
  )
}
```

- [ ] **Step 3: Wire routes**

Modify imports in `pa-eval-frontend/src/routes/index.tsx`:

```tsx
import { ProjectAnnotationItemAnnotate } from '@/modules/app-evaluation/views/annotation-item-annotate'
import { ProjectAnnotationQueueDetail } from '@/modules/app-evaluation/views/annotation-queue-detail'
import { ProjectAnnotationQueues } from '@/modules/app-evaluation/views/annotation-queues'
```

Add children under `projects/:projectId/evaluation`:

```tsx
{ path: 'annotation-queues', element: <ProjectAnnotationQueues /> },
{
  path: 'annotation-queues/:queueId',
  element: <ProjectAnnotationQueueDetail />,
},
{
  path: 'annotation-queues/:queueId/items/:itemId/annotate',
  element: <ProjectAnnotationItemAnnotate />,
},
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Record current status**

Run from repository root:

```bash
git status --short
```

Expected: route files and initial view stubs are modified or created.

---

## Task 4: Annotation Queue List Page

**Files:**
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-columns.tsx`
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-row-actions.tsx`
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-form-drawer.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queues.tsx`

- [ ] **Step 1: Create queue row actions**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-row-actions.tsx`:

```tsx
import type { Row } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AnnotationQueueRecord } from '../types'

type AnnotationQueueRowActionsProps = {
  row: Row<AnnotationQueueRecord>
  onEdit: (queue: AnnotationQueueRecord) => void
  onDelete: (queue: AnnotationQueueRecord) => void
}

export function AnnotationQueueRowActions({
  row,
  onEdit,
  onDelete,
}: AnnotationQueueRowActionsProps) {
  const queue = row.original

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='打开人工评测任务操作菜单'>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onEdit(queue)}>
            <Pencil data-icon='inline-start' />
            编辑任务
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(queue)}>
            <Users data-icon='inline-start' />
            配置处理人
          </DropdownMenuItem>
          <DropdownMenuItem
            variant='destructive'
            onSelect={() => onDelete(queue)}
          >
            <Trash2 data-icon='inline-start' />
            删除任务
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Create queue columns**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-columns.tsx`:

```tsx
import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { LongText } from '@/components/common/long-text'
import type { AnnotationQueueRecord } from '../types'
import { scoreDataTypeLabels } from '../types'
import { formatDateTime } from './format'
import { AnnotationQueueRowActions } from './annotation-queue-row-actions'

type CreateAnnotationQueueColumnsOptions = {
  projectId: string
  onEdit: (queue: AnnotationQueueRecord) => void
  onDelete: (queue: AnnotationQueueRecord) => void
}

export function createAnnotationQueueColumns({
  projectId,
  onEdit,
  onDelete,
}: CreateAnnotationQueueColumnsOptions): ColumnDef<AnnotationQueueRecord>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Name' />
      ),
      cell: ({ row }) => (
        <Link
          to={`/projects/${projectId}/evaluation/annotation-queues/${row.original.id}`}
          className='font-medium underline-offset-4 hover:underline'
        >
          {row.original.name}
        </Link>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Description' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-72'>{row.original.description || '-'}</LongText>
      ),
    },
    {
      accessorKey: 'completedCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Completed Items' />
      ),
      cell: ({ row }) => row.original.completedCount,
    },
    {
      accessorKey: 'pendingCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Pending Items' />
      ),
      cell: ({ row }) => row.original.pendingCount,
    },
    {
      accessorKey: 'scoreConfigs',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Score Configs' />
      ),
      cell: ({ row }) => (
        <div className='flex max-w-80 flex-wrap gap-1'>
          {row.original.scoreConfigs.map((config) => (
            <Badge key={config.id} variant='secondary'>
              {config.name} · {scoreDataTypeLabels[config.dataType]}
            </Badge>
          ))}
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'assignees',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='处理人' />
      ),
      cell: ({ row }) =>
        row.original.assignees.length
          ? row.original.assignees.map((user) => user.name).join('、')
          : '-',
      enableSorting: false,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Created' />
      ),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: 'process',
      header: 'Process',
      cell: ({ row }) => (
        <Button asChild size='sm' variant='outline'>
          <Link
            to={`/projects/${projectId}/evaluation/annotation-queues/${row.original.id}`}
          >
            处理
          </Link>
        </Button>
      ),
      enableHiding: false,
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <AnnotationQueueRowActions
          row={row}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ),
    },
  ]
}
```

- [ ] **Step 3: Create queue form drawer**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-form-drawer.tsx`:

```tsx
import { useEffect } from 'react'
import { z } from 'zod'
import { Checkbox } from '@/components/ui/checkbox'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import { mockAnnotationUsers, mockScoreConfigs } from '../data/mock-annotations'
import type { AnnotationQueueFormInput, AnnotationQueueRecord } from '../types'
import { scoreDataTypeLabels } from '../types'

const annotationQueueFormSchema = z.object({
  name: z.string().min(1, '请输入任务名称'),
  description: z.string(),
  scoreConfigIds: z.array(z.string()).min(1, '请选择至少一个评分指标'),
  assigneeIds: z.array(z.string()),
})

type AnnotationQueueFormValues = z.infer<typeof annotationQueueFormSchema>

type AnnotationQueueFormDrawerProps = {
  open: boolean
  queue?: AnnotationQueueRecord | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AnnotationQueueFormInput) => Promise<void> | void
}

export function AnnotationQueueFormDrawer({
  open,
  queue,
  onOpenChange,
  onSubmit,
}: AnnotationQueueFormDrawerProps) {
  const formId = queue ? 'edit-annotation-queue-form' : 'create-annotation-queue-form'

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={queue ? '编辑人工评测任务' : '新建人工评测任务'}
      confirmText={queue ? '保存' : '创建'}
      confirmProps={{ form: formId, type: 'submit' }}
    >
      <BaseForm
        key={queue?.id ?? 'new'}
        id={formId}
        schema={annotationQueueFormSchema}
        defaultValues={getDefaultValues(queue)}
        onSubmit={async (values) => {
          await onSubmit(values)
          onOpenChange(false)
        }}
        className='flex flex-col gap-4'
      >
        {(form) => {
          useEffect(() => {
            form.reset(getDefaultValues(queue))
          }, [form])

          return (
            <>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>任务名称</FormLabel>
                    <FormControl>
                      <Input placeholder='例如：客服会话质量人工评测' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>任务描述</FormLabel>
                    <FormControl>
                      <Textarea placeholder='说明任务目标和标注范围' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='scoreConfigIds'
                render={() => (
                  <FormItem>
                    <FormLabel>评分指标</FormLabel>
                    <FormDescription>
                      标注详情页会按所选指标生成评分表单。
                    </FormDescription>
                    <div className='flex flex-col gap-2'>
                      {mockScoreConfigs.map((config) => (
                        <FormField
                          key={config.id}
                          control={form.control}
                          name='scoreConfigIds'
                          render={({ field }) => (
                            <FormItem className='flex items-center gap-2'>
                              <FormControl>
                                <Checkbox
                                  checked={field.value.includes(config.id)}
                                  onCheckedChange={(checked) => {
                                    const next = checked
                                      ? [...field.value, config.id]
                                      : field.value.filter((id) => id !== config.id)
                                    field.onChange(next)
                                  }}
                                />
                              </FormControl>
                              <FormLabel className='font-normal'>
                                {config.name} · {scoreDataTypeLabels[config.dataType]}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='assigneeIds'
                render={() => (
                  <FormItem>
                    <FormLabel>处理人</FormLabel>
                    <div className='flex flex-col gap-2'>
                      {mockAnnotationUsers.map((user) => (
                        <FormField
                          key={user.id}
                          control={form.control}
                          name='assigneeIds'
                          render={({ field }) => (
                            <FormItem className='flex items-center gap-2'>
                              <FormControl>
                                <Checkbox
                                  checked={field.value.includes(user.id)}
                                  onCheckedChange={(checked) => {
                                    const next = checked
                                      ? [...field.value, user.id]
                                      : field.value.filter((id) => id !== user.id)
                                    field.onChange(next)
                                  }}
                                />
                              </FormControl>
                              <FormLabel className='font-normal'>
                                {user.name}（{user.email}）
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />
            </>
          )
        }}
      </BaseForm>
    </Drawer>
  )
}

function getDefaultValues(
  queue?: AnnotationQueueRecord | null
): AnnotationQueueFormValues {
  return {
    name: queue?.name ?? '',
    description: queue?.description ?? '',
    scoreConfigIds: queue?.scoreConfigIds ?? [],
    assigneeIds: queue?.assigneeIds ?? [],
  }
}
```

- [ ] **Step 4: Replace task list page stub**

Replace `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queues.tsx` with a full DataTable page:

```tsx
import { useCallback, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Page } from '@/components/common/page'
import {
  DataTable,
  type DataTableFilterBinding,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  createProjectAnnotationQueueMock,
  deleteProjectAnnotationQueueMock,
  listProjectAnnotationQueuesMock,
  updateProjectAnnotationQueueMock,
} from '../api/mock-annotation-api'
import { AnnotationQueueFormDrawer } from '../components/annotation-queue-form-drawer'
import { createAnnotationQueueColumns } from '../components/annotation-queue-columns'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import type { AnnotationQueueFormInput, AnnotationQueueRecord } from '../types'

const queueUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'assigneeIds', type: 'array' },
  { fieldId: 'pendingState', type: 'array' },
]

const queueToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'pendingState',
    title: '处理状态',
    options: [
      { label: '包含待处理', value: 'hasPending' },
      { label: '全部完成', value: 'completed' },
    ],
  },
  {
    columnId: 'assigneeIds',
    title: '处理人',
    options: [
      { label: '张三', value: 'user_annotator_a' },
      { label: '李四', value: 'user_annotator_b' },
    ],
  },
]

export function ProjectAnnotationQueues() {
  const { projectId = 'project_customer_agent' } = useParams()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingQueue, setEditingQueue] = useState<AnnotationQueueRecord | null>(null)

  const invalidateQueues = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      }),
    [projectId, queryClient]
  )

  const columns = useMemo(
    () =>
      createAnnotationQueueColumns({
        projectId,
        onEdit: (queue) => {
          setEditingQueue(queue)
          setFormOpen(true)
        },
        onDelete: (queue) => {
          void handleDeleteQueue(projectId, queue, invalidateQueues)
        },
      }),
    [invalidateQueues, projectId]
  )

  const handleSubmitQueue = async (input: AnnotationQueueFormInput) => {
    if (editingQueue) {
      await updateProjectAnnotationQueueMock(projectId, editingQueue.id, input)
      toast.success('人工评测任务已更新')
    } else {
      await createProjectAnnotationQueueMock(projectId, input)
      toast.success('人工评测任务已创建')
    }
    await invalidateQueues()
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav
          buttonGroups={{
            buttons: [
              {
                id: 'create',
                label: '新建人工评测任务',
                icon: Plus,
                iconPosition: 'start',
                size: 'sm',
                onClick: () => {
                  setEditingQueue(null)
                  setFormOpen(true)
                },
              },
            ],
          }}
        />
        <section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable<AnnotationQueueRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => ['project-annotation-queues', projectId, state],
              queryFn: (state) => listProjectAnnotationQueuesMock(projectId, state),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: queueUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '按任务名称或描述搜索',
              filters: queueToolbarFilters,
              columnLabels: {
                name: 'Name',
                description: 'Description',
                completedCount: 'Completed Items',
                pendingCount: 'Pending Items',
                scoreConfigs: 'Score Configs',
                assignees: '处理人',
                createdAt: 'Created',
              },
            }}
            loadingText={
              <Loading
                text='加载人工评测任务中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前项目下暂无匹配的人工评测任务'
            minTableWidth={1280}
          />
        </section>
      </div>
      <AnnotationQueueFormDrawer
        open={formOpen}
        queue={editingQueue}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmitQueue}
      />
    </Page>
  )
}

async function handleDeleteQueue(
  projectId: string,
  queue: AnnotationQueueRecord,
  onDeleted: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '删除人工评测任务',
    desc: `删除后将移除「${queue.name}」及其 mock 队列数据，不会删除源对象、历史评分或数据集项。确定继续吗？`,
    confirmText: '删除',
    destructive: true,
  })

  if (!confirmed) return

  await deleteProjectAnnotationQueueMock(projectId, queue.id)
  await onDeleted()
  toast.success(`已删除人工评测任务：${queue.name}`)
}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Record current status**

Run from repository root:

```bash
git status --short
```

Expected: queue list page and its module-private components are modified or created.

---

## Task 5: Annotation Queue Detail Page

**Files:**
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-status-badge.tsx`
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-object-type-badge.tsx`
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-columns.tsx`
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queue-detail.tsx`

- [ ] **Step 1: Create badge components**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-status-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import type { AnnotationItemStatus } from '../types'
import { annotationItemStatusLabels } from '../types'

type AnnotationStatusBadgeProps = {
  status: AnnotationItemStatus
}

export function AnnotationStatusBadge({ status }: AnnotationStatusBadgeProps) {
  return (
    <Badge variant={status === 'COMPLETED' ? 'default' : 'secondary'}>
      {annotationItemStatusLabels[status]}
    </Badge>
  )
}
```

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-object-type-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import type { AnnotationObjectType } from '../types'
import { annotationObjectTypeLabels } from '../types'

type AnnotationObjectTypeBadgeProps = {
  objectType: AnnotationObjectType
}

export function AnnotationObjectTypeBadge({
  objectType,
}: AnnotationObjectTypeBadgeProps) {
  return (
    <Badge variant='outline'>
      {annotationObjectTypeLabels[objectType]}
    </Badge>
  )
}
```

- [ ] **Step 2: Create queue item columns**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-columns.tsx`:

```tsx
import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { LongText } from '@/components/common/long-text'
import type { AnnotationQueueItemRecord } from '../types'
import { formatDateTime } from './format'
import { AnnotationObjectTypeBadge } from './annotation-object-type-badge'
import { AnnotationStatusBadge } from './annotation-status-badge'

type CreateAnnotationQueueItemColumnsOptions = {
  projectId: string
  queueId: string
  onDelete: (item: AnnotationQueueItemRecord) => void
}

export function createAnnotationQueueItemColumns({
  projectId,
  queueId,
  onDelete,
}: CreateAnnotationQueueItemColumnsOptions): ColumnDef<AnnotationQueueItemRecord>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='全选标注数据'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='选择标注数据'
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Id' />
      ),
      cell: ({ row }) => (
        <Link
          to={`/projects/${projectId}/evaluation/annotation-queues/${queueId}/items/${row.original.id}/annotate`}
          className='font-mono text-xs underline-offset-4 hover:underline'
        >
          {row.original.id}
        </Link>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'objectType',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Type' />
      ),
      cell: ({ row }) => (
        <AnnotationObjectTypeBadge objectType={row.original.objectType} />
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'source.title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Source' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-64'>{row.original.source.title}</LongText>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'objectId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Source ID' />
      ),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.objectId}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <AnnotationStatusBadge status={row.original.status} />,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'completedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Completed At' />
      ),
      cell: ({ row }) =>
        row.original.completedAt ? formatDateTime(row.original.completedAt) : '-',
    },
    {
      accessorKey: 'completedBy',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Completed by' />
      ),
      cell: ({ row }) => row.original.completedBy?.name ?? '-',
      enableSorting: false,
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex items-center justify-end gap-2'>
          <Button asChild size='sm' variant='outline'>
            <Link
              to={`/projects/${projectId}/evaluation/annotation-queues/${queueId}/items/${row.original.id}/annotate`}
            >
              {row.original.status === 'COMPLETED' ? '查看/编辑' : '标注'}
            </Link>
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            onClick={() => onDelete(row.original)}
          >
            删除
          </Button>
        </div>
      ),
    },
  ]
}
```

- [ ] **Step 3: Create bulk actions**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx`:

```tsx
import type { Table } from '@tanstack/react-table'
import { Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { DataTableBulkActions } from '@/components/common/data-table'
import {
  deleteProjectAnnotationQueueItemsMock,
  exportProjectAnnotationQueueItemsMock,
} from '../api/mock-annotation-api'
import type { AnnotationQueueItemRecord } from '../types'
import { downloadJson } from './format'

type AnnotationQueueItemBulkActionsProps = {
  table: Table<AnnotationQueueItemRecord>
  projectId: string
  queueId: string
  onChanged: () => Promise<unknown>
}

export function AnnotationQueueItemBulkActions({
  table,
  projectId,
  queueId,
  onChanged,
}: AnnotationQueueItemBulkActionsProps) {
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const itemIds = selectedRows.map((row) => row.original.id)

  const handleExport = async () => {
    const payload = await exportProjectAnnotationQueueItemsMock(
      projectId,
      queueId,
      itemIds
    )
    downloadJson(
      `annotation-items-${queueId}-${payload.items.length}-${Date.now()}.json`,
      payload
    )
    toast.success(`已导出 ${payload.items.length} 条标注数据`)
  }

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: '删除选中标注数据',
      desc: `将仅移除 ${itemIds.length} 条 mock 队列数据，不删除源对象、历史评分或数据集项。确定继续吗？`,
      confirmText: '删除',
      destructive: true,
    })

    if (!confirmed) return

    await deleteProjectAnnotationQueueItemsMock(projectId, queueId, itemIds)
    await onChanged()
    table.resetRowSelection()
    toast.success(`已删除 ${itemIds.length} 条标注数据`)
  }

  return (
    <DataTableBulkActions table={table} entityName='标注数据'>
      <Button
        type='button'
        size='sm'
        variant='outline'
        onClick={() => {
          void handleExport()
        }}
      >
        <Download data-icon='inline-start' />
        导出选中
      </Button>
      <Button
        type='button'
        size='sm'
        variant='destructive'
        onClick={() => {
          void handleDelete()
        }}
      >
        <Trash2 data-icon='inline-start' />
        删除选中
      </Button>
    </DataTableBulkActions>
  )
}
```

- [ ] **Step 4: Replace queue detail page**

Replace `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queue-detail.tsx` with a full page using `DataTable`, `PageAction`, metric cards, and `bulkActions`. Use exact filter keys from the mock API: `status`, `objectType`, `completedBy`.

Use these toolbar filters:

```ts
const itemToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'status',
    title: '状态',
    options: [
      { label: '待处理', value: 'PENDING' },
      { label: '已完成', value: 'COMPLETED' },
    ],
  },
  {
    columnId: 'objectType',
    title: '类型',
    options: [
      { label: 'Trace', value: 'TRACE' },
      { label: 'Observation', value: 'OBSERVATION' },
      { label: 'Session', value: 'SESSION' },
    ],
  },
  {
    columnId: 'completedBy',
    title: '完成人',
    options: [
      { label: '张三', value: 'user_annotator_a' },
      { label: '李四', value: 'user_annotator_b' },
    ],
  },
]
```

The page must:

- Fetch queue detail via `getProjectAnnotationQueueMock`.
- Fetch metrics via `getProjectAnnotationQueueMetricSummaryMock`.
- Export all via `exportProjectAnnotationQueueMock(projectId, queueId, dataTableQueryStateLikeValue)`.
- Use `DataTable` URL filters:

```ts
const itemUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'status', type: 'array' },
  { fieldId: 'objectType', type: 'array' },
  { fieldId: 'completedBy', type: 'array' },
]
```

- Keep the table section as:

```tsx
<section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
```

- Set `DataTable` `className='min-h-0 flex-1'` and `minTableWidth={1320}`.

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Record current status**

Run from repository root:

```bash
git status --short
```

Expected: queue detail page and queue item components are modified or created.

---

## Task 6: Standalone Annotation Detail Page

**Files:**
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-source-panel.tsx`
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-score-form.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx`

- [ ] **Step 1: Create source panel**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-source-panel.tsx`:

```tsx
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { JsonEditor } from '@/components/common/json-editor'
import type { AnnotationQueueItemRecord } from '../types'
import { formatDateTime } from './format'
import { AnnotationObjectTypeBadge } from './annotation-object-type-badge'
import { AnnotationStatusBadge } from './annotation-status-badge'

type AnnotationSourcePanelProps = {
  item: AnnotationQueueItemRecord
}

export function AnnotationSourcePanel({ item }: AnnotationSourcePanelProps) {
  return (
    <div className='flex min-h-0 flex-col gap-3'>
      <Collapsible defaultOpen>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between'>
            <CardTitle className='text-sm'>源对象摘要</CardTitle>
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>展开/收起</Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className='grid gap-3 text-sm md:grid-cols-3'>
              <InfoItem label='Source ID' value={item.objectId} mono />
              <InfoItem
                label='类型'
                value={<AnnotationObjectTypeBadge objectType={item.objectType} />}
              />
              <InfoItem
                label='状态'
                value={<AnnotationStatusBadge status={item.status} />}
              />
              <InfoItem label='Session' value={item.source.sessionId || '-'} mono />
              <InfoItem label='User' value={item.source.userId || '-'} mono />
              <InfoItem label='创建时间' value={formatDateTime(item.createdAt)} />
              <InfoItem label='Latency' value={`${item.source.latencyMs} ms`} />
              <InfoItem label='Cost' value={`$${item.source.costUsd}`} />
              <InfoItem label='标题' value={item.source.title} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible defaultOpen className='min-h-0 flex-1'>
        <Card className='flex min-h-0 flex-1 flex-col'>
          <CardHeader className='flex flex-row items-center justify-between'>
            <CardTitle className='text-sm'>上下文详情</CardTitle>
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>展开/收起</Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent className='min-h-0 flex-1'>
            <CardContent className='grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2'>
              <div className='min-h-0'>
                <div className='text-muted-foreground mb-2 text-xs font-medium'>
                  Input
                </div>
                <div className='h-64 overflow-auto rounded-md border p-2'>
                  <JsonEditor value={item.source.input} readOnly />
                </div>
              </div>
              <div className='min-h-0'>
                <div className='text-muted-foreground mb-2 text-xs font-medium'>
                  Output
                </div>
                <div className='h-64 overflow-auto rounded-md border p-2'>
                  <JsonEditor value={item.source.output} readOnly />
                </div>
              </div>
              <div className='min-h-0 md:col-span-2'>
                <div className='text-muted-foreground mb-2 text-xs font-medium'>
                  Metadata
                </div>
                <div className='h-32 overflow-auto rounded-md border p-2'>
                  <JsonEditor value={item.source.metadata} readOnly />
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between'>
            <CardTitle className='text-sm'>历史人工评分</CardTitle>
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>展开/收起</Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className='flex flex-col gap-2 text-sm'>
              {item.scores.length ? (
                item.scores.map((score) => (
                  <div key={score.id} className='rounded-md border p-2'>
                    <div className='font-medium'>{score.name}</div>
                    <div className='text-muted-foreground'>
                      {String(score.value ?? score.stringValue || '-')}
                    </div>
                    <div>{score.comment || '-'}</div>
                  </div>
                ))
              ) : (
                <div className='text-muted-foreground'>暂无历史人工评分</div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className={mono ? 'truncate font-mono text-xs' : 'truncate'}>
        {value}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create score form**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-score-form.tsx`:

```tsx
import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import type {
  AnnotationQueueItemRecord,
  AnnotationScoreFormInput,
  ScoreConfigRecord,
} from '../types'
import { scoreDataTypeLabels } from '../types'

const scoreFormSchema = z.object({
  scores: z.array(
    z.object({
      configId: z.string(),
      value: z.union([z.number(), z.boolean(), z.null()]),
      stringValue: z.string(),
      comment: z.string(),
    })
  ),
})

type ScoreFormValues = z.infer<typeof scoreFormSchema>

type AnnotationScoreFormProps = {
  item: AnnotationQueueItemRecord
  scoreConfigs: ScoreConfigRecord[]
  onAddToDataset: () => void
  onSubmit: (input: AnnotationScoreFormInput, mode: 'save' | 'saveNext') => Promise<void>
}

export function AnnotationScoreForm({
  item,
  scoreConfigs,
  onAddToDataset,
  onSubmit,
}: AnnotationScoreFormProps) {
  const formId = `annotation-score-form-${item.id}`

  return (
    <BaseForm
      key={item.id}
      id={formId}
      schema={scoreFormSchema}
      defaultValues={getDefaultValues(item, scoreConfigs)}
      onSubmit={(values) => onSubmit(values, 'save')}
      className='flex min-h-0 flex-1 flex-col'
    >
      {(form) => (
        <>
          <div className='min-h-0 flex-1 overflow-auto p-4'>
            <div className='flex flex-col gap-4'>
              {scoreConfigs.map((config, index) => (
                <div key={config.id} className='rounded-lg border p-3'>
                  <div className='mb-3'>
                    <div className='font-medium'>{config.name}</div>
                    <div className='text-muted-foreground text-xs'>
                      {scoreDataTypeLabels[config.dataType]} · {config.description}
                    </div>
                  </div>
                  <ScoreValueField index={index} config={config} form={form} />
                  <FormField
                    control={form.control}
                    name={`scores.${index}.comment`}
                    render={({ field }) => (
                      <FormItem className='mt-3'>
                        <FormLabel>备注</FormLabel>
                        <FormControl>
                          <Textarea placeholder='填写该指标的标注备注' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className='flex shrink-0 justify-end gap-2 border-t p-4'>
            <Button type='button' variant='outline' onClick={onAddToDataset}>
              加入数据集
            </Button>
            <Button type='submit' variant='outline'>
              保存
            </Button>
            <Button
              type='button'
              onClick={() => {
                void form.handleSubmit((values) => onSubmit(values, 'saveNext'))()
              }}
            >
              保存并下一条
            </Button>
          </div>
        </>
      )}
    </BaseForm>
  )
}

function ScoreValueField({
  index,
  config,
  form,
}: {
  index: number
  config: ScoreConfigRecord
  form: UseFormReturn<ScoreFormValues>
}) {
  if (config.dataType === 'NUMERIC') {
    return (
      <FormField
        control={form.control}
        name={`scores.${index}.value`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>评分值</FormLabel>
            <FormControl>
              <Input
                type='number'
                min={config.minValue}
                max={config.maxValue}
                value={typeof field.value === 'number' ? field.value : ''}
                onChange={(event) =>
                  field.onChange(
                    event.target.value ? Number(event.target.value) : null
                  )
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  if (config.dataType === 'BOOLEAN') {
    return (
      <FormField
        control={form.control}
        name={`scores.${index}.value`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>评分值</FormLabel>
            <FormControl>
              <RadioGroup
                value={field.value === true ? 'true' : field.value === false ? 'false' : ''}
                onValueChange={(value) => field.onChange(value === 'true')}
              >
                <FormItem className='flex items-center gap-2'>
                  <FormControl>
                    <RadioGroupItem value='true' />
                  </FormControl>
                  <FormLabel className='font-normal'>是</FormLabel>
                </FormItem>
                <FormItem className='flex items-center gap-2'>
                  <FormControl>
                    <RadioGroupItem value='false' />
                  </FormControl>
                  <FormLabel className='font-normal'>否</FormLabel>
                </FormItem>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  return (
    <FormField
      control={form.control}
      name={`scores.${index}.stringValue`}
      render={({ field }) => (
        <FormItem>
          <FormLabel>评分值</FormLabel>
          <FormControl>
            {config.dataType === 'TEXT' ? (
              <Textarea placeholder='填写文本评分' {...field} />
            ) : (
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                {(config.categories ?? []).map((category) => (
                  <FormItem key={category} className='flex items-center gap-2'>
                    <FormControl>
                      <RadioGroupItem value={category} />
                    </FormControl>
                    <FormLabel className='font-normal'>{category}</FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function getDefaultValues(
  item: AnnotationQueueItemRecord,
  scoreConfigs: ScoreConfigRecord[]
): ScoreFormValues {
  return {
    scores: scoreConfigs.map((config) => {
      const existing = item.scores.find((score) => score.configId === config.id)
      return {
        configId: config.id,
        value: existing?.value ?? null,
        stringValue: existing?.stringValue ?? '',
        comment: existing?.comment ?? '',
      }
    }),
  }
}
```

- [ ] **Step 3: Replace annotation detail view**

Replace `pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx` with:

```tsx
import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { Loading } from '@/components/common/loading'
import {
  getProjectAnnotationNavigationMock,
  getProjectAnnotationQueueMock,
  saveProjectAnnotationScoresMock,
} from '../api/mock-annotation-api'
import { AnnotationScoreForm } from '../components/annotation-score-form'
import { AnnotationSourcePanel } from '../components/annotation-source-panel'
import type { AnnotationScoreFormInput } from '../types'

export function ProjectAnnotationItemAnnotate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const {
    projectId = 'project_customer_agent',
    queueId = '',
    itemId = '',
  } = useParams()
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)

  const queryState = useMemo(
    () => ({
      page: 1,
      pageSize: Number(searchParams.get('pageSize') ?? 10),
      keyword: searchParams.get('keyword') ?? '',
      filters: {
        status: searchParams.getAll('status'),
        objectType: searchParams.getAll('objectType'),
        completedBy: searchParams.getAll('completedBy'),
      },
      sorting: [],
    }),
    [searchParams]
  )

  const queueQuery = useQuery({
    queryKey: ['project-annotation-queue', projectId, queueId],
    queryFn: () => getProjectAnnotationQueueMock(projectId, queueId),
    enabled: Boolean(queueId),
  })

  const navigationQuery = useQuery({
    queryKey: [
      'project-annotation-navigation',
      projectId,
      queueId,
      itemId,
      queryState,
    ],
    queryFn: () =>
      getProjectAnnotationNavigationMock(projectId, queueId, itemId, queryState),
    enabled: Boolean(queueId && itemId),
  })

  const invalidateAnnotation = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-navigation', projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-items', projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-metrics', projectId, queueId],
        }),
      ]),
    [projectId, queueId, queryClient]
  )

  const navigation = navigationQuery.data
  const item = navigation?.current
  const queue = queueQuery.data

  const goToItem = (nextItemId: string) => {
    navigate({
      pathname: `/projects/${projectId}/evaluation/annotation-queues/${queueId}/items/${nextItemId}/annotate`,
      search: searchParams.toString(),
    })
  }

  const handleSubmit = async (
    input: AnnotationScoreFormInput,
    mode: 'save' | 'saveNext'
  ) => {
    await saveProjectAnnotationScoresMock(projectId, queueId, itemId, input)
    await invalidateAnnotation()

    if (mode === 'saveNext') {
      const nextNavigation = await getProjectAnnotationNavigationMock(
        projectId,
        queueId,
        itemId,
        queryState
      )
      if (nextNavigation.next) {
        toast.success('评分已保存，已进入下一条')
        goToItem(nextNavigation.next.id)
      } else {
        toast.success('当前结果集已完成，请返回队列选择新的筛选条件或任务')
      }
      return
    }

    toast.success('评分已保存')
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() =>
            navigate(`/projects/${projectId}/evaluation/annotation-queues/${queueId}`)
          }
          buttonGroups={{
            buttons: [
              {
                id: 'previous',
                label: '上一条',
                icon: ArrowLeft,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                disabled: !navigation?.previous,
                onClick: () => {
                  if (navigation?.previous) goToItem(navigation.previous.id)
                },
              },
              {
                id: 'next',
                label: '下一条',
                icon: ArrowRight,
                iconPosition: 'end',
                variant: 'outline',
                size: 'sm',
                disabled: !navigation?.next,
                onClick: () => {
                  if (navigation?.next) goToItem(navigation.next.id)
                },
              },
            ],
          }}
        >
          {item ? (
            <div className='flex min-w-0 flex-wrap items-center gap-2 text-sm'>
              <span className='font-medium'>{item.id}</span>
              <span className='text-muted-foreground'>
                第 {navigation.index + 1} / {navigation.total} 条
              </span>
              <span className='text-muted-foreground'>{queue?.name}</span>
            </div>
          ) : null}
        </PageAction>

        {navigationQuery.isLoading || queueQuery.isLoading ? (
          <Loading text='加载标注详情中...' className='flex-1' />
        ) : null}

        {item && queue ? (
          <section className='grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,.85fr)]'>
            <AnnotationSourcePanel item={item} />
            <div className='flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground'>
              <div className='shrink-0 border-b p-4'>
                <div className='text-muted-foreground text-xs'>人工标注表单</div>
                <h2 className='text-base font-semibold'>评分指标</h2>
              </div>
              <AnnotationScoreForm
                item={item}
                scoreConfigs={queue.scoreConfigs}
                onAddToDataset={() => setDatasetDialogOpen(true)}
                onSubmit={handleSubmit}
              />
            </div>
          </section>
        ) : null}
      </div>
    </Page>
  )
}
```

The next task adds `AnnotationDatasetDialog` into this page. Execute Task 7 before running `npm run lint`, so the dialog open state is used by the final integrated page.

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS after any required import/type adjustment.

- [ ] **Step 5: Record current status**

Run from repository root:

```bash
git status --short
```

Expected: standalone annotation detail files are modified or created.

---

## Task 7: Add-to-Dataset Dialog and Detail Integration

**Files:**
- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-dataset-dialog.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx`
- Uses existing: `pa-eval-frontend/src/modules/app-evaluation/api/mock-dataset-api.ts`
- Uses existing: `pa-eval-frontend/src/modules/app-evaluation/api/mock-annotation-api.ts`

- [ ] **Step 1: Create add-to-dataset dialog**

Create `pa-eval-frontend/src/modules/app-evaluation/components/annotation-dataset-dialog.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BaseForm } from '@/components/common/base-form'
import { FormDialog } from '@/components/common/form-dialog'
import { JsonEditor } from '@/components/common/json-editor'
import type { DataTableQueryState } from '@/components/common/data-table'
import { listProjectDatasetsMock } from '../api/mock-dataset-api'
import type {
  AddAnnotationItemToDatasetInput,
  AnnotationQueueItemRecord,
} from '../types'

const addToDatasetSchema = z.object({
  datasetId: z.string().min(1, '请选择目标数据集'),
  input: z.unknown(),
  expectedOutput: z.unknown(),
  metadata: z.record(z.string(), z.unknown()),
})

type AddToDatasetValues = z.infer<typeof addToDatasetSchema>

type AnnotationDatasetDialogProps = {
  open: boolean
  projectId: string
  queueId: string
  item: AnnotationQueueItemRecord
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AddAnnotationItemToDatasetInput) => Promise<void> | void
}

const datasetQuery: DataTableQueryState = {
  page: 1,
  pageSize: 100,
  keyword: '',
  filters: {},
  sorting: [],
}

export function AnnotationDatasetDialog({
  open,
  projectId,
  queueId,
  item,
  onOpenChange,
  onSubmit,
}: AnnotationDatasetDialogProps) {
  const formId = `annotation-dataset-form-${item.id}`
  const datasetsQuery = useQuery({
    queryKey: ['project-datasets', projectId, 'annotation-dialog'],
    queryFn: () => listProjectDatasetsMock(projectId, datasetQuery, 'all'),
    enabled: open,
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title='加入数据集'
      description='选择目标数据集，并确认写入数据集的数据内容。'
      size='lg'
      confirmText='确认加入'
      confirmProps={{ type: 'submit', form: formId }}
      bodyProps={{ className: 'max-h-[70vh] overflow-auto' }}
    >
      <BaseForm
        key={`${item.id}-${open}`}
        id={formId}
        schema={addToDatasetSchema}
        defaultValues={getDefaultValues(queueId, item)}
        onSubmit={async (values) => {
          await onSubmit(values)
          onOpenChange(false)
        }}
        className='flex flex-col gap-4'
      >
        {(form) => (
          <>
            <FormField
              control={form.control}
              name='datasetId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目标数据集</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='选择数据集' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {(datasetsQuery.data?.datas ?? []).map((dataset) => (
                          <SelectItem key={dataset.id} value={dataset.id}>
                            {dataset.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='input'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Input</FormLabel>
                  <FormControl>
                    <div className='h-40 overflow-auto rounded-md border p-2'>
                      <JsonEditor value={field.value} onChange={field.onChange} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='expectedOutput'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected Output</FormLabel>
                  <FormControl>
                    <div className='h-40 overflow-auto rounded-md border p-2'>
                      <JsonEditor value={field.value} onChange={field.onChange} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='metadata'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metadata</FormLabel>
                  <FormControl>
                    <div className='h-40 overflow-auto rounded-md border p-2'>
                      <JsonEditor value={field.value} onChange={field.onChange} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      </BaseForm>
    </FormDialog>
  )
}

function getDefaultValues(
  queueId: string,
  item: AnnotationQueueItemRecord
): AddToDatasetValues {
  return {
    datasetId: '',
    input: item.source.input,
    expectedOutput: item.source.output,
    metadata: {
      source: 'manual_annotation',
      annotationQueueId: queueId,
      annotationQueueItemId: item.id,
      annotatorUserId: item.completedBy?.id ?? '',
      scoreIds: item.scores.map((score) => score.id),
    },
  }
}
```

- [ ] **Step 2: Integrate dialog into annotation detail**

Modify `pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx`:

Add imports:

```tsx
import { addProjectAnnotationItemToDatasetMock } from '../api/mock-annotation-api'
import { AnnotationDatasetDialog } from '../components/annotation-dataset-dialog'
import type { AddAnnotationItemToDatasetInput } from '../types'
```

Add handler inside component:

```tsx
const handleAddToDataset = async (input: AddAnnotationItemToDatasetInput) => {
  await addProjectAnnotationItemToDatasetMock(projectId, queueId, itemId, input)
  await queryClient.invalidateQueries({
    queryKey: ['project-datasets', projectId],
  })
  toast.success('已加入数据集')
}
```

Render after the main page content, guarded by `item`:

```tsx
{item ? (
  <AnnotationDatasetDialog
    open={datasetDialogOpen}
    projectId={projectId}
    queueId={queueId}
    item={item}
    onOpenChange={setDatasetDialogOpen}
    onSubmit={handleAddToDataset}
  />
) : null}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Record current status**

Run from repository root:

```bash
git status --short
```

Expected: add-to-dataset dialog and detail integration are modified or created.

---

## Task 8: Final Verification and Polish

**Files:**
- Review all files created or modified in prior tasks.

- [ ] **Step 1: Run mock API test**

Run:

```bash
cd pa-eval-frontend
npx tsx src/tests/app-evaluation/mock-annotation-api.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
cd pa-eval-frontend
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run build**

Run:

```bash
cd pa-eval-frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual browser verification with mock dev server**

Run:

```bash
cd pa-eval-frontend
npm run dev:mock
```

Expected: Vite prints a local URL such as `http://localhost:5173/`.

Open:

```text
http://localhost:5173/projects/project_customer_agent/evaluation/annotation-queues
```

Verify:

- “应用评测”下出现“数据集”和“人工评测”二级导航。
- 人工评测任务列表可以搜索、筛选、列显隐。
- 新建人工评测任务抽屉可以创建任务。
- 点击任务名称或“处理”进入任务详情。
- 任务详情页指标卡显示总量、待处理、已完成、完成率。
- 队列数据表格支持搜索、状态筛选、类型筛选、完成人筛选、列显隐、分页。
- 选中队列数据后出现批量导出和删除。
- 点击数据项进入独立标注详情页。
- 标注详情页为左信息、右表单双栏布局。
- 上一条、下一条可跨分页推进。
- 保存并下一条保存当前评分后进入下一条。
- 结果集末尾提示“当前结果集已完成，请返回队列选择新的筛选条件或任务”。
- 加入数据集 Dialog 可以选择数据集并保存。
- 返回队列后仍能看到原任务详情页。

- [ ] **Step 6: Stop dev server**

When the dev server is running in the current terminal, stop it with `Ctrl-C`.

- [ ] **Step 7: Final status**

Run from repository root:

```bash
git status --short
```

Expected: only intended frontend implementation files, test file, spec file, and plan file are modified or untracked.

---

## Self-Review Checklist

- Spec coverage:
  - Task list page: Task 4.
  - Queue detail page: Task 5.
  - Standalone annotation detail page: Task 6.
  - Cross-page continuous annotation: Task 2 API and Task 6 detail view.
  - Add-to-dataset Dialog: Task 7.
  - DataTable reuse and stable table layout: Task 4 and Task 5.
  - Mock-only frontend scope: all tasks stay under `pa-eval-frontend/`.
- Placeholder scan:
  - Do not leave incomplete markers or unfinished sections in code.
  - Do not leave route stub content after Tasks 4, 5, and 6.
- Type consistency:
  - Filter keys are `status`, `objectType`, `completedBy` for queue items.
  - Queue task filter keys are `assigneeIds`, `pendingState`.
  - Navigation API accepts `DataTableQueryState` and returns `AnnotationNavigationResult`.
  - Save score form submits `AnnotationScoreFormInput`.
- Project rule check:
  - Do not run `git commit` unless the user explicitly asks.
  - Do not modify `langfuse/`.
  - Do not add backend or database files.
