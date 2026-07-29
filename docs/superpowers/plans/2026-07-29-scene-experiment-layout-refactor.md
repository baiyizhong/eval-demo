# 场景试验功能布局重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目级“场景管理”入口重构为包含“场景试验 / 场景管理”双 Tab 的统一前端模块，并复用五步向导支持项目级和数据集快捷发起场景试验。

**Architecture:** 保留现有按数据集试验 API、Mock 路由和报告业务规则，在 `scene-experiments` 模块内增加项目级数据组合层，将各数据集报告、基线和数据集元信息合并后交给现有 `DataTable`。统一试验抽屉接收可选的锁定数据集上下文：项目入口允许表格单选数据集，数据集详情入口只读锁定当前数据集；报告详情与分析页面通过 URL `source` 参数恢复返回来源。

**Tech Stack:** React 19、TypeScript、React Router 8、TanStack Query、TanStack Table、Tailwind CSS v4、shadcn/ui/Radix、Vite Mock、Node test runner。

**约束:** 本计划只修改 `pa-eval-frontend` 和前端测试，不实现后端，不修改数据库、`langfuse/` 或 `dify/`。项目规约禁止自动提交，因此以下任务不包含 `git commit`、`git push` 或 PR 步骤。

---

## 文件结构

新增文件：

- `pa-eval-frontend/src/modules/scene-experiments/lib/experiment-navigation.ts`：统一构造双 Tab、报告详情、聚合、对比和返回来源 URL。
- `pa-eval-frontend/src/modules/scene-experiments/lib/project-experiment-reports.ts`：加载项目内全部数据集报告与基线，并对合并结果执行搜索、筛选、排序和分页。
- `pa-eval-frontend/src/modules/scene-experiments/components/project-experiment-reports.tsx`：项目级报告表格、局部失败提示、基线和分析操作。
- `pa-eval-frontend/src/modules/scene-experiments/components/scene-management-table.tsx`：从原页面抽出的场景列表视图。
- `pa-eval-frontend/src/modules/scene-experiments/components/experiment-dataset-step.tsx`：项目入口的数据集表格单选和快捷入口的只读数据集摘要。
- `pa-eval-frontend/src/modules/scene-experiments/components/experiment-selectable-card.tsx`：Webhook 和评估器共同复用的选择卡片与详情按钮。
- `pa-eval-frontend/src/modules/scene-experiments/components/experiment-execution-step.tsx`：合并 Webhook 多选与运行参数覆盖。
- `pa-eval-frontend/src/tests/scene-experiments/experiment-navigation.test.ts`：URL 来源和 Tab 规则测试。
- `pa-eval-frontend/src/tests/scene-experiments/project-experiment-reports.test.ts`：项目级报告加载、局部失败、筛选、排序和分页测试。
- `pa-eval-frontend/src/tests/scene-experiments/scene-experiment-layout-source.test.ts`：双 Tab、按钮、五步向导和锁定数据集的源代码契约测试。

修改文件：

- `pa-eval-frontend/src/api/registry.ts`
- `pa-eval-frontend/mock/_data.ts`
- `pa-eval-frontend/mock/_utils.ts`
- `pa-eval-frontend/mock/datasets.ts`
- `pa-eval-frontend/mock/scene-experiments.ts`
- `pa-eval-frontend/src/hooks/use-sidebar-data.test.ts`
- `pa-eval-frontend/src/lib/sidebar-data.ts`
- `pa-eval-frontend/src/modules/scene-experiments/types.ts`
- `pa-eval-frontend/src/modules/scene-experiments/api/scene-experiment-api.ts`
- `pa-eval-frontend/src/modules/scene-experiments/lib/experiment-rules.ts`
- `pa-eval-frontend/src/modules/scene-experiments/components/experiment-report-columns.tsx`
- `pa-eval-frontend/src/modules/scene-experiments/components/dataset-experiment-reports.tsx`
- `pa-eval-frontend/src/modules/scene-experiments/components/experiment-run-drawer.tsx`
- `pa-eval-frontend/src/modules/scene-experiments/views/scenes.tsx`
- `pa-eval-frontend/src/modules/scene-experiments/views/experiment-report-detail.tsx`
- `pa-eval-frontend/src/modules/scene-experiments/views/experiment-aggregate.tsx`
- `pa-eval-frontend/src/modules/scene-experiments/views/experiment-compare.tsx`
- `pa-eval-frontend/src/modules/app-evaluation/views/dataset-detail.tsx`
- `pa-eval-frontend/src/tests/scene-experiments/dataset-experiment-source.test.ts`
- `pa-eval-frontend/src/tests/scene-experiments/domain-rules.test.ts`
- `pa-eval-frontend/src/tests/scene-experiments/scene-management-source.test.ts`
- `pa-eval-frontend/src/tests/scene-experiments/report-analysis-source.test.ts`

不修改：

- `pa-eval-frontend/src/components/common/data-table/*`
- 任何后端代码、数据库迁移、`langfuse/`、`dify/`

---

### Task 1: 菜单名称、Tab 和来源 URL 规则

**Files:**

- Create: `pa-eval-frontend/src/tests/scene-experiments/experiment-navigation.test.ts`
- Modify: `pa-eval-frontend/src/hooks/use-sidebar-data.test.ts`
- Create: `pa-eval-frontend/src/modules/scene-experiments/lib/experiment-navigation.ts`
- Modify: `pa-eval-frontend/src/lib/sidebar-data.ts`

- [ ] **Step 1: 写菜单和 URL 规则失败测试**

在 `use-sidebar-data.test.ts` 中把项目菜单断言改为：

```ts
assert.deepEqual(
  items.map((item) => item.title),
  ['应用观测', '应用评测', '场景试验', '定时任务', '项目设置']
)

const sceneExperiments = items.find((item) => item.title === '场景试验')
assert.ok(sceneExperiments && 'url' in sceneExperiments)
assert.equal(sceneExperiments.url, '/projects/project-real-1/scenes')
assert.equal(sceneExperiments.activeMatch, 'prefix')
```

创建 `experiment-navigation.test.ts`：

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildExperimentAnalysisHref,
  buildExperimentReportHref,
  buildExperimentReturnHref,
  normalizeSceneExperimentTab,
} from '../../modules/scene-experiments/lib/experiment-navigation.ts'

