# Auto Evaluation and Evaluation Report Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend mock experience for “应用评测 / 自动评测” and “应用评测 / 评测报告”, including task management, task detail report entry, report list, report detail, export, regenerate, and dataset flowback mock interactions.

**Architecture:** Extend the existing `app-evaluation` module instead of creating new top-level modules. Keep static mock seeds in `data/`, stateful mock operations in `api/`, route views in `views/`, and module-private UI in `components/`. Automatic evaluation task detail links to report detail by `reportId`; full report content and flowback operations live only under the report pages.

**Tech Stack:** React 19, TypeScript, Vite, React Router 8, React Query, TanStack Table, Tailwind CSS v4, shadcn/ui-style components, Radix UI, lucide-react, Sonner.

---

## Ground Rules

- 本计划只修改 `pa-eval-frontend/` 和 `src/tests/`，不修改 `pa-eval-backend/`、`langfuse/`、数据库迁移或后端接口。
- 项目规约禁止自动提交代码。本计划不包含 `git commit` 步骤；每个任务结束用 `git status --short` 检查变更。
- 所有命令在 `pa-eval-frontend/` 目录执行，除非步骤明确说明在仓库根目录执行。
- 不新增 shadcn/ui 底层组件；优先复用 `src/components/ui/`、`src/components/common/`、`DataTable`、`Page`、`PageNav`、`PageAction`、`confirm`、`toast`。
- 自动评测详情页不展示完整报告正文，只展示最新报告摘要、生成状态和跳转入口。
- 报告列表和报告详情都是“应用评测”的子页面，路径使用 `/projects/:projectId/evaluation/reports`。

## File Structure

### Create

- `pa-eval-frontend/src/modules/app-evaluation/data/mock-auto-evaluations.ts`
  - 静态 mock 自动评测任务、评估器、数据源和运行记录种子数据。
- `pa-eval-frontend/src/modules/app-evaluation/data/mock-evaluation-reports.ts`
  - 静态 mock 报告、badcase、评测数据、回流历史种子数据。
- `pa-eval-frontend/src/modules/app-evaluation/api/mock-auto-evaluation-api.ts`
  - 自动评测任务 mock API：列表、统计、详情、创建、删除、重新跑、刷新、最新报告摘要。
- `pa-eval-frontend/src/modules/app-evaluation/api/mock-evaluation-report-api.ts`
  - 报告 mock API：列表、详情、导出、重新生成、badcase、评测数据、回流预览、执行回流、回流历史。
- `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-status-badge.tsx`
  - 自动评测任务状态 Badge。
- `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-columns.tsx`
  - 自动评测任务列表列定义。
- `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-row-actions.tsx`
  - 自动评测任务行操作：查看、重新跑、删除。
- `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-summary-cards.tsx`
  - 自动评测列表顶部状态统计。
- `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-run-records.tsx`
  - 自动评测详情运行记录展示。
- `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-report-card.tsx`
  - 自动评测详情最新报告摘要、状态和跳转入口。
- `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-task-form.tsx`
  - 新建自动评测三步表单容器。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-status-badge.tsx`
  - 报告状态 Badge。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-source-badge.tsx`
  - 报告来源 Badge：自动评测 / 人工评测。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-columns.tsx`
  - 报告列表列定义。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-row-actions.tsx`
  - 报告列表行操作：查看、导出、重新生成、回流入口。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-summary.tsx`
  - 报告详情摘要和核心指标。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-analysis.tsx`
  - 报告详情分组分析、分布、风险限制、改进建议。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-badcase-table.tsx`
  - 报告详情 badcase 明细 DataTable。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-item-table.tsx`
  - 报告详情全量评测数据 DataTable。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-flowback-dialog.tsx`
  - badcase / 评测数据回流复用 Dialog。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-report-flowback-history.tsx`
  - 报告详情回流历史。
- `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluations.tsx`
  - 自动评测任务列表页。
- `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluation-detail.tsx`
  - 自动评测任务详情页。
- `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluation-new.tsx`
  - 新建自动评测任务页。
- `pa-eval-frontend/src/modules/app-evaluation/views/evaluation-reports.tsx`
  - 评测报告列表页。
- `pa-eval-frontend/src/modules/app-evaluation/views/evaluation-report-detail.tsx`
  - 评测报告详情页。
- `pa-eval-frontend/src/tests/app-evaluation/mock-auto-evaluation-api.test.ts`
  - 自动评测 mock API 行为测试。
- `pa-eval-frontend/src/tests/app-evaluation/mock-evaluation-report-api.test.ts`
  - 报告 mock API 行为测试。

### Modify

- `pa-eval-frontend/src/modules/app-evaluation/types.ts`
  - 增加自动评测和评测报告类型、labels、状态枚举。
- `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-page-nav.tsx`
  - 增加“自动评测”和“评测报告”导航链接。
- `pa-eval-frontend/src/routes/index.tsx`
  - 挂载自动评测列表、新建、详情、报告列表、报告详情路由。

---

## Task 1: Types and Mock API Tests

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/types.ts`
- Create: `pa-eval-frontend/src/tests/app-evaluation/mock-auto-evaluation-api.test.ts`
- Create: `pa-eval-frontend/src/tests/app-evaluation/mock-evaluation-report-api.test.ts`

- [ ] **Step 1: Add automatic evaluation and report types**

Modify `pa-eval-frontend/src/modules/app-evaluation/types.ts` by appending these exports after the existing app-evaluation types:

```ts
export type AutoEvaluationTaskStatus =
  | 'DRAFT'
  | 'READY'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type AutoEvaluationEvaluatorType = 'LLM_AS_JUDGE' | 'CODE'

export type AutoEvaluationDataSourceType = 'DATASET' | 'TRACE_FILTER'

export type EvaluationReportSourceType = 'AUTO_EVAL' | 'MANUAL_ANNOTATION'

export type EvaluationReportStatus = 'GENERATING' | 'READY' | 'FAILED'

export type EvaluationReportFlowbackType = 'BADCASE' | 'EVALUATION_DATA'

export type EvaluationReportFlowbackStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL_FAILED'
  | 'FAILED'

export type AutoEvaluationEvaluatorSummary = {
  id: string
  name: string
  type: AutoEvaluationEvaluatorType
  version: string
}

export type AutoEvaluationDataSourceSummary = {
  type: AutoEvaluationDataSourceType
  name: string
  sampleCount: number
}

export type AutoEvaluationExecutionStats = {
  pending: number
  running: number
  completed: number
  failed: number
  cancelled: number
}

export type AutoEvaluationLatestReportSummary = {
  id: string
  title: string
  status: EvaluationReportStatus
  generatedAt: string
  sampleCount: number
  badcaseCount: number
  summary: string
  errorMessage?: string
}

export type AutoEvaluationTaskRecord = {
  id: string
  projectId: string
  name: string
  description: string
  scoreName: string
  status: AutoEvaluationTaskStatus
  evaluator: AutoEvaluationEvaluatorSummary
  dataSource: AutoEvaluationDataSourceSummary
  sampleRate: number
  executionStats: AutoEvaluationExecutionStats
  badcaseCount: number
  createdBy: string
  createdAt: string
  lastRunAt: string
  updatedAt: string
  latestReport?: AutoEvaluationLatestReportSummary
}

export type MockAutoEvaluationEvaluator = AutoEvaluationEvaluatorSummary & {
  variables: string[]
  description: string
  updatedAt: string
}

export type MockAutoEvaluationDataset = {
  id: string
  name: string
  description: string
  itemCount: number
  updatedAt: string
}

export type AutoEvaluationRunRecord = {
  id: string
  projectId: string
  taskId: string
  status: Exclude<AutoEvaluationTaskStatus, 'DRAFT' | 'READY'>
  sampleCount: number
  completedCount: number
  failedCount: number
  badcaseCount: number
  startedAt: string
  endedAt: string
  durationText: string
  errorMessage?: string
}

export type AutoEvaluationTaskFormInput = {
  name: string
  description: string
  scoreName: string
  evaluatorId: string
  variableMapping: Record<string, string>
  dataSource:
    | { type: 'DATASET'; datasetId: string }
    | {
        type: 'TRACE_FILTER'
        timeRange: string
        environments: string[]
        traceName: string
        userId: string
        sessionId: string
        tags: string[]
        estimatedCount: number
      }
  sampleRate: number
  badcase: {
    enabled: boolean
    scoreName: string
    operator: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ'
    threshold: number | null
  }
}