test('scene experiment tab defaults to experiments', () => {
  assert.equal(normalizeSceneExperimentTab(null), 'experiments')
  assert.equal(normalizeSceneExperimentTab('unknown'), 'experiments')
  assert.equal(normalizeSceneExperimentTab('management'), 'management')
})

test('project report links preserve project source', () => {
  assert.equal(
    buildExperimentReportHref({
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      reportId: 'report_a',
      source: 'project',
    }),
    '/projects/proj_a/evaluation/datasets/dataset_a/experiment-reports/report_a?source=project'
  )
})

test('analysis links preserve report ids and source', () => {
  assert.equal(
    buildExperimentAnalysisHref({
      type: 'compare',
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      reportIds: ['report_a', 'report_b'],
      source: 'dataset',
    }),
    '/projects/proj_a/evaluation/datasets/dataset_a/experiments/compare?reportIds=report_a%2Creport_b&source=dataset'
  )
})

test('return href follows source and falls back to dataset reports', () => {
  assert.equal(
    buildExperimentReturnHref({
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      source: 'project',
    }),
    '/projects/proj_a/scenes?tab=experiments'
  )
  assert.equal(
    buildExperimentReturnHref({
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      source: 'dataset',
    }),
    '/projects/proj_a/evaluation/datasets/dataset_a?tab=reports'
  )
  assert.equal(
    buildExperimentReturnHref({
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      source: 'invalid',
    }),
    '/projects/proj_a/evaluation/datasets/dataset_a?tab=reports'
  )
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/hooks/use-sidebar-data.test.ts \
  src/tests/scene-experiments/experiment-navigation.test.ts
```

Expected: FAIL，原菜单仍为“场景管理”，且 `experiment-navigation.ts` 尚不存在。

- [ ] **Step 3: 实现 URL helper 和菜单改名**

创建 `experiment-navigation.ts`：

```ts
export type SceneExperimentTab = 'experiments' | 'management'
export type ExperimentNavigationSource = 'project' | 'dataset'

export function normalizeSceneExperimentTab(
  value: string | null
): SceneExperimentTab {
  return value === 'management' ? 'management' : 'experiments'
}

function normalizeSource(value: string | null | undefined) {
  return value === 'project' ? 'project' : 'dataset'
}

export function buildExperimentReportHref(input: {
  projectId: string
  datasetId: string
  reportId: string
  source: ExperimentNavigationSource
}) {
  const params = new URLSearchParams({ source: input.source })
  return `/projects/${input.projectId}/evaluation/datasets/${input.datasetId}/experiment-reports/${input.reportId}?${params}`
}

export function buildExperimentAnalysisHref(input: {
  type: 'aggregate' | 'compare'
  projectId: string
  datasetId: string
  reportIds: string[]
  source: ExperimentNavigationSource
}) {
  const params = new URLSearchParams({
    reportIds: input.reportIds.join(','),
    source: input.source,
  })
  return `/projects/${input.projectId}/evaluation/datasets/${input.datasetId}/experiments/${input.type}?${params}`
}

export function buildExperimentReturnHref(input: {
  projectId: string
  datasetId: string
  source: string | null | undefined
}) {
  if (normalizeSource(input.source) === 'project') {
    return `/projects/${input.projectId}/scenes?tab=experiments`
  }
  return `/projects/${input.projectId}/evaluation/datasets/${input.datasetId}?tab=reports`
}
```

在 `sidebar-data.ts` 中只改入口标题：

```ts
{
  title: '场景试验',
  url: `/projects/${encodedProjectId}/scenes`,
  icon: 'Workflow',
  activeMatch: 'prefix',
  access: 'project:dataset:view',
  scope: { type: 'project', projectId },
}
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/hooks/use-sidebar-data.test.ts \
  src/tests/scene-experiments/experiment-navigation.test.ts
```

Expected: PASS。

---

### Task 2: 项目级报告数据组合与查询规则

**Files:**

- Create: `pa-eval-frontend/src/tests/scene-experiments/project-experiment-reports.test.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/types.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/api/scene-experiment-api.ts`
- Create: `pa-eval-frontend/src/modules/scene-experiments/lib/project-experiment-reports.ts`
- Modify: `pa-eval-frontend/src/tests/scene-experiments/domain-rules.test.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/lib/experiment-rules.ts`

- [ ] **Step 1: 写项目级加载和查询失败测试**

创建 `project-experiment-reports.test.ts`，使用内存 loader 测试全部分页、局部失败和列表查询：

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DataTableQueryState } from '../../components/common/data-table/data-table.tsx'
import {
  loadProjectExperimentSource,
  queryProjectExperimentReports,
} from '../../modules/scene-experiments/lib/project-experiment-reports.ts'
import type { DatasetRecord } from '../../modules/app-evaluation/types.ts'
import type {
  ExperimentReport,
  ProjectExperimentReport,
} from '../../modules/scene-experiments/types.ts'

const dataset = (
  overrides: Partial<DatasetRecord> & Pick<DatasetRecord, 'id' | 'name'>
): DatasetRecord => ({
  id: overrides.id,
  projectId: 'proj_a',
  name: overrides.name,
  description: '',
  type: 'evaluation',
  metadata: { type: 'evaluation' },
  inputSchema: {},
  expectedOutputSchema: {},
  itemCount: 0,
  runCount: 0,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
  ...overrides,
})

const report = (
  overrides: Partial<ExperimentReport> &
    Pick<ExperimentReport, 'id' | 'datasetId' | 'name'>
): ExperimentReport => ({
  id: overrides.id,
  projectId: 'proj_a',
  datasetId: overrides.datasetId,
  experimentGroupId: 'group_a',
  experimentName: '版本回归',
  name: overrides.name,
  sceneId: 'scene_a',
  sceneSnapshot: {
    id: 'scene_a',
    projectId: 'proj_a',
    name: '客服场景',
    description: '',
    enabled: true,
    webhooks: [],
    runParameters: {
      concurrency: 5,
      timeoutSeconds: 30,
      retryCount: 2,
      rounds: 1,
    },
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  },
  webhookSnapshot: {
    id: 'webhook_a',
    name: '服务 v2',
    description: '',
    url: 'https://example.invalid/webhook',
    method: 'POST',
    authType: 'NONE',
    headers: {},
    serviceFamily: 'support',
    version: '2.0.0',
  },
  evaluatorSnapshots: [],
  runParameters: {
    concurrency: 5,
    timeoutSeconds: 30,
    retryCount: 2,
    rounds: 1,
  },
  status: 'COMPLETED',
  progress: 100,
  itemCount: 10,
  successfulItemCount: 10,
  failedItemCount: 0,
  scoreResults: [],
  roundResults: [],
  itemResults: [],
  insight: '',
  createdAt: '2026-07-29T03:00:00.000Z',
  completedAt: '2026-07-29T03:01:00.000Z',
  ...overrides,
})

const projectReport = (
  overrides: Partial<ProjectExperimentReport> &
    Pick<ProjectExperimentReport, 'id' | 'datasetId' | 'datasetName' | 'name'>
): ProjectExperimentReport => ({
  ...report(overrides),
  datasetName: overrides.datasetName,
  datasetType: 'evaluation',
  datasetItemCount: 10,
  datasetUpdatedAt: '2026-07-29T02:00:00.000Z',
  ...overrides,
})

const query = (overrides: Partial<DataTableQueryState> = {}): DataTableQueryState => ({
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
  ...overrides,
})

test('project source merges datasets reports and baselines while preserving failures', async () => {
  const source = await loadProjectExperimentSource({
    projectId: 'proj_a',
    loadDatasets: async () => [
      dataset({ id: 'dataset_a', name: '客服集', itemCount: 10 }),
      dataset({ id: 'dataset_b', name: '退款集', type: 'golden', itemCount: 20 }),
    ],
    loadReports: async (datasetId) => {
      if (datasetId === 'dataset_b') throw new Error('退款集加载失败')
      return [
        report({
          id: 'report_a',
          datasetId: 'dataset_a',
          experimentName: '客服回归',
          name: '客服回归 - v2',
        }),
      ]
    },
    loadBaselines: async () => [],
  })

  assert.equal(source.reports.length, 1)
  assert.equal(source.reports[0]?.datasetName, '客服集')
  assert.deepEqual(source.failedDatasets, [
    { datasetId: 'dataset_b', datasetName: '退款集', message: '退款集加载失败' },
  ])
})

test('project report query searches filters sorts and paginates merged rows', () => {
  const rows = [
    projectReport({
      id: 'r1',
      datasetId: 'd1',
      datasetName: '客服集',
      name: '版本回归 - v2',
    }),
    projectReport({
      id: 'r2',
      datasetId: 'd2',
      datasetName: '退款集',
      experimentName: '退款验收',
      name: '退款验收 - v1',
      status: 'RUNNING',
      createdAt: '2026-07-29T04:00:00.000Z',
      sceneSnapshot: {
        ...report({ id: 'base', datasetId: 'd2', name: 'base' }).sceneSnapshot,
        name: '退款场景',
      },
      webhookSnapshot: {
        ...report({ id: 'base', datasetId: 'd2', name: 'base' }).webhookSnapshot,
        name: '退款服务',
        serviceFamily: 'refund',
      },
    }),
  ]

  const result = queryProjectExperimentReports(rows, query({
    keyword: '退款',
    filters: { datasetId: ['d2'], status: ['RUNNING'] },
    sorting: [{ id: 'createdAt', desc: true }],
  }))

  assert.equal(result.total, 1)
  assert.deepEqual(result.datas.map((row) => row.id), ['r2'])
})
```

同时在 `domain-rules.test.ts` 增加跨数据集对比拒绝断言：

```ts
assert.equal(
  canCompareReports([
    { status: 'COMPLETED', datasetId: 'dataset_a', sceneId: 'scene_a', serviceFamily: 'support' },
    { status: 'COMPLETED', datasetId: 'dataset_b', sceneId: 'scene_a', serviceFamily: 'support' },
  ]),
  false
)
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/project-experiment-reports.test.ts \
  src/tests/scene-experiments/domain-rules.test.ts
```

Expected: FAIL，项目级 helper 和 `datasetId` 对比条件尚不存在。

- [ ] **Step 3: 增加项目级类型和加载 API helper**

在 `types.ts` 中增加：

```ts
import type { DatasetRecord } from '@/modules/app-evaluation/types'

export type ProjectExperimentReport = ExperimentReport & {
  datasetName: string
  datasetType: DatasetRecord['type']
  datasetItemCount: number
  datasetUpdatedAt: string
}

export type ProjectExperimentSourceFailure = {
  datasetId: string
  datasetName: string
  message: string
}

export type ProjectExperimentSource = {
  datasets: DatasetRecord[]
  reports: ProjectExperimentReport[]
  baselines: ExperimentReportBaseline[]
  failedDatasets: ProjectExperimentSourceFailure[]
}
```

在 `scene-experiment-api.ts` 的 API 类型中增加现有 registry alias（不修改 registry）：

```ts
getProjectDatasets: ApiMethod
```

并增加两个“拉取全部分页”函数：

```ts
export async function listAllProjectDatasets(
  api: SceneExperimentApi,
  projectId: string,
  pageSize = 100
) {
  const rows: DatasetRecord[] = []
  let page = 1
  let total = 0
  do {
    const response = await api.getProjectDatasets<DataTableListResponse<DatasetRecord>>({
      path: { projectId },
      query: { page, pageSize },
    })
    rows.push(...response.datas)
    total = response.total
    page += 1
  } while (rows.length < total)
  return rows
}

export async function listAllDatasetExperimentReports(
  api: SceneExperimentApi,
  projectId: string,
  datasetId: string,
  pageSize = 100
) {
  const rows: ExperimentReport[] = []
  let page = 1
  let total = 0
  do {
    const response = await api.getDatasetExperimentReports<
      DataTableListResponse<ExperimentReport>
    >({
      path: { projectId, datasetId },
      query: { page, pageSize },
    })
    rows.push(...response.datas)
    total = response.total
    page += 1
  } while (rows.length < total)
  return rows
}
```

- [ ] **Step 4: 实现项目级数据组合和查询纯函数**

创建 `project-experiment-reports.ts`，导出以下稳定接口：

```ts
import type { DatasetRecord } from '@/modules/app-evaluation/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  ExperimentReport,
  ExperimentReportBaseline,
  ProjectExperimentReport,
  ProjectExperimentSource,
} from '../types'

type SourceLoaders = {
  projectId: string
  loadDatasets: () => Promise<DatasetRecord[]>
  loadReports: (datasetId: string) => Promise<ExperimentReport[]>
  loadBaselines: (datasetId: string) => Promise<ExperimentReportBaseline[]>
}

export async function loadProjectExperimentSource({
  loadDatasets,
  loadReports,
  loadBaselines,
}: SourceLoaders): Promise<ProjectExperimentSource> {
  const datasets = await loadDatasets()
  const results = await Promise.allSettled(
    datasets.map(async (dataset) => {
      const [reports, baselines] = await Promise.all([
        loadReports(dataset.id),
        loadBaselines(dataset.id),
      ])
      return {
        dataset,
        baselines,
        reports: reports.map((report) => ({
          ...report,
          datasetName: dataset.name,
          datasetType: dataset.type,
          datasetItemCount: dataset.itemCount,
          datasetUpdatedAt: dataset.updatedAt,
        })),
      }
    })
  )

  return results.reduce<ProjectExperimentSource>(
    (source, result, index) => {
      const dataset = datasets[index]
      if (!dataset) return source
      if (result.status === 'fulfilled') {
        source.reports.push(...result.value.reports)
        source.baselines.push(...result.value.baselines)
        return source
      }
      source.failedDatasets.push({
        datasetId: dataset.id,
        datasetName: dataset.name,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : '试验报告加载失败',
      })
      return source
    },
    { datasets, reports: [], baselines: [], failedDatasets: [] }
  )
}

export function queryProjectExperimentReports(
  rows: ProjectExperimentReport[],
  state: DataTableQueryState
): DataTableListResponse<ProjectExperimentReport> {
  const keyword = state.keyword.trim().toLowerCase()
  const datasetIds = (state.filters.datasetId as string[] | undefined) ?? []
  const statuses = (state.filters.status as string[] | undefined) ?? []
  const filtered = rows.filter((row) => {
    const matchesKeyword =
      !keyword ||
      [
        row.name,
        row.experimentName,
        row.datasetName,
        row.sceneSnapshot.name,
        row.webhookSnapshot.name,
      ].some((value) => value.toLowerCase().includes(keyword))
    return (
      matchesKeyword &&
      (!datasetIds.length || datasetIds.includes(row.datasetId)) &&
      (!statuses.length || statuses.includes(row.status))
    )
  })

  const sorting = state.sorting[0] ?? { id: 'createdAt', desc: true }
  const sorted = [...filtered].sort((left, right) => {
    const leftValue = String(left[sorting.id as keyof ProjectExperimentReport] ?? '')
    const rightValue = String(right[sorting.id as keyof ProjectExperimentReport] ?? '')
    return sorting.desc
      ? rightValue.localeCompare(leftValue)
      : leftValue.localeCompare(rightValue)
  })
  const start = (state.page - 1) * state.pageSize
  return {
    total: sorted.length,
    datas: sorted.slice(start, start + state.pageSize),
  }
}
```

- [ ] **Step 5: 将对比规则补充数据集作用域**

把 `CompareCandidate` 和判断改为：

```ts
type CompareCandidate = {
  status: string
  datasetId: string
  sceneId: string
  serviceFamily: string
}

return reports.every(
  (report) =>
    report.datasetId === reports[0]?.datasetId &&
    report.sceneId === reports[0]?.sceneId &&
    report.serviceFamily === reports[0]?.serviceFamily
)
```

- [ ] **Step 6: 运行测试并确认 GREEN**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/project-experiment-reports.test.ts \
  src/tests/scene-experiments/domain-rules.test.ts
```

Expected: PASS。

---

### Task 3: 通用报告列和项目级报告表格

**Files:**

- Modify: `pa-eval-frontend/src/tests/scene-experiments/dataset-experiment-source.test.ts`
- Create: `pa-eval-frontend/src/tests/scene-experiments/scene-experiment-layout-source.test.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-report-columns.tsx`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/components/dataset-experiment-reports.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/project-experiment-reports.tsx`

- [ ] **Step 1: 写项目级报告表格失败测试**

在 `scene-experiment-layout-source.test.ts` 中加入：

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

test('project report table exposes dataset and status filters with partial failure feedback', () => {
  const source = read(
    '../../modules/scene-experiments/components/project-experiment-reports.tsx'
  )
  assert.ok(source.includes('数据集'))
  assert.ok(source.includes('状态'))
  assert.ok(source.includes('failedDatasets'))
  assert.ok(source.includes('部分数据集报告加载失败'))
  assert.ok(source.includes('项目试验报告加载失败'))
  assert.ok(source.includes('source.datasets.length === source.failedDatasets.length'))
  assert.ok(source.includes('queryProjectExperimentReports'))
  assert.ok(source.includes('loadProjectExperimentSource'))
  assert.ok(source.includes("source: 'project'"))
})

test('report columns support project and dataset navigation sources', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-report-columns.tsx'
  )
  assert.ok(source.includes('showDataset'))
  assert.ok(source.includes('datasetName'))
  assert.ok(source.includes('buildExperimentReportHref'))
})
```

在原 `dataset-experiment-source.test.ts` 增加断言，确保数据集上下文继续使用：

```ts
assert.ok(source.includes("source: 'dataset'"))
assert.ok(source.includes('当前数据集暂无试验报告'))
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/scene-experiment-layout-source.test.ts \
  src/tests/scene-experiments/dataset-experiment-source.test.ts
```

Expected: FAIL，项目级组件不存在，报告列尚未支持来源和数据集列。

- [ ] **Step 3: 泛化报告列，不复制业务列逻辑**

将 `createExperimentReportColumns` 改为泛型配置：

```ts
type ExperimentReportColumnOptions<TReport extends ExperimentReport> = {
  projectId: string
  source: ExperimentNavigationSource
  baselines: ExperimentReportBaseline[]
  showDataset?: boolean
  getDatasetName?: (report: TReport) => string
  onSetBaseline: (report: TReport) => void
  onCompareBaseline: (
    report: TReport,
    baseline: ExperimentReportBaseline
  ) => void
}

export function createExperimentReportColumns<
  TReport extends ExperimentReport,
>(options: ExperimentReportColumnOptions<TReport>): ColumnDef<TReport>[] {
  const columns = createBaseExperimentReportColumns(options)

  if (options.showDataset) {
    columns.splice(2, 0, {
      id: 'datasetName',
      header: '数据集',
      cell: ({ row }) => options.getDatasetName?.(row.original) ?? '-',
    })
  }

  return columns
}
```

`createBaseExperimentReportColumns(options)` 是当前函数中已有列定义的私有提取函数，必须返回以下完整列顺序，不改各列现有 cell 内容：

```ts
[
  'select',
  'name',
  'service',
  'status',
  'rounds',
  'scores',
  'completedAt',
  'actions',
]
```

其中只允许两处行为变化：名称列用 `buildExperimentReportHref` 生成链接；项目模式在名称列后插入 `datasetName`。以下既有契约必须继续由 `dataset-experiment-source.test.ts` 断言：仅完成报告可选、`设为基线 / 当前基线 / 对比基线 / 设为新基线` 文案、操作列 `w-[118px]` 和按钮 `h-[30px] w-[94px]`。

名称链接统一改为：

```tsx
<Link
  to={buildExperimentReportHref({
    projectId: options.projectId,
    datasetId: row.original.datasetId,
    reportId: row.original.id,
    source: options.source,
  })}