export type EvaluationReportRecord = {
  id: string
  projectId: string
  title: string
  sourceType: EvaluationReportSourceType
  sourceTaskId: string
  sourceTaskName: string
  status: EvaluationReportStatus
  sampleCount: number
  badcaseCount: number
  flowbackCount: number
  generatedAt: string
  summary: string
  errorMessage?: string
}

export type EvaluationReportBadcaseRecord = {
  id: string
  reportId: string
  traceId: string
  observationId: string
  datasetItemId: string
  scoreName: string
  scoreValue: number
  reason: string
  comment: string
  sourceType: EvaluationReportSourceType
  flowbackStatus: 'NONE' | 'FLOWED_BACK'
}

export type EvaluationReportItemRecord = {
  id: string
  reportId: string
  sourceId: string
  scoreSummary: string
  resultType: 'normal' | 'badcase'
  executionStatus: string
  datasetFlowbackStatus: 'NONE' | 'FLOWED_BACK'
}

export type EvaluationReportFlowbackRecord = {
  id: string
  reportId: string
  flowbackType: EvaluationReportFlowbackType
  targetDatasetId: string
  targetDatasetName: string
  targetDatasetCreated: boolean
  requestedCount: number
  successCount: number
  failedCount: number
  status: EvaluationReportFlowbackStatus
  createdBy: string
  createdAt: string
  errorDetail: { itemId: string; reason: string }[]
}

export type EvaluationReportDetailRecord = EvaluationReportRecord & {
  metrics: {
    averageScore: number
    passRate: number
    failureRate: number
    badcaseRate: number
  }
  distribution: { label: string; count: number }[]
  groupAnalysis: { group: string; sampleCount: number; averageScore: number }[]
  recommendations: string[]
  risks: string[]
  reproduction: {
    reportId: string
    sourceTaskId: string
    scoreName: string
    generatedConfig: string
  }
}

export type EvaluationReportFlowbackInput = {
  flowbackType: EvaluationReportFlowbackType
  range: 'ALL' | 'CURRENT_FILTER' | 'BADCASE_ONLY' | 'SELECTED'
  selectedItemIds: string[]
  targetDataset:
    | { mode: 'EXISTING'; datasetId: string }
    | { mode: 'CREATE'; name: string; description: string }
  dedupeStrategy: 'SKIP_DUPLICATE' | 'CREATE_VERSION'
}

export const autoEvaluationStatusLabels: Record<
  AutoEvaluationTaskStatus,
  string
> = {
  DRAFT: '未运行',
  READY: '待运行',
  RUNNING: '运行中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
}

export const autoEvaluationEvaluatorTypeLabels: Record<
  AutoEvaluationEvaluatorType,
  string
> = {
  LLM_AS_JUDGE: 'LLM-as-Judge',
  CODE: 'Code',
}

export const autoEvaluationDataSourceLabels: Record<
  AutoEvaluationDataSourceType,
  string
> = {
  DATASET: '数据集',
  TRACE_FILTER: 'Trace 过滤',
}

export const evaluationReportSourceTypeLabels: Record<
  EvaluationReportSourceType,
  string
> = {
  AUTO_EVAL: '自动评测',
  MANUAL_ANNOTATION: '人工评测',
}

export const evaluationReportStatusLabels: Record<
  EvaluationReportStatus,
  string
> = {
  GENERATING: '生成中',
  READY: '已生成',
  FAILED: '生成失败',
}
```

- [ ] **Step 2: Write automatic evaluation mock API tests**

Create `pa-eval-frontend/src/tests/app-evaluation/mock-auto-evaluation-api.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DataTableQueryState } from '@/components/common/data-table'
import {
  createProjectAutoEvaluationTaskMock,
  getProjectAutoEvaluationLatestReportMock,
  listProjectAutoEvaluationTasksMock,
  refreshProjectAutoEvaluationTaskMock,
  rerunProjectAutoEvaluationTaskMock,
  resetProjectAutoEvaluationMocks,
} from '../../modules/app-evaluation/api/mock-auto-evaluation-api.ts'

const baseQuery: DataTableQueryState = {
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
}

describe('mock auto evaluation api', () => {
  it('lists tasks by project, keyword, and status', async () => {
    resetProjectAutoEvaluationMocks()

    const all = await listProjectAutoEvaluationTasksMock(
      'project_customer_agent',
      baseQuery,
      'all'
    )
    const filtered = await listProjectAutoEvaluationTasksMock(
      'project_customer_agent',
      { ...baseQuery, keyword: '客服' },
      'COMPLETED'
    )

    assert.ok(all.total >= 4)
    assert.equal(
      filtered.datas.every(
        (task) => task.name.includes('客服') && task.status === 'COMPLETED'
      ),
      true
    )
  })

  it('creates a running task and then refreshes it to a report-ready task', async () => {
    resetProjectAutoEvaluationMocks()

    const created = await createProjectAutoEvaluationTaskMock(
      'project_customer_agent',
      {
        name: '回归自动评测任务',
        description: '验证自动评测创建并运行',
        scoreName: 'answer_quality_regression',
        evaluatorId: 'evaluator_answer_quality',
        variableMapping: {
          input: 'trace.input',
          output: 'trace.output',
          expected_output: 'dataset.expectedOutput',
        },
        dataSource: { type: 'DATASET', datasetId: 'dataset_customer_qa' },
        sampleRate: 100,
        badcase: {
          enabled: true,
          scoreName: 'answer_quality_regression',
          operator: 'LTE',
          threshold: 0.6,
        },
      },
      'run'
    )

    assert.equal(created.status, 'RUNNING')

    const refreshed = await refreshProjectAutoEvaluationTaskMock(
      'project_customer_agent',
      created.id
    )
    assert.equal(refreshed.status, 'COMPLETED')

    const report = await getProjectAutoEvaluationLatestReportMock(
      'project_customer_agent',
      created.id
    )
    assert.equal(report?.status, 'READY')
    assert.equal(report?.sampleCount, refreshed.dataSource.sampleCount)
  })

  it('reruns completed task and hides latest report until refresh completes', async () => {
    resetProjectAutoEvaluationMocks()

    const list = await listProjectAutoEvaluationTasksMock(
      'project_customer_agent',
      baseQuery,
      'COMPLETED'
    )
    const task = list.datas[0]
    assert.ok(task)

    const running = await rerunProjectAutoEvaluationTaskMock(
      'project_customer_agent',
      task.id
    )
    assert.equal(running.status, 'RUNNING')

    const reportWhileRunning = await getProjectAutoEvaluationLatestReportMock(
      'project_customer_agent',
      task.id
    )
    assert.equal(reportWhileRunning?.status, 'GENERATING')
  })
})
```

- [ ] **Step 3: Write evaluation report mock API tests**

Create `pa-eval-frontend/src/tests/app-evaluation/mock-evaluation-report-api.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DataTableQueryState } from '@/components/common/data-table'
import {
  createProjectEvaluationReportFlowbackMock,
  exportProjectEvaluationReportMock,
  getProjectEvaluationReportMock,
  listProjectEvaluationReportBadcasesMock,
  listProjectEvaluationReportFlowbacksMock,
  listProjectEvaluationReportsMock,
  previewProjectEvaluationReportFlowbackMock,
  regenerateProjectEvaluationReportMock,
  resetProjectEvaluationReportMocks,
} from '../../modules/app-evaluation/api/mock-evaluation-report-api.ts'

const baseQuery: DataTableQueryState = {
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
}