>
  {row.original.name}
</Link>
```

- [ ] **Step 4: 将数据集报告组件切换到通用列和来源 helper**

`DatasetExperimentReports` 调用列函数时传：

```ts
createExperimentReportColumns<ExperimentReport>({
  projectId,
  source: 'dataset',
  baselines,
  onSetBaseline: setBaselineReport,
  onCompareBaseline: (report, baseline) => {
    navigate(
      buildExperimentAnalysisHref({
        type: 'compare',
        projectId,
        datasetId,
        reportIds: [baseline.reportId, report.id],
        source: 'dataset',
      })
    )
  },
})
```

聚合和对比按钮也使用 `buildExperimentAnalysisHref`，并给 `canCompareReports` 候选补上 `datasetId`。

- [ ] **Step 5: 实现项目级报告组件**

`ProjectExperimentReports` 使用一个顶层 source query 和一个纯分页 `DataTable` query：

```tsx
const sourceQuery = useQuery({
  queryKey: ['project-experiment-source', $api, projectId],
  queryFn: () =>
    loadProjectExperimentSource({
      projectId,
      loadDatasets: () => listAllProjectDatasets($api, projectId),
      loadReports: (datasetId) =>
        listAllDatasetExperimentReports($api, projectId, datasetId),
      loadBaselines: (datasetId) =>
        listExperimentReportBaselines($api, projectId, datasetId),
    }),
  refetchInterval: (query) =>
    query.state.data?.reports.some((report) =>
      ['QUEUED', 'RUNNING', 'SCORING'].includes(report.status)
    )
      ? 1500
      : false,
})
```

加载完成后渲染：

```tsx
const allDatasetsFailed =
  source.datasets.length > 0 &&
  source.datasets.length === source.failedDatasets.length

{allDatasetsFailed ? (
  <Alert variant='destructive'>
    <AlertTriangle />
    <AlertTitle>项目试验报告加载失败</AlertTitle>
    <AlertDescription>
      当前项目全部数据集的试验报告均加载失败，请点击页面刷新后重试。
    </AlertDescription>
  </Alert>
) : null}

{!allDatasetsFailed && source.failedDatasets.length ? (
  <Alert>
    <AlertTriangle />
    <AlertTitle>部分数据集报告加载失败</AlertTitle>
    <AlertDescription>
      已保留成功加载的数据，共 {source.failedDatasets.length} 个数据集失败。
    </AlertDescription>
  </Alert>
) : null}

{!allDatasetsFailed ? (
  <DataTable<ProjectExperimentReport>
    columns={columns}
    request={{
      queryKey: (state) => [
        'project-experiment-report-view',
        projectId,
        sourceQuery.dataUpdatedAt,
        state,
      ],
      queryFn: async (state) =>
        queryProjectExperimentReports(source.reports, state),
      enabled: sourceQuery.isSuccess,
    }}
    urlState={{
      pageKey: 'experimentPage',
      pageSizeKey: 'experimentPageSize',
      globalFilterKey: 'experimentKeyword',
      sortKey: 'experimentSort',
      defaultPageSize: 10,
      filters: [
        { fieldId: 'datasetId', type: 'array' },
        { fieldId: 'status', type: 'array' },
      ],
    }}
    toolbar={{
      searchPlaceholder: '搜索试验、场景、服务或数据集',
      filters: [datasetFilter, statusFilter],
      columnLabels,
    }}
    bulkActions={projectBulkActions}
    emptyText='当前项目暂无场景试验报告'
  />
) : null}
```

项目级基线 mutation 成功后只失效 `project-experiment-source`；详情基线对话框继续复用 `ExperimentBaselineDialog`。聚合与对比链接使用所选报告共同的 `datasetId` 和 `source: 'project'`。

- [ ] **Step 6: 运行测试并确认 GREEN**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/scene-experiment-layout-source.test.ts \
  src/tests/scene-experiments/dataset-experiment-source.test.ts
```

Expected: PASS。

---

### Task 4: 双 Tab 页面和原场景管理视图迁移

**Files:**

- Modify: `pa-eval-frontend/src/tests/scene-experiments/scene-management-source.test.ts`
- Modify: `pa-eval-frontend/src/tests/scene-experiments/scene-experiment-layout-source.test.ts`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/scene-management-table.tsx`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/views/scenes.tsx`

- [ ] **Step 1: 写双 Tab 和场景管理回归失败测试**

在 `scene-experiment-layout-source.test.ts` 增加：

```ts
test('scene page defaults to experiments and exposes both function tabs', () => {
  const source = read('../../modules/scene-experiments/views/scenes.tsx')
  assert.ok(source.includes('normalizeSceneExperimentTab'))
  assert.ok(source.includes("tab === 'management'"))
  assert.ok(source.includes('场景试验'))
  assert.ok(source.includes('场景管理'))
  assert.ok(source.includes('新建场景试验'))
  assert.ok(source.includes('刷新'))
  assert.ok(source.includes('新增场景'))
  assert.ok(source.includes('ProjectExperimentReports'))
  assert.ok(source.includes('SceneManagementTable'))
})
```