describe('mock evaluation report api', () => {
  it('lists reports by source type and keyword', async () => {
    resetProjectEvaluationReportMocks()

    const reports = await listProjectEvaluationReportsMock(
      'project_customer_agent',
      {
        ...baseQuery,
        keyword: '客服',
        filters: { sourceType: ['AUTO_EVAL'] },
      }
    )

    assert.ok(reports.total >= 1)
    assert.equal(
      reports.datas.every(
        (report) =>
          report.sourceType === 'AUTO_EVAL' &&
          (report.title.includes('客服') ||
            report.sourceTaskName.includes('客服'))
      ),
      true
    )
  })

  it('gets report detail and exports markdown', async () => {
    resetProjectEvaluationReportMocks()

    const reports = await listProjectEvaluationReportsMock(
      'project_customer_agent',
      baseQuery
    )
    const ready = reports.datas.find((report) => report.status === 'READY')
    assert.ok(ready)

    const detail = await getProjectEvaluationReportMock(
      'project_customer_agent',
      ready.id
    )
    const exported = await exportProjectEvaluationReportMock(
      'project_customer_agent',
      ready.id,
      'markdown'
    )

    assert.equal(detail.id, ready.id)
    assert.match(exported.content, /# /)
    assert.equal(exported.filename.endsWith('.md'), true)
  })

  it('regenerates report and refreshes to ready', async () => {
    resetProjectEvaluationReportMocks()

    const reports = await listProjectEvaluationReportsMock(
      'project_customer_agent',
      baseQuery
    )
    const ready = reports.datas.find((report) => report.status === 'READY')
    assert.ok(ready)

    const generating = await regenerateProjectEvaluationReportMock(
      'project_customer_agent',
      ready.id
    )
    assert.equal(generating.status, 'GENERATING')

    const refreshed = await getProjectEvaluationReportMock(
      'project_customer_agent',
      ready.id
    )
    assert.equal(refreshed.status, 'READY')
  })

  it('previews and executes badcase flowback', async () => {
    resetProjectEvaluationReportMocks()

    const reports = await listProjectEvaluationReportsMock(
      'project_customer_agent',
      {
        ...baseQuery,
        filters: { hasBadcase: ['true'] },
      }
    )
    const report = reports.datas[0]
    assert.ok(report)

    const badcases = await listProjectEvaluationReportBadcasesMock(
      'project_customer_agent',
      report.id,
      baseQuery
    )
    assert.ok(badcases.total >= 1)

    const preview = await previewProjectEvaluationReportFlowbackMock(
      'project_customer_agent',
      report.id,
      {
        flowbackType: 'BADCASE',
        range: 'SELECTED',
        selectedItemIds: badcases.datas.slice(0, 2).map((item) => item.id),
        targetDataset: {
          mode: 'CREATE',
          name: 'badcase-自动评测-回归-20260703',
          description: '来自评测报告的 badcase 回流数据',
        },
        dedupeStrategy: 'SKIP_DUPLICATE',
      }
    )

    assert.equal(preview.willCreateCount > 0, true)

    const flowback = await createProjectEvaluationReportFlowbackMock(
      'project_customer_agent',
      report.id,
      {
        flowbackType: 'BADCASE',
        range: 'SELECTED',
        selectedItemIds: badcases.datas.slice(0, 2).map((item) => item.id),
        targetDataset: {
          mode: 'CREATE',
          name: preview.defaultDatasetName,
          description: '来自评测报告的 badcase 回流数据',
        },
        dedupeStrategy: 'SKIP_DUPLICATE',
      }
    )

    const history = await listProjectEvaluationReportFlowbacksMock(
      'project_customer_agent',
      report.id
    )

    assert.equal(flowback.status, 'COMPLETED')
    assert.equal(history.some((item) => item.id === flowback.id), true)
  })
})
```

- [ ] **Step 4: Run typecheck and verify tests fail because mock APIs do not exist**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: FAIL with missing module errors for `mock-auto-evaluation-api` and `mock-evaluation-report-api`.

---

## Task 2: Static Mock Data and Mock API Implementation

**Files:**
- Create: `pa-eval-frontend/src/modules/app-evaluation/data/mock-auto-evaluations.ts`
- Create: `pa-eval-frontend/src/modules/app-evaluation/data/mock-evaluation-reports.ts`
- Create: `pa-eval-frontend/src/modules/app-evaluation/api/mock-auto-evaluation-api.ts`
- Create: `pa-eval-frontend/src/modules/app-evaluation/api/mock-evaluation-report-api.ts`
- Test: `pa-eval-frontend/src/tests/app-evaluation/mock-auto-evaluation-api.test.ts`
- Test: `pa-eval-frontend/src/tests/app-evaluation/mock-evaluation-report-api.test.ts`

- [ ] **Step 1: Create automatic evaluation static mock data**

Create `pa-eval-frontend/src/modules/app-evaluation/data/mock-auto-evaluations.ts` with exported constants:

```ts
import type {
  AutoEvaluationRunRecord,
  AutoEvaluationTaskRecord,
  MockAutoEvaluationDataset,
  MockAutoEvaluationEvaluator,
} from '../types'

export const mockAutoEvaluationEvaluators: MockAutoEvaluationEvaluator[] = [
  {
    id: 'evaluator_answer_quality',
    name: '客服回答质量评估器',
    type: 'LLM_AS_JUDGE',
    version: 'v3',
    variables: ['input', 'output', 'expected_output'],
    description: '从准确性、完整性和语气判断客服回答质量',
    updatedAt: '2026-07-03T08:30:00.000Z',
  },
  {
    id: 'evaluator_safety_guardrail',
    name: '安全合规评估器',
    type: 'LLM_AS_JUDGE',
    version: 'v2',
    variables: ['input', 'output'],
    description: '识别拒答、敏感信息和不合规回复',
    updatedAt: '2026-07-02T18:10:00.000Z',
  },
  {
    id: 'evaluator_exact_match',
    name: '标准答案匹配评估器',
    type: 'CODE',
    version: 'v1',
    variables: ['output', 'expected_output'],
    description: '基于规则比较输出与期望答案',
    updatedAt: '2026-07-01T12:15:00.000Z',
  },
]

export const mockAutoEvaluationDatasets: MockAutoEvaluationDataset[] = [
  {
    id: 'dataset_customer_qa',
    name: '客服问答评测集',
    description: '覆盖售前、售后和退款场景',
    itemCount: 120,
    updatedAt: '2026-07-03T06:40:00.000Z',
  },
  {
    id: 'dataset_safety_cases',
    name: '安全合规样本集',
    description: '敏感信息、越权请求和风险表达样本',
    itemCount: 64,
    updatedAt: '2026-07-02T09:20:00.000Z',
  },
]

export const mockAutoEvaluationTasks: AutoEvaluationTaskRecord[] = [
  {
    id: 'auto_eval_customer_quality',
    projectId: 'project_customer_agent',
    name: '客服回答质量自动评测',
    description: '每日检查客服 Agent 回答质量',
    scoreName: 'answer_quality',
    status: 'COMPLETED',
    evaluator: {
      id: 'evaluator_answer_quality',
      name: '客服回答质量评估器',
      type: 'LLM_AS_JUDGE',
      version: 'v3',
    },
    dataSource: {
      type: 'DATASET',
      name: '客服问答评测集',
      sampleCount: 120,
    },
    sampleRate: 100,
    executionStats: {
      pending: 0,
      running: 0,
      completed: 116,
      failed: 4,
      cancelled: 0,
    },
    badcaseCount: 14,
    createdBy: '张三',
    createdAt: '2026-07-01T10:00:00.000Z',
    lastRunAt: '2026-07-03T09:00:00.000Z',
    updatedAt: '2026-07-03T09:20:00.000Z',
    latestReport: {
      id: 'report_auto_customer_quality',
      title: '客服回答质量自动评测报告',
      status: 'READY',
      generatedAt: '2026-07-03T09:25:00.000Z',
      sampleCount: 120,
      badcaseCount: 14,
      summary: '整体通过率稳定，退款场景仍有低分样本。',
    },
  },
  {
    id: 'auto_eval_safety_running',
    projectId: 'project_customer_agent',
    name: '安全合规自动评测',
    description: '评估敏感信息和越权回复风险',
    scoreName: 'safety_score',
    status: 'RUNNING',
    evaluator: {
      id: 'evaluator_safety_guardrail',
      name: '安全合规评估器',
      type: 'LLM_AS_JUDGE',
      version: 'v2',
    },
    dataSource: {
      type: 'TRACE_FILTER',
      name: '生产环境近 24 小时 Trace',
      sampleCount: 80,
    },
    sampleRate: 50,
    executionStats: {
      pending: 28,
      running: 8,
      completed: 4,
      failed: 0,
      cancelled: 0,
    },
    badcaseCount: 0,
    createdBy: '李四',
    createdAt: '2026-07-03T08:10:00.000Z',
    lastRunAt: '2026-07-03T08:30:00.000Z',
    updatedAt: '2026-07-03T08:45:00.000Z',
  },
  {
    id: 'auto_eval_exact_ready',
    projectId: 'project_customer_agent',
    name: '标准答案匹配自动评测',
    description: '基于规则检查固定答案场景',
    scoreName: 'exact_match',
    status: 'READY',
    evaluator: {
      id: 'evaluator_exact_match',
      name: '标准答案匹配评估器',
      type: 'CODE',
      version: 'v1',
    },
    dataSource: {
      type: 'DATASET',
      name: '客服问答评测集',
      sampleCount: 120,
    },
    sampleRate: 30,
    executionStats: {
      pending: 36,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    badcaseCount: 0,
    createdBy: '王五',
    createdAt: '2026-07-02T11:30:00.000Z',
    lastRunAt: '',
    updatedAt: '2026-07-02T11:30:00.000Z',
  },
  {
    id: 'auto_eval_refund_failed',
    projectId: 'project_customer_agent',
    name: '退款场景自动评测',
    description: 'Trace 过滤得到的退款相关对话',
    scoreName: 'refund_policy_quality',
    status: 'FAILED',
    evaluator: {
      id: 'evaluator_answer_quality',
      name: '客服回答质量评估器',
      type: 'LLM_AS_JUDGE',
      version: 'v3',
    },
    dataSource: {
      type: 'TRACE_FILTER',
      name: 'Trace Name 包含 refund',
      sampleCount: 42,
    },
    sampleRate: 100,
    executionStats: {
      pending: 0,
      running: 0,
      completed: 20,
      failed: 22,
      cancelled: 0,
    },
    badcaseCount: 6,
    createdBy: '赵六',
    createdAt: '2026-07-02T15:00:00.000Z',
    lastRunAt: '2026-07-02T15:20:00.000Z',
    updatedAt: '2026-07-02T15:25:00.000Z',
  },
]

export const mockAutoEvaluationRuns: AutoEvaluationRunRecord[] = [
  {
    id: 'run_auto_customer_quality_001',
    projectId: 'project_customer_agent',
    taskId: 'auto_eval_customer_quality',
    status: 'COMPLETED',
    sampleCount: 120,
    completedCount: 116,
    failedCount: 4,
    badcaseCount: 14,
    startedAt: '2026-07-03T09:00:00.000Z',
    endedAt: '2026-07-03T09:20:00.000Z',
    durationText: '20 分钟',
  },
  {
    id: 'run_auto_safety_001',
    projectId: 'project_customer_agent',
    taskId: 'auto_eval_safety_running',
    status: 'RUNNING',
    sampleCount: 40,
    completedCount: 4,
    failedCount: 0,
    badcaseCount: 0,
    startedAt: '2026-07-03T08:30:00.000Z',
    endedAt: '',
    durationText: '运行中',
  },
]
```

- [ ] **Step 2: Create report static mock data**

Create `pa-eval-frontend/src/modules/app-evaluation/data/mock-evaluation-reports.ts`:

```ts
import type {
  EvaluationReportBadcaseRecord,
  EvaluationReportDetailRecord,
  EvaluationReportFlowbackRecord,
  EvaluationReportItemRecord,
} from '../types'

export const mockEvaluationReports: EvaluationReportDetailRecord[] = [
  {
    id: 'report_auto_customer_quality',
    projectId: 'project_customer_agent',
    title: '客服回答质量自动评测报告',
    sourceType: 'AUTO_EVAL',
    sourceTaskId: 'auto_eval_customer_quality',
    sourceTaskName: '客服回答质量自动评测',
    status: 'READY',
    sampleCount: 120,
    badcaseCount: 14,
    flowbackCount: 8,
    generatedAt: '2026-07-03T09:25:00.000Z',
    summary: '整体通过率稳定，退款场景仍有低分样本。',
    metrics: {
      averageScore: 0.82,
      passRate: 0.88,
      failureRate: 0.03,
      badcaseRate: 0.12,
    },
    distribution: [
      { label: '0-0.4', count: 6 },
      { label: '0.4-0.6', count: 8 },
      { label: '0.6-0.8', count: 28 },
      { label: '0.8-1.0', count: 78 },
    ],
    groupAnalysis: [
      { group: '售前咨询', sampleCount: 40, averageScore: 0.89 },
      { group: '退款场景', sampleCount: 32, averageScore: 0.71 },
      { group: '物流查询', sampleCount: 48, averageScore: 0.84 },
    ],
    recommendations: [
      '补充退款政策边界样本，降低低分集中度。',
      '将 badcase 回流到数据集后重新验证 prompt。',
    ],
    risks: ['退款场景样本覆盖不足，当前结论不代表全部售后场景。'],
    reproduction: {
      reportId: 'report_auto_customer_quality',
      sourceTaskId: 'auto_eval_customer_quality',
      scoreName: 'answer_quality',
      generatedConfig: 'dataset=客服问答评测集; sampleRate=100%; threshold<=0.6',
    },
  },
  {
    id: 'report_manual_refund_quality',
    projectId: 'project_customer_agent',
    title: '退款场景人工评测报告',
    sourceType: 'MANUAL_ANNOTATION',
    sourceTaskId: 'queue_customer_quality',
    sourceTaskName: '客服质量人工评测',
    status: 'READY',
    sampleCount: 56,
    badcaseCount: 9,
    flowbackCount: 5,
    generatedAt: '2026-07-03T10:10:00.000Z',
    summary: '人工标注显示退款场景答案一致性偏低。',
    metrics: {
      averageScore: 0.76,
      passRate: 0.81,
      failureRate: 0,
      badcaseRate: 0.16,
    },
    distribution: [
      { label: '低分', count: 9 },
      { label: '中等', count: 20 },
      { label: '高分', count: 27 },
    ],
    groupAnalysis: [
      { group: '张三', sampleCount: 30, averageScore: 0.78 },
      { group: '李四', sampleCount: 26, averageScore: 0.74 },
    ],
    recommendations: ['统一退款政策评分口径，补充标注说明。'],
    risks: ['标注人数量较少，一致性指标只作为参考。'],
    reproduction: {
      reportId: 'report_manual_refund_quality',
      sourceTaskId: 'queue_customer_quality',
      scoreName: 'manual_quality',
      generatedConfig: 'annotationQueue=客服质量人工评测',
    },
  },
]

export const mockEvaluationReportBadcases: EvaluationReportBadcaseRecord[] = [
  {
    id: 'badcase_auto_001',
    reportId: 'report_auto_customer_quality',
    traceId: 'trace_refund_001',
    observationId: 'obs_refund_001',
    datasetItemId: 'dataset_item_001',
    scoreName: 'answer_quality',
    scoreValue: 0.42,
    reason: 'answer_quality <= 0.6',
    comment: '未解释退款时效',
    sourceType: 'AUTO_EVAL',
    flowbackStatus: 'FLOWED_BACK',
  },
  {
    id: 'badcase_auto_002',
    reportId: 'report_auto_customer_quality',
    traceId: 'trace_refund_002',
    observationId: 'obs_refund_002',
    datasetItemId: 'dataset_item_002',
    scoreName: 'answer_quality',
    scoreValue: 0.51,
    reason: 'answer_quality <= 0.6',
    comment: '回答遗漏政策限制',
    sourceType: 'AUTO_EVAL',
    flowbackStatus: 'NONE',
  },
]

export const mockEvaluationReportItems: EvaluationReportItemRecord[] = [
  {
    id: 'report_item_auto_001',
    reportId: 'report_auto_customer_quality',
    sourceId: 'trace_refund_001',
    scoreSummary: 'answer_quality=0.42',
    resultType: 'badcase',
    executionStatus: 'COMPLETED',
    datasetFlowbackStatus: 'FLOWED_BACK',
  },
  {
    id: 'report_item_auto_002',
    reportId: 'report_auto_customer_quality',
    sourceId: 'trace_shipping_001',
    scoreSummary: 'answer_quality=0.91',
    resultType: 'normal',
    executionStatus: 'COMPLETED',
    datasetFlowbackStatus: 'NONE',
  },
]

export const mockEvaluationReportFlowbacks: EvaluationReportFlowbackRecord[] = [
  {
    id: 'flowback_auto_001',
    reportId: 'report_auto_customer_quality',
    flowbackType: 'BADCASE',
    targetDatasetId: 'dataset_badcase_customer_quality',
    targetDatasetName: 'badcase-自动评测-客服回答质量自动评测-20260703',
    targetDatasetCreated: true,
    requestedCount: 8,
    successCount: 8,
    failedCount: 0,
    status: 'COMPLETED',
    createdBy: '张三',
    createdAt: '2026-07-03T09:40:00.000Z',
    errorDetail: [],
  },
]
```

- [ ] **Step 3: Implement automatic evaluation mock API**

Create `pa-eval-frontend/src/modules/app-evaluation/api/mock-auto-evaluation-api.ts` with these exported functions and behavior:

```ts
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import {
  mockAutoEvaluationDatasets,
  mockAutoEvaluationEvaluators,
  mockAutoEvaluationRuns,
  mockAutoEvaluationTasks,
} from '../data/mock-auto-evaluations'
import type {
  AutoEvaluationLatestReportSummary,
  AutoEvaluationRunRecord,
  AutoEvaluationTaskFormInput,
  AutoEvaluationTaskRecord,
  MockAutoEvaluationDataset,
  MockAutoEvaluationEvaluator,
} from '../types'

type AutoEvaluationStatusFilter =
  | 'all'
  | AutoEvaluationTaskRecord['status']
  | 'NOT_STARTED'
  | 'HAS_BADCASE'

let tasks = clone(mockAutoEvaluationTasks)
let runs = clone(mockAutoEvaluationRuns)

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

export function resetProjectAutoEvaluationMocks() {
  tasks = clone(mockAutoEvaluationTasks)
  runs = clone(mockAutoEvaluationRuns)
}

export async function listProjectAutoEvaluationTasksMock(
  projectId: string,
  query: DataTableQueryState,
  statusFilter: AutoEvaluationStatusFilter = 'all'
): Promise<DataTableListResponse<AutoEvaluationTaskRecord>> {
  await delay()
  const keyword = query.keyword.trim().toLowerCase()
  const rows = tasks
    .filter((task) => task.projectId === projectId)
    .filter((task) => {
      if (!keyword) return true
      return [task.name, task.description].join(' ').toLowerCase().includes(keyword)
    })
    .filter((task) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'NOT_STARTED') {
        return task.status === 'DRAFT' || task.status === 'READY'
      }
      if (statusFilter === 'HAS_BADCASE') return task.badcaseCount > 0
      return task.status === statusFilter
    })

  return paginate(rows, query)
}