在 `scene-management-source.test.ts` 将列表源文件改为新组件并保留 CRUD 断言：

```ts
const list = read(
  '../../modules/scene-experiments/components/scene-management-table.tsx'
)
assert.ok(list.includes('listProjectScenes'))
assert.ok(list.includes('搜索场景名称'))
assert.ok(list.includes('SceneFormDrawer'))
assert.ok(list.includes('deleteProjectScene'))
assert.ok(list.includes('patchProjectScene'))
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/scene-management-source.test.ts \
  src/tests/scene-experiments/scene-experiment-layout-source.test.ts
```

Expected: FAIL，新组件和双 Tab 尚未实现。

- [ ] **Step 3: 抽取场景管理视图**

将原 `ProjectScenes` 的 scene CRUD、列、`DataTable` 和 `SceneFormDrawer` 迁入 `SceneManagementTable`。组件只接收：

```ts
type SceneManagementTableProps = {
  projectId: string
  createRequestId?: number
}
```

当 `createRequestId` 变化且大于 `0` 时执行：

```ts
useEffect(() => {
  if (!createRequestId) return
  setEditingScene(null)
  setDrawerOpen(true)
}, [createRequestId])
```

原有新增、编辑、启停、删除确认、查询 key、筛选和 toast 文案全部保留。

- [ ] **Step 4: 将 `/scenes` 页面改为统一页面壳**

`ProjectScenes` 维护：

```ts
const [searchParams] = useSearchParams()
const tab = normalizeSceneExperimentTab(searchParams.get('tab'))
const [experimentDrawerOpen, setExperimentDrawerOpen] = useState(false)
const [createSceneRequestId, setCreateSceneRequestId] = useState(0)
```

`PageNav` 的 Tab 链接和操作按钮：

```tsx
<PageNav
  leading={<h1 className='text-lg font-semibold'>场景试验</h1>}
  topNav={{
    variant: 'underline',
    links: [
      {
        title: '场景试验',
        href: `/projects/${projectId}/scenes?tab=experiments`,
        isActive: tab === 'experiments',
      },
      {
        title: '场景管理',
        href: `/projects/${projectId}/scenes?tab=management`,
        isActive: tab === 'management',
      },
    ],
  }}
  buttonGroups={{
    buttons:
      tab === 'experiments'
        ? [
            {
              id: 'refresh-experiments',
              label: '刷新',
              icon: RefreshCw,
              iconPosition: 'start',
              variant: 'outline',
              size: 'sm',
              onClick: handleRefreshExperiments,
            },
            {
              id: 'create-experiment',
              label: '新建场景试验',
              icon: Plus,
              iconPosition: 'start',
              size: 'sm',
              onClick: () => setExperimentDrawerOpen(true),
            },
          ]
        : [
            {
              id: 'create-scene',
              label: '新增场景',
              icon: Plus,
              iconPosition: 'start',
              size: 'sm',
              onClick: () => setCreateSceneRequestId((value) => value + 1),
            },
          ],
  }}
/>
```

内容区只渲染一个视图：

```tsx
{tab === 'experiments' ? (
  <ProjectExperimentReports projectId={projectId} />
) : (
  <SceneManagementTable
    projectId={projectId}
    createRequestId={createSceneRequestId}
  />
)}
```

刷新调用：

```ts
await queryClient.invalidateQueries({
  queryKey: ['project-experiment-source', $api, projectId],
})
toast.success('场景试验已刷新')
```

- [ ] **Step 5: 运行测试并确认 GREEN**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/scene-management-source.test.ts \
  src/tests/scene-experiments/scene-experiment-layout-source.test.ts
```

Expected: PASS。

---

### Task 5: 五步统一向导、数据集单选和执行配置合并

**Files:**

- Modify: `pa-eval-frontend/src/tests/scene-experiments/dataset-experiment-source.test.ts`
- Modify: `pa-eval-frontend/src/tests/scene-experiments/scene-experiment-layout-source.test.ts`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-dataset-step.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-selectable-card.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-execution-step.tsx`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-run-drawer.tsx`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/views/scenes.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/dataset-detail.tsx`

- [ ] **Step 1: 更新五步顺序和双入口失败测试**

把 `dataset-experiment-source.test.ts` 的步骤断言改为：

```ts
for (const label of [
  '选择场景',
  '选择数据集',
  '选择评估器',
  '执行配置',
  '确认执行',
]) {
  assert.ok(source.includes(label), label)
}

assert.ok(source.includes('lockedDataset'))
assert.ok(source.includes('ExperimentDatasetStep'))
assert.ok(source.includes('ExperimentExecutionStep'))
assert.ok(!source.includes("title: '选择 Webhook'"))
assert.ok(!source.includes("title: '运行参数'"))
```

在 `scene-experiment-layout-source.test.ts` 增加：

```ts
test('dataset step supports project selection and locked dataset summary', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-dataset-step.tsx'
  )
  assert.ok(source.includes('RadioGroup'))
  assert.ok(source.includes('listProjectDatasets'))
  assert.ok(source.includes('搜索数据集名称或描述'))
  assert.ok(source.includes('数据集类型'))
  assert.ok(source.includes('当前数据集已锁定'))
})

test('execution step combines webhook selection and run parameters', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-execution-step.tsx'
  )
  assert.ok(source.includes('选择 Webhook 服务'))
  assert.ok(source.includes('运行参数'))
  assert.ok(source.includes('lg:grid-cols-2'))
  assert.ok(source.includes('执行轮次'))
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/dataset-experiment-source.test.ts \
  src/tests/scene-experiments/scene-experiment-layout-source.test.ts
```

Expected: FAIL，向导仍为旧步骤结构，新子组件不存在。

- [ ] **Step 3: 实现数据集选择步骤**

定义锁定上下文：

```ts
export type LockedExperimentDataset = {
  dataset: DatasetRecord
  activeItemCount: number
}
```

`ExperimentDatasetStep` props：

```ts
type ExperimentDatasetStepProps = {
  projectId: string
  selectedDatasetId: string
  lockedDataset?: LockedExperimentDataset
  onSelect: (dataset: DatasetRecord) => void
}
```

锁定入口渲染只读摘要和“当前数据集已锁定”；项目入口使用：

```tsx
<RadioGroup value={selectedDatasetId} onValueChange={handleSelectId}>
  <DataTable<DatasetRecord>
    enableRowSelection={false}
    columns={datasetSelectionColumns}
    request={{
      queryKey: (state) => [
        'experiment-dataset-picker',
        $api,
        projectId,
        state,
      ],
      queryFn: (state) =>
        listProjectDatasets(
          $api,
          projectId,
          state,
          ((state.filters.type as string[] | undefined)?.[0] ?? 'all') as DatasetTypeFilter
        ),
    }}
    urlState={{
      pageKey: 'datasetPickerPage',
      pageSizeKey: 'datasetPickerPageSize',
      globalFilterKey: 'datasetPickerKeyword',
      defaultPageSize: 5,
      filters: [{ fieldId: 'type', type: 'array' }],
    }}
    toolbar={{
      searchPlaceholder: '搜索数据集名称或描述',
      filters: [datasetTypeFilter],
      columnLabels: datasetColumnLabels,
    }}
    emptyText='当前项目暂无数据集'
  />
</RadioGroup>
```

首列使用 `RadioGroupItem value={row.original.id}`；其他列展示名称、描述、类型、数据量和更新时间。无数据集时在表格下提供跳转 `/projects/${projectId}/evaluation/datasets` 的“前往数据集管理”。

- [ ] **Step 4: 实现执行配置合并步骤**

`ExperimentExecutionStep` props：

```ts
type ExperimentExecutionStepProps = {
  scene: SceneRecord
  selectedWebhookIds: string[]
  runParameters: SceneRunParameters
  onWebhookIdsChange: (ids: string[]) => void
  onRunParametersChange: (parameters: SceneRunParameters) => void
  onViewWebhook: (webhook: SceneWebhookService) => void
}
```

结构固定为：

```tsx
<div className='grid gap-5 lg:grid-cols-2'>
  <SelectionGrid
    title='选择 Webhook 服务'
    description='每个选中服务会生成一份独立报告。'
  >
    {scene.webhooks.map((webhook) => (
      <ExperimentSelectableCard
        key={webhook.id}
        checked={selectedWebhookIds.includes(webhook.id)}
        title={webhook.name}
        description={`${webhook.serviceFamily} · v${webhook.version}`}
        meta={webhook.url}
        onCheckedChange={(checked) =>
          onWebhookIdsChange(
            checked
              ? [...selectedWebhookIds, webhook.id]
              : selectedWebhookIds.filter((id) => id !== webhook.id)
          )
        }
        onView={() => onViewWebhook(webhook)}
      />
    ))}
  </SelectionGrid>
  <section className='flex flex-col gap-4 rounded-lg border p-5'>
    <div>
      <h3 className='text-sm font-semibold'>运行参数</h3>
      <p className='text-muted-foreground mt-1 text-xs'>
        已从场景默认配置带出，可仅覆盖本次试验。
      </p>
    </div>
    <div className='grid gap-4 sm:grid-cols-2'>
      <NumberField
        label='并发数'
        value={runParameters.concurrency}
        min={1}
        max={50}
        suffix='个并发'
        onChange={(concurrency) =>
          onRunParametersChange({ ...runParameters, concurrency })
        }
      />
      <NumberField
        label='超时时间'
        value={runParameters.timeoutSeconds}
        min={1}
        max={600}
        suffix='秒'
        onChange={(timeoutSeconds) =>
          onRunParametersChange({ ...runParameters, timeoutSeconds })
        }
      />
      <NumberField
        label='重试次数'
        value={runParameters.retryCount}
        min={0}
        max={10}
        suffix='次'
        onChange={(retryCount) =>
          onRunParametersChange({ ...runParameters, retryCount })
        }
      />
      <NumberField
        label='执行轮次'
        value={runParameters.rounds}
        min={1}
        max={20}
        suffix='轮'
        onChange={(rounds) =>
          onRunParametersChange({ ...runParameters, rounds })
        }
      />
    </div>
  </section>
</div>
```

将现有 `SelectableCard` 移入 `experiment-selectable-card.tsx` 并导出为 `ExperimentSelectableCard`，Webhook 和评估器都使用该组件；将 `NumberField` 移入 `experiment-execution-step.tsx` 并由该文件私有使用。删除抽屉文件中的旧定义，避免保留重复实现。

- [ ] **Step 5: 重构统一抽屉 props、状态和校验**

将 props 改为：

```ts
type ExperimentRunDrawerProps = {
  open: boolean
  projectId: string
  lockedDataset?: LockedExperimentDataset
  onOpenChange: (open: boolean) => void
  onCreated: (reports: ExperimentReport[]) => void
}
```

步骤改为：

```ts
const experimentSteps = [
  { id: 'scene', title: '选择场景', description: '试验信息与模板' },
  { id: 'dataset', title: '选择数据集', description: '确定试验数据' },
  { id: 'evaluator', title: '选择评估器', description: '评分维度' },
  { id: 'execution', title: '执行配置', description: '服务与运行参数' },
  { id: 'summary', title: '确认执行', description: '汇总并提交' },
]
```

状态增加：

```ts
const [selectedDataset, setSelectedDataset] = useState<DatasetRecord | null>(
  lockedDataset?.dataset ?? null
)
```

项目入口选中数据集后查询有效数据量：

```ts
const metricQuery = useQuery({
  queryKey: [
    'experiment-dataset-metrics',
    $api,
    projectId,
    selectedDataset?.id,
  ],
  queryFn: () =>
    getProjectDatasetMetricSummary($api, projectId, selectedDataset!.id),
  enabled: open && !lockedDataset && Boolean(selectedDataset),
})

const activeItemCount =
  lockedDataset?.activeItemCount ?? metricQuery.data?.active ?? 0
```

校验顺序：

```ts
if (targetStep > 0 && (!name.trim() || !sceneId)) {
  toast.error('请输入试验名称并选择场景')
  setStep(0)
  return false
}
if (targetStep > 1 && !selectedDataset) {
  toast.error('请选择一个数据集')
  setStep(1)
  return false
}
if (targetStep > 2 && selectedEvaluatorIds.length === 0) {
  toast.error('请至少选择一个评估器')
  setStep(2)
  return false
}
if (targetStep > 3 && selectedWebhookIds.length === 0) {
  toast.error('请至少选择一个 Webhook 服务')
  setStep(3)
  return false
}
if (targetStep > 3 && !parametersAreValid(runParameters)) {
  toast.error('请检查本次试验的运行参数范围')
  setStep(3)
  return false
}
if (targetStep >= experimentSteps.length && activeItemCount === 0) {
  toast.error('所选数据集暂无有效数据项，无法发起试验')
  setStep(1)
  return false
}
```