export async function getProjectAutoEvaluationTaskSummaryMock(projectId: string) {
  await delay()
  const rows = tasks.filter((task) => task.projectId === projectId)
  return {
    total: rows.length,
    running: rows.filter((task) => task.status === 'RUNNING').length,
    completed: rows.filter((task) => task.status === 'COMPLETED').length,
    failed: rows.filter((task) => task.status === 'FAILED').length,
    notStarted: rows.filter(
      (task) => task.status === 'DRAFT' || task.status === 'READY'
    ).length,
    badcase: rows.reduce((sum, task) => sum + task.badcaseCount, 0),
  }
}

export async function getProjectAutoEvaluationTaskMock(
  projectId: string,
  taskId: string
): Promise<AutoEvaluationTaskRecord> {
  await delay()
  return findTask(projectId, taskId)
}

export async function getProjectAutoEvaluationLatestReportMock(
  projectId: string,
  taskId: string
): Promise<AutoEvaluationLatestReportSummary | null> {
  await delay()
  return findTask(projectId, taskId).latestReport ?? null
}

export async function listProjectAutoEvaluationRunsMock(
  projectId: string,
  taskId: string
): Promise<AutoEvaluationRunRecord[]> {
  await delay()
  return runs.filter((run) => run.projectId === projectId && run.taskId === taskId)
}

export async function listProjectAutoEvaluationEvaluatorsMock(
  _projectId: string,
  keyword = ''
): Promise<MockAutoEvaluationEvaluator[]> {
  await delay()
  const normalized = keyword.trim().toLowerCase()
  return mockAutoEvaluationEvaluators.filter((evaluator) => {
    if (!normalized) return true
    return evaluator.name.toLowerCase().includes(normalized)
  })
}

export async function listProjectAutoEvaluationDatasetsMock(
  _projectId: string,
  keyword = ''
): Promise<MockAutoEvaluationDataset[]> {
  await delay()
  const normalized = keyword.trim().toLowerCase()
  return mockAutoEvaluationDatasets.filter((dataset) => {
    if (!normalized) return true
    return dataset.name.toLowerCase().includes(normalized)
  })
}

export async function estimateProjectAutoEvaluationTraceCountMock() {
  await delay()
  return 48
}

export async function createProjectAutoEvaluationTaskMock(
  projectId: string,
  input: AutoEvaluationTaskFormInput,
  mode: 'create' | 'run'
): Promise<AutoEvaluationTaskRecord> {
  await delay()
  if (tasks.some((task) => task.projectId === projectId && task.name === input.name)) {
    throw new Error('任务名称已存在')
  }
  const now = new Date().toISOString()
  const evaluator = mockAutoEvaluationEvaluators.find(
    (item) => item.id === input.evaluatorId
  )
  if (!evaluator) throw new Error('评估器不存在')

  const sampleCount =
    input.dataSource.type === 'DATASET'
      ? mockAutoEvaluationDatasets.find(
          (dataset) => dataset.id === input.dataSource.datasetId
        )?.itemCount ?? 0
      : input.dataSource.estimatedCount
  const estimatedCount = Math.ceil((sampleCount * input.sampleRate) / 100)
  const task: AutoEvaluationTaskRecord = {
    id: `auto_eval_${Date.now()}`,
    projectId,
    name: input.name,
    description: input.description,
    scoreName: input.scoreName,
    status: mode === 'run' ? 'RUNNING' : 'READY',
    evaluator: {
      id: evaluator.id,
      name: evaluator.name,
      type: evaluator.type,
      version: evaluator.version,
    },
    dataSource: {
      type: input.dataSource.type,
      name:
        input.dataSource.type === 'DATASET'
          ? mockAutoEvaluationDatasets.find(
              (dataset) => dataset.id === input.dataSource.datasetId
            )?.name ?? '数据集'
          : 'Trace 过滤',
      sampleCount: estimatedCount,
    },
    sampleRate: input.sampleRate,
    executionStats: {
      pending: estimatedCount,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    badcaseCount: 0,
    createdBy: '当前用户',
    createdAt: now,
    lastRunAt: mode === 'run' ? now : '',
    updatedAt: now,
  }
  tasks = [task, ...tasks]
  if (mode === 'run') {
    runs = [
      {
        id: `run_${Date.now()}`,
        projectId,
        taskId: task.id,
        status: 'RUNNING',
        sampleCount: estimatedCount,
        completedCount: 0,
        failedCount: 0,
        badcaseCount: 0,
        startedAt: now,
        endedAt: '',
        durationText: '运行中',
      },
      ...runs,
    ]
  }
  return task
}

export async function deleteProjectAutoEvaluationTaskMock(
  projectId: string,
  taskId: string
): Promise<void> {
  await delay()
  const task = findTask(projectId, taskId)
  if (task.status === 'RUNNING') throw new Error('任务运行中，暂不支持删除')
  tasks = tasks.filter((item) => item.projectId !== projectId || item.id !== taskId)
  runs = runs.filter((run) => run.projectId !== projectId || run.taskId !== taskId)
}

export async function rerunProjectAutoEvaluationTaskMock(
  projectId: string,
  taskId: string
): Promise<AutoEvaluationTaskRecord> {
  await delay()
  const index = tasks.findIndex((task) => task.projectId === projectId && task.id === taskId)
  if (index < 0) throw new Error('自动评测任务不存在')
  if (tasks[index].status === 'RUNNING') throw new Error('任务已在运行中')
  const now = new Date().toISOString()
  tasks[index] = {
    ...tasks[index],
    status: 'RUNNING',
    executionStats: {
      pending: tasks[index].dataSource.sampleCount,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    latestReport: tasks[index].latestReport
      ? { ...tasks[index].latestReport, status: 'GENERATING' }
      : undefined,
    lastRunAt: now,
    updatedAt: now,
  }
  runs = [
    {
      id: `run_${Date.now()}`,
      projectId,
      taskId,
      status: 'RUNNING',
      sampleCount: tasks[index].dataSource.sampleCount,
      completedCount: 0,
      failedCount: 0,
      badcaseCount: 0,
      startedAt: now,
      endedAt: '',
      durationText: '运行中',
    },
    ...runs,
  ]
  return tasks[index]
}

export async function refreshProjectAutoEvaluationTaskMock(
  projectId: string,
  taskId: string
): Promise<AutoEvaluationTaskRecord> {
  await delay()
  const index = tasks.findIndex((task) => task.projectId === projectId && task.id === taskId)
  if (index < 0) throw new Error('自动评测任务不存在')
  if (tasks[index].status !== 'RUNNING') return tasks[index]
  const now = new Date().toISOString()
  const sampleCount = tasks[index].dataSource.sampleCount
  const failed = Math.max(1, Math.round(sampleCount * 0.03))
  const badcase = Math.max(1, Math.round(sampleCount * 0.12))
  tasks[index] = {
    ...tasks[index],
    status: 'COMPLETED',
    executionStats: {
      pending: 0,
      running: 0,
      completed: sampleCount - failed,
      failed,
      cancelled: 0,
    },
    badcaseCount: badcase,
    latestReport: {
      id: `report_${tasks[index].id}`,
      title: `${tasks[index].name}报告`,
      status: 'READY',
      generatedAt: now,
      sampleCount,
      badcaseCount: badcase,
      summary: 'mock 运行完成，已生成最新评测报告。',
    },
    updatedAt: now,
  }
  runs = runs.map((run) =>
    run.projectId === projectId && run.taskId === taskId && run.status === 'RUNNING'
      ? {
          ...run,
          status: 'COMPLETED',
          completedCount: sampleCount - failed,
          failedCount: failed,
          badcaseCount: badcase,
          endedAt: now,
          durationText: '12 分钟',
        }
      : run
  )
  return tasks[index]
}

export async function refreshProjectAutoEvaluationTasksMock(projectId: string) {
  const running = tasks.find(
    (task) => task.projectId === projectId && task.status === 'RUNNING'
  )
  if (running) return refreshProjectAutoEvaluationTaskMock(projectId, running.id)
  await delay()
  return null
}

function findTask(projectId: string, taskId: string) {
  const task = tasks.find((item) => item.projectId === projectId && item.id === taskId)
  if (!task) throw new Error('自动评测任务不存在')
  return task
}

function paginate<T>(rows: T[], query: DataTableQueryState): DataTableListResponse<T> {
  const start = (query.page - 1) * query.pageSize
  return { total: rows.length, datas: rows.slice(start, start + query.pageSize) }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
```

- [ ] **Step 4: Implement report mock API**

Create `pa-eval-frontend/src/modules/app-evaluation/api/mock-evaluation-report-api.ts` with list/detail/export/regenerate/flowback functions matching the tests. Use `DataTableQueryState`, the static data from `mock-evaluation-reports.ts`, `paginate()`, `clone()`, and a small `delay()`.

The exported API signatures must be:

```ts
export function resetProjectEvaluationReportMocks(): void
export function listProjectEvaluationReportsMock(projectId: string, query: DataTableQueryState): Promise<DataTableListResponse<EvaluationReportRecord>>
export function getProjectEvaluationReportMock(projectId: string, reportId: string): Promise<EvaluationReportDetailRecord>
export function regenerateProjectEvaluationReportMock(projectId: string, reportId: string): Promise<EvaluationReportRecord>
export function exportProjectEvaluationReportMock(projectId: string, reportId: string, format: 'markdown'): Promise<{ filename: string; content: string }>
export function listProjectEvaluationReportBadcasesMock(projectId: string, reportId: string, query: DataTableQueryState): Promise<DataTableListResponse<EvaluationReportBadcaseRecord>>
export function listProjectEvaluationReportItemsMock(projectId: string, reportId: string, query: DataTableQueryState): Promise<DataTableListResponse<EvaluationReportItemRecord>>
export function previewProjectEvaluationReportFlowbackMock(projectId: string, reportId: string, input: EvaluationReportFlowbackInput): Promise<{ matchedCount: number; duplicateCount: number; willCreateCount: number; defaultDatasetName: string }>
export function createProjectEvaluationReportFlowbackMock(projectId: string, reportId: string, input: EvaluationReportFlowbackInput): Promise<EvaluationReportFlowbackRecord>
export function listProjectEvaluationReportFlowbacksMock(projectId: string, reportId: string): Promise<EvaluationReportFlowbackRecord[]>
```

Filtering rules:

```ts
const sourceTypes = query.filters.sourceType as string[] | undefined
const statuses = query.filters.status as string[] | undefined
const hasBadcase = query.filters.hasBadcase as string[] | undefined

const rows = reports
  .filter((report) => report.projectId === projectId)
  .filter((report) => !keyword || [report.title, report.sourceTaskName].join(' ').toLowerCase().includes(keyword))
  .filter((report) => !sourceTypes?.length || sourceTypes.includes(report.sourceType))
  .filter((report) => !statuses?.length || statuses.includes(report.status))
  .filter((report) => !hasBadcase?.length || (hasBadcase.includes('true') ? report.badcaseCount > 0 : report.badcaseCount === 0))
```

Flowback execution rules:

```ts
const matchedCount =
  input.range === 'SELECTED' ? input.selectedItemIds.length : report.badcaseCount
const duplicateCount = Math.min(2, Math.floor(matchedCount / 4))
const successCount = Math.max(0, matchedCount - duplicateCount)
const flowback: EvaluationReportFlowbackRecord = {
  id: `flowback_${Date.now()}`,
  reportId,
  flowbackType: input.flowbackType,
  targetDatasetId:
    input.targetDataset.mode === 'EXISTING'
      ? input.targetDataset.datasetId
      : `dataset_${Date.now()}`,
  targetDatasetName:
    input.targetDataset.mode === 'EXISTING'
      ? '已选择数据集'
      : input.targetDataset.name,
  targetDatasetCreated: input.targetDataset.mode === 'CREATE',
  requestedCount: matchedCount,
  successCount,
  failedCount: 0,
  status: 'COMPLETED',
  createdBy: '当前用户',
  createdAt: new Date().toISOString(),
  errorDetail: [],
}
```

- [ ] **Step 5: Run typecheck and verify mock API tests compile**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS for the new type-level tests and no missing module errors.

---

## Task 3: Navigation and Routes

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/evaluation-page-nav.tsx`
- Modify: `pa-eval-frontend/src/routes/index.tsx`
- Create later views: `auto-evaluations.tsx`, `auto-evaluation-new.tsx`, `auto-evaluation-detail.tsx`, `evaluation-reports.tsx`, `evaluation-report-detail.tsx`

- [ ] **Step 1: Add navigation links**

Modify `evaluation-page-nav.tsx` imports:

```ts
import { BarChart3, Bot, ClipboardCheck, Database } from 'lucide-react'
```

Add two links after “人工评测”:

```tsx
{
  title: '自动评测',
  href: `${basePath}/auto-evaluations`,
  icon: Bot,
  isActive: location.pathname.startsWith(`${basePath}/auto-evaluations`),
},
{
  title: '评测报告',
  href: `${basePath}/reports`,
  icon: BarChart3,
  isActive: location.pathname.startsWith(`${basePath}/reports`),
},
```

- [ ] **Step 2: Add route imports**

Modify `pa-eval-frontend/src/routes/index.tsx`:

```ts
import { ProjectAutoEvaluationDetail } from '@/modules/app-evaluation/views/auto-evaluation-detail'
import { ProjectAutoEvaluationNew } from '@/modules/app-evaluation/views/auto-evaluation-new'
import { ProjectAutoEvaluations } from '@/modules/app-evaluation/views/auto-evaluations'
import { ProjectEvaluationReportDetail } from '@/modules/app-evaluation/views/evaluation-report-detail'
import { ProjectEvaluationReports } from '@/modules/app-evaluation/views/evaluation-reports'
```

- [ ] **Step 3: Add child routes**

Add these children under `projects/:projectId/evaluation`:

```tsx
{ path: 'auto-evaluations', element: <ProjectAutoEvaluations /> },
{ path: 'auto-evaluations/new', element: <ProjectAutoEvaluationNew /> },
{
  path: 'auto-evaluations/:taskId',
  element: <ProjectAutoEvaluationDetail />,
},
{ path: 'reports', element: <ProjectEvaluationReports /> },
{ path: 'reports/:reportId', element: <ProjectEvaluationReportDetail /> },
```

- [ ] **Step 4: Create temporary route view stubs**

Create each new view with a minimal component so routes compile. Example for `auto-evaluations.tsx`:

```tsx
import { Page } from '@/components/common/page'
import { EvaluationPageNav } from '../components/evaluation-page-nav'

export function ProjectAutoEvaluations() {
  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav />
        <section className='rounded-lg border bg-card p-4 text-card-foreground'>
          自动评测
        </section>
      </div>
    </Page>
  )
}
```

Use equivalent stubs for the other four views with their exported component names.

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS. The app now compiles with the new routes.

---

## Task 4: Automatic Evaluation List Page

**Files:**
- Create: `auto-evaluation-status-badge.tsx`
- Create: `auto-evaluation-row-actions.tsx`
- Create: `auto-evaluation-columns.tsx`
- Create: `auto-evaluation-summary-cards.tsx`
- Replace stub: `views/auto-evaluations.tsx`

- [ ] **Step 1: Implement task status badge**

Create `auto-evaluation-status-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import type { AutoEvaluationTaskStatus } from '../types'
import { autoEvaluationStatusLabels } from '../types'

const variants: Record<
  AutoEvaluationTaskStatus,
  React.ComponentProps<typeof Badge>['variant']
> = {
  DRAFT: 'outline',
  READY: 'secondary',
  RUNNING: 'default',
  COMPLETED: 'secondary',
  FAILED: 'destructive',
  CANCELLED: 'outline',
}

export function AutoEvaluationStatusBadge({
  status,
}: {
  status: AutoEvaluationTaskStatus
}) {
  return <Badge variant={variants[status]}>{autoEvaluationStatusLabels[status]}</Badge>
}
```

- [ ] **Step 2: Implement summary cards**

Create `auto-evaluation-summary-cards.tsx`:

```tsx
import { Button } from '@/components/ui/button'

type Summary = {
  total: number
  running: number
  completed: number
  failed: number
  notStarted: number
  badcase: number
}

type SummaryFilter = 'all' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'NOT_STARTED' | 'HAS_BADCASE'

const items: { id: SummaryFilter; label: string; key: keyof Summary }[] = [
  { id: 'all', label: '全部', key: 'total' },
  { id: 'RUNNING', label: '运行中', key: 'running' },
  { id: 'COMPLETED', label: '已完成', key: 'completed' },
  { id: 'FAILED', label: '失败', key: 'failed' },
  { id: 'NOT_STARTED', label: '未运行', key: 'notStarted' },
  { id: 'HAS_BADCASE', label: 'Badcase', key: 'badcase' },
]

export function AutoEvaluationSummaryCards({
  summary,
  active,
  onChange,
}: {
  summary: Summary
  active: SummaryFilter
  onChange: (value: SummaryFilter) => void
}) {
  return (
    <section className='grid gap-3 md:grid-cols-3 xl:grid-cols-6'>
      {items.map((item) => (
        <Button
          key={item.id}
          type='button'
          variant={active === item.id ? 'default' : 'outline'}
          className='h-auto justify-start px-4 py-3'
          onClick={() => onChange(active === item.id ? 'all' : item.id)}
        >
          <span className='flex flex-col items-start gap-1'>
            <span className='text-xs'>{item.label}</span>
            <span className='text-lg font-semibold'>{summary[item.key]}</span>
          </span>
        </Button>
      ))}
    </section>
  )
}
```

- [ ] **Step 3: Implement columns and row actions**

Use `DataTableColumnHeader`, `LongText`, `Link`, `DropdownMenu`, `confirm`, `toast`, and handlers passed from the page. Columns must include name, status, evaluator, data source, sample rate, execution result, badcase, recent run, created by, and actions.

Important row action behavior:

```tsx
if (task.status === 'RUNNING') {
  toast.warning('任务运行中，暂不支持删除')
  return
}

const confirmed = await confirm({
  title: '删除自动评测任务',
  desc: `删除后仅移除「${task.name}」这条前端 mock 任务，不会删除真实 trace、score 或 dataset 数据。确定继续吗？`,
  confirmText: '删除',
  destructive: true,
})
```

Rerun confirm text:

```tsx
const confirmed = await confirm({
  title: '确认重新运行该自动评测任务？',
  desc: '重新运行会基于当前 mock 配置生成新的运行记录，运行期间暂不可查看最新报告。',
  confirmText: '重新运行',
})
```

- [ ] **Step 4: Replace list view stub**

Implement `views/auto-evaluations.tsx` with:

- `Page fixed fluid`
- `EvaluationPageNav` with buttons: Refresh and New
- `AutoEvaluationSummaryCards`
- `DataTable<AutoEvaluationTaskRecord>`
- `urlState` with `keyword`
- `toolbar.searchPlaceholder = '搜索任务名称'`
- query keys including projectId, active summary filter, and table state
- refresh calls `refreshProjectAutoEvaluationTasksMock`
- new navigates to `/projects/${projectId}/evaluation/auto-evaluations/new`

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

---

## Task 5: Automatic Evaluation Detail and Report Card

**Files:**
- Create: `auto-evaluation-run-records.tsx`
- Create: `auto-evaluation-report-card.tsx`
- Replace stub: `views/auto-evaluation-detail.tsx`

- [ ] **Step 1: Implement run records**

Create a compact table/card list for `AutoEvaluationRunRecord[]` showing status, sample count, completed, failed, badcase, started time, duration, and error message.

- [ ] **Step 2: Implement latest report card**

Create `auto-evaluation-report-card.tsx` with these states:

```tsx
if (task.status === 'RUNNING') return <Card>任务正在运行，完成后可生成并查看评测报告。</Card>
if (task.status === 'FAILED') return <Card>最近一次运行失败，暂无法生成评测报告。可重新运行任务后再查看。</Card>
if (task.status === 'DRAFT' || task.status === 'READY') return <Card>任务尚未运行，运行完成后将生成评测报告。</Card>
if (!report) return <Card>暂无报告，刷新后查看生成状态。</Card>
if (report.status === 'GENERATING') return <Card>报告生成中</Card>
if (report.status === 'FAILED') return <Card>{report.errorMessage ?? '报告生成失败'}</Card>
```

For `READY`, render a button:

```tsx
<Button asChild>
  <Link to={`/projects/${projectId}/evaluation/reports/${report.id}`}>
    查看报告
  </Link>
</Button>
```

- [ ] **Step 3: Replace detail view stub**

Implement `views/auto-evaluation-detail.tsx` with:

- `PageAction` back to `/projects/${projectId}/evaluation/auto-evaluations`
- buttons: Refresh, Rerun, Delete
- `useQuery` for task, latest report, and runs
- metric cards for sample count, completed, failed, badcase
- config section with evaluator, data source, sample rate, score name
- `AutoEvaluationRunRecords`
- `AutoEvaluationReportCard`

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

---

## Task 6: New Automatic Evaluation Wizard

**Files:**
- Create: `auto-evaluation-task-form.tsx`
- Replace stub: `views/auto-evaluation-new.tsx`

- [ ] **Step 1: Implement form validation helpers**

Inside `auto-evaluation-task-form.tsx`, implement helpers:

```ts
function isScoreNameValid(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value)
}

function getEstimatedRunCount(sampleCount: number, sampleRate: number) {
  return Math.ceil((sampleCount * sampleRate) / 100)
}
```

Step validation messages:

- `任务名称不能为空`
- `Score Name 不能为空`
- `Score Name 只允许英文、数字、下划线和短横线`
- `请选择评估器`
- `请完成评估器变量映射`
- `请选择数据集或完成 Trace 过滤预估`
- `Trace 命中数量为 0，请调整过滤条件`
- `采样率必须在 1% 到 100% 之间`
- `Badcase 阈值必须为数字`

- [ ] **Step 2: Build three-step form**

Use local state for:

```ts
const [step, setStep] = useState(0)
const [form, setForm] = useState<AutoEvaluationTaskFormInput>(initialForm)
const [dirty, setDirty] = useState(false)
const [evaluatorKeyword, setEvaluatorKeyword] = useState('')
const [datasetKeyword, setDatasetKeyword] = useState('')
```

Controls:

- Step 1: Input task name, Textarea description, Input scoreName.
- Step 2: evaluator search/list, single select evaluator, variable mapping selects.
- Step 3: Tabs for dataset and trace filter, sample rate input/slider, badcase switch and threshold fields.

- [ ] **Step 3: Implement submit behavior**

`仅创建`:

```ts
await createProjectAutoEvaluationTaskMock(projectId, form, 'create')
toast.success('自动评测任务已创建')
navigate(`/projects/${projectId}/evaluation/auto-evaluations`)
```

`创建并运行`:

```ts
const task = await createProjectAutoEvaluationTaskMock(projectId, form, 'run')
toast.success('自动评测任务已创建并开始运行')
navigate(`/projects/${projectId}/evaluation/auto-evaluations/${task.id}`)
```

Cancel/back dirty confirm:

```ts
const confirmed = await confirm({
  title: '离开新建自动评测？',
  desc: '当前自动评测任务尚未保存，离开后已填写内容将丢失。',
  confirmText: '离开',
})
```

- [ ] **Step 4: Replace new view stub**

Render `PageAction` and `AutoEvaluationTaskForm` in `views/auto-evaluation-new.tsx`.

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

---

## Task 7: Evaluation Report List and Detail

**Files:**
- Create: report badges, columns, row actions, summary, analysis, badcase table, item table, history components
- Replace stubs: `views/evaluation-reports.tsx`, `views/evaluation-report-detail.tsx`

- [ ] **Step 1: Implement report badges**

Create `evaluation-report-status-badge.tsx` and `evaluation-report-source-badge.tsx` using `Badge` and label maps from `types.ts`.

- [ ] **Step 2: Implement report list columns and actions**

Columns:

- Report title links to `/projects/${projectId}/evaluation/reports/${report.id}` only when `READY`.
- Source type badge.
- Source task.
- Status badge.
- Sample count.
- Badcase count.
- Flowback count.
- Generated time.
- Actions.

Actions:

- View disabled with toast for `GENERATING` or `FAILED`.
- Export only for `READY`.
- Regenerate confirm and invalidate report queries.
- Flowback action navigates to report detail with `?tab=badcases`.

- [ ] **Step 3: Replace report list view stub**

Use `DataTable<EvaluationReportRecord>` with URL filters:

```ts
const reportUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'sourceType', type: 'array' },
  { fieldId: 'status', type: 'array' },
  { fieldId: 'hasBadcase', type: 'array' },
]
```

Toolbar filters:

```ts
[
  {
    columnId: 'sourceType',
    title: '来源类型',
    options: [
      { label: '自动评测', value: 'AUTO_EVAL' },
      { label: '人工评测', value: 'MANUAL_ANNOTATION' },
    ],
  },
  {
    columnId: 'status',
    title: '报告状态',
    options: [
      { label: '生成中', value: 'GENERATING' },
      { label: '已生成', value: 'READY' },
      { label: '生成失败', value: 'FAILED' },
    ],
  },
  {
    columnId: 'hasBadcase',
    title: 'Badcase',
    options: [
      { label: '存在 badcase', value: 'true' },
      { label: '无 badcase', value: 'false' },
    ],
  },
]
```

- [ ] **Step 4: Implement report detail components**

`evaluation-report-summary.tsx` renders Cards for average score, pass rate, failure rate, badcase rate, and summary text.

`evaluation-report-analysis.tsx` renders:

- distribution rows with simple bars
- group analysis rows
- risks list
- recommendations list
- reproduction info

`evaluation-report-badcase-table.tsx` and `evaluation-report-item-table.tsx` use `DataTable` with their mock API functions and support row selection.

`evaluation-report-flowback-history.tsx` renders history cards/table.

- [ ] **Step 5: Replace report detail view stub**

Implement detail with:

- `PageAction` back to `/projects/${projectId}/evaluation/reports`
- buttons: Export, Regenerate, Flowback Badcase, Flowback Evaluation Data
- Tabs: overview, analysis, badcases, items, flowbacks
- `useSearchParams` for initial tab
- loading and error states

- [ ] **Step 6: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

---

## Task 8: Report Flowback Dialog

**Files:**
- Create: `evaluation-report-flowback-dialog.tsx`
- Modify: `views/evaluation-report-detail.tsx`
- Modify: `evaluation-report-badcase-table.tsx`
- Modify: `evaluation-report-item-table.tsx`

- [ ] **Step 1: Implement dialog state contract**

Use props:

```ts
type EvaluationReportFlowbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  reportId: string
  flowbackType: EvaluationReportFlowbackType
  selectedItemIds: string[]
  defaultRange: EvaluationReportFlowbackInput['range']
  onCompleted: () => Promise<unknown>
}
```

- [ ] **Step 2: Implement preview and confirm**

Dialog fields:

- Range select.
- Target dataset mode radio: existing / create.
- Existing dataset select with mock options from `listProjectAutoEvaluationDatasetsMock`.
- New dataset name input with default name.
- Dedupe strategy radio.
- Preview button.
- Confirm button disabled until preview exists and `willCreateCount > 0`.

Preview call:

```ts
const result = await previewProjectEvaluationReportFlowbackMock(
  projectId,
  reportId,
  input
)
setPreview(result)
```

Execute call:

```ts
const flowback = await createProjectEvaluationReportFlowbackMock(
  projectId,
  reportId,
  input
)
toast.success(`已回流 ${flowback.successCount} 条数据`)
await onCompleted()
onOpenChange(false)
```

- [ ] **Step 3: Wire dialog into report detail**

In `evaluation-report-detail.tsx`, keep:

```ts
const [flowbackOpen, setFlowbackOpen] = useState(false)
const [flowbackType, setFlowbackType] =
  useState<EvaluationReportFlowbackType>('BADCASE')
const [selectedFlowbackIds, setSelectedFlowbackIds] = useState<string[]>([])
```

Open from top buttons, badcase table, and item table. Invalidate:

```ts
await queryClient.invalidateQueries({
  queryKey: ['project-evaluation-report', projectId, reportId],
})
await queryClient.invalidateQueries({
  queryKey: ['project-evaluation-report-flowbacks', projectId, reportId],
})
await queryClient.invalidateQueries({
  queryKey: ['project-evaluation-reports', projectId],
})
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

---

## Task 9: Final Polish and Verification

**Files:**
- All files touched by Tasks 1-8.

- [ ] **Step 1: Search for disallowed backend or Langfuse edits**

Run from repo root:

```bash
git status --short
```

Expected: changed files are under `pa-eval-frontend/` and `docs/superpowers/plans/`; no `pa-eval-backend/` or `langfuse/` modifications.

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

Expected: PASS or only pre-existing lint issues explicitly unrelated to this work.

- [ ] **Step 4: Run build**

Run:

```bash
cd pa-eval-frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual UI smoke test**

Run:

```bash
cd pa-eval-frontend
npm run dev
```

Open the local URL shown by Vite and verify:

- `/projects/project_customer_agent/evaluation/auto-evaluations` shows automatic evaluation list.
- Status summary filters the list.
- Search filters by task name.
- New task wizard supports three steps.
- Creating with “创建并运行” lands on task detail.
- Task detail shows latest report card instead of full report body.
- Ready report card “查看报告” goes to `/projects/project_customer_agent/evaluation/reports/:reportId`.
- `/projects/project_customer_agent/evaluation/reports` shows report list.
- Report detail shows overview, analysis, badcases, evaluation data, and flowback history tabs.
- Badcase flowback preview and execute update the flowback history.

Stop the dev server after verification.

---

## Self-Review

- Spec coverage:
  - 自动评测列表、搜索、状态统计、刷新、删除、重新跑: Tasks 2, 4, 5.
  - 自动评测新建三步流程和校验: Task 6.
  - 自动评测详情只展示报告入口、不展示完整报告正文: Task 5.
  - 评测报告作为应用评测子页面: Tasks 3, 7.
  - 报告列表、报告详情、导出、重新生成: Tasks 2, 7.
  - Badcase 回流、评测数据回流、回流历史: Tasks 2, 8.
  - 前端 mock-only 范围: Ground Rules and Task 9.
- Placeholder scan:
  - No placeholder markers or unspecified implementation steps remain.
- Type consistency:
  - Route names, type names, mock API names, and component names match the design document and task file structure.