提交使用 `selectedDataset.id`：

```ts
createDatasetExperiment($api, projectId, selectedDataset!.id, input)
```

切换场景继续保留名称和描述，并清空 Webhook、评估器，恢复新场景默认参数；切换数据集不清空场景、评估器或执行配置。

- [ ] **Step 6: 接入项目入口和数据集快捷入口**

在 `scenes.tsx` 中：

```tsx
<ExperimentRunDrawer
  open={experimentDrawerOpen}
  projectId={projectId}
  onOpenChange={setExperimentDrawerOpen}
  onCreated={async () => {
    await queryClient.invalidateQueries({
      queryKey: ['project-experiment-source', $api, projectId],
    })
  }}
/>
```

在 `dataset-detail.tsx` 中保留按钮和报告 Tab，只改 props：

```tsx
<ExperimentRunDrawer
  open={experimentDrawerOpen}
  projectId={projectId}
  lockedDataset={
    dataset && metrics
      ? { dataset, activeItemCount: metrics.active }
      : undefined
  }
  onOpenChange={setExperimentDrawerOpen}
  onCreated={() => setActiveTab('reports')}
/>
```

“试验报告”Tab 继续传当前 `datasetId` 给 `DatasetExperimentReports`，不改当前数据集查询逻辑。

- [ ] **Step 7: 运行测试并确认 GREEN**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/dataset-experiment-source.test.ts \
  src/tests/scene-experiments/scene-experiment-layout-source.test.ts
```

Expected: PASS。

---

### Task 6: 报告详情和分析页面恢复来源

**Files:**

- Modify: `pa-eval-frontend/src/tests/scene-experiments/report-analysis-source.test.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/views/experiment-report-detail.tsx`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/views/experiment-aggregate.tsx`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/views/experiment-compare.tsx`

- [ ] **Step 1: 写来源返回失败测试**

在 `report-analysis-source.test.ts` 增加：

```ts
for (const path of [
  '../../modules/scene-experiments/views/experiment-report-detail.tsx',
  '../../modules/scene-experiments/views/experiment-aggregate.tsx',
  '../../modules/scene-experiments/views/experiment-compare.tsx',
]) {
  const source = read(path)
  assert.ok(source.includes('buildExperimentReturnHref'), path)
  assert.ok(source.includes("searchParams.get('source')"), path)
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/report-analysis-source.test.ts
```

Expected: FAIL，三个页面仍固定返回数据集详情。

- [ ] **Step 3: 三个页面统一使用来源 helper**

每个页面读取：

```ts
const [searchParams] = useSearchParams()
const source = searchParams.get('source')
```

返回按钮改为：

```tsx
onBack={() =>
  navigate(
    buildExperimentReturnHref({
      projectId,
      datasetId,
      source,
    })
  )
}
```

聚合和对比页面保留 `reportIds` 读取、查询、阈值、错误提示和展示逻辑，不修改分析规则。

- [ ] **Step 4: 运行测试并确认 GREEN**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/experiment-navigation.test.ts \
  src/tests/scene-experiments/report-analysis-source.test.ts
```

Expected: PASS。

---

### Task 7: 完整回归、质量门禁和浏览器验证

**Files:**

- Modify only files required by defects found during verification.

- [ ] **Step 1: 运行场景试验相关测试**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types \
  src/tests/scene-experiments/*.test.ts \
  src/hooks/use-sidebar-data.test.ts
```

Expected: 全部 PASS，无未处理 rejection。

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: exit code `0`。

- [ ] **Step 3: 运行 ESLint**

Run:

```bash
cd pa-eval-frontend
npm run lint
```

Expected: exit code `0`，无新增 error；如仓库存在既有 warning，记录但不扩大范围。

- [ ] **Step 4: 运行生产构建**

Run:

```bash
cd pa-eval-frontend
npm run build
```

Expected: `tsc -b` 和 Vite build 成功。

- [ ] **Step 5: 启动 Mock 前端**

Run:

```bash
cd pa-eval-frontend
npm run dev:mock -- --host 127.0.0.1
```

Expected: Vite 输出可访问的本地 URL；若默认端口被占用，使用 Vite 自动分配的新端口。

- [ ] **Step 6: 桌面浏览器验证项目级入口**

依次确认：

1. 侧边栏显示“场景试验”，进入后默认选中“场景试验”Tab。
2. 项目级报告表格包含数据集列、数据集筛选、状态筛选、刷新和新建按钮。
3. 切换到“场景管理”后，新增、搜索、查看、编辑、启停和删除入口仍存在。
4. 新建场景试验共五步，第二步可搜索并单选数据集，第三步为评估器，第四步同时展示 Webhook 与运行参数。
5. 提交后停留在项目级报告列表，新报告显示排队或运行状态。
6. 从项目级列表进入报告详情、聚合或对比后，返回“场景试验”Tab。

- [ ] **Step 7: 桌面浏览器验证数据集快捷入口**

依次确认：

1. 数据集详情仍包含“数据项 / 试验报告”Tab 和“场景试验”按钮。
2. 快捷入口第二步只读展示当前数据集，不允许切换。
3. 提交后自动切换到当前数据集“试验报告”Tab。
4. 该 Tab 只展示当前数据集报告。
5. 从该 Tab 进入详情或分析后返回当前数据集报告 Tab。

- [ ] **Step 8: 移动端和窄屏验证**

使用约 `390 × 844` 视口确认：

1. `PageNav` Tab 可通过移动端菜单访问。
2. 页面按钮不重叠、不溢出。
3. 五步 Stepper 文本不遮挡。
4. “执行配置”从双栏切换为单栏。
5. 数据集表格可在稳定宽度容器中横向滚动，不挤压单选控件。

- [ ] **Step 9: 检查最终改动范围**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected:

- 无 whitespace error。
- 无后端、数据库、`langfuse/`、`dify/` 改动。
- 未执行 `git commit`、`git push` 或创建 PR。
