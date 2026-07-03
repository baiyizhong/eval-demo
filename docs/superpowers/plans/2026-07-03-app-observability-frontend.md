# App Observability Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the app observability frontend pages with Trace dashboard, Trace log DataTable, frontend-only mock APIs, row-selection bulk actions, and Trace detail/edit drawer.

**Architecture:** Add a new `app-observability` frontend module under `pa-eval-frontend/src/modules`. The module uses local async mock API functions that return PRD-shaped data, so no backend code, backend routes, database migrations, or Langfuse code are touched. The UI composes existing `Page`, `PageNav`, `DataTable`, `Drawer`, `LLMTraceChain`, shadcn/ui components, and Recharts.

**Tech Stack:** React 19, TypeScript, React Router, React Query through `DataTable`, TanStack Table, Tailwind CSS v4 semantic tokens, shadcn/ui, Radix UI, Recharts, lucide-react, zod.

---

## Scope Constraints

- Do not modify `pa-eval-backend/`.
- Do not modify `langfuse/`.
- Do not add Alembic migrations.
- Do not register real backend API aliases for this iteration.
- Do not call network APIs for this module.
- Use module-local mock API functions with Promise-based signatures that can later be replaced by real `$api` calls.
- Do not commit changes unless the user explicitly asks.

## File Structure

Create:

- `pa-eval-frontend/src/modules/app-observability/types.ts`  
  Owns Trace row/detail/metrics/filter types and status/environment option types.

- `pa-eval-frontend/src/modules/app-observability/lib/format.ts`  
  Owns display formatting for latency, date/time, percentages, and JSON-safe strings.

- `pa-eval-frontend/src/modules/app-observability/api/mock-trace-api.ts`  
  Frontend-only mock interface. Exports async functions: `getTraceMetricsMock`, `listProjectTracesMock`, `getProjectTraceMock`, `patchProjectTraceMock`, `exportProjectTracesMock`, `createAnnotationTaskMock`.

- `pa-eval-frontend/src/modules/app-observability/data/mock-traces.ts`  
  Static mock records only. No executable logic except exported constants.

- `pa-eval-frontend/src/modules/app-observability/components/observability-page-nav.tsx`  
  Module-level `PageNav` wrapper for `Trace 看板` and `Trace 日志`.

- `pa-eval-frontend/src/modules/app-observability/components/status-badge.tsx`  
  Trace status badge.

- `pa-eval-frontend/src/modules/app-observability/components/copyable-text.tsx`  
  Small module-private text-with-copy control for Trace ID and Session ID.

- `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-filters.tsx`  
  Dashboard-only time range and environment controls.

- `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-cards.tsx`  
  KPI card grid.

- `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-charts.tsx`  
  Recharts trend, latency, and environment charts.

- `pa-eval-frontend/src/modules/app-observability/components/slow-trace-ranking.tsx`  
  Slow Trace ranking list/table.

- `pa-eval-frontend/src/modules/app-observability/components/trace-log-columns.tsx`  
  TanStack column definitions for DataTable.

- `pa-eval-frontend/src/modules/app-observability/components/trace-log-filters.tsx`  
  DataTable toolbar/faceted/filter-panel configuration only. No separate filter UI.

- `pa-eval-frontend/src/modules/app-observability/components/trace-log-bulk-actions.tsx`  
  DataTable bulk actions shown only after row selection.

- `pa-eval-frontend/src/modules/app-observability/components/trace-detail-drawer.tsx`  
  Enhanced right Drawer for view/edit modes.

- `pa-eval-frontend/src/modules/app-observability/views/trace-dashboard.tsx`  
  Trace dashboard page view.

- `pa-eval-frontend/src/modules/app-observability/views/trace-logs.tsx`  
  Trace log DataTable page view.

- `pa-eval-frontend/src/modules/app-observability/index.tsx`  
  Module route shell and nested outlet redirect.

- `pa-eval-frontend/src/tests/app-observability.types.test.tsx`  
  Type-level and behavior-light tests for mock API shape and formatting.

Modify:

- `pa-eval-frontend/src/routes/index.tsx`  
  Add frontend routes under `SidebarLayout`.

---

### Task 1: Types, Formatters, and Static Mock Data

**Files:**
- Create: `pa-eval-frontend/src/modules/app-observability/types.ts`
- Create: `pa-eval-frontend/src/modules/app-observability/lib/format.ts`
- Create: `pa-eval-frontend/src/modules/app-observability/data/mock-traces.ts`
- Create: `pa-eval-frontend/src/tests/app-observability.types.test.tsx`

- [ ] **Step 1: Add focused tests for formatting and mock shape**

Create `pa-eval-frontend/src/tests/app-observability.types.test.tsx`:

```tsx
import {
  formatLatency,
  formatPercent,
} from '@/modules/app-observability/lib/format'
import { mockTraceDetails } from '@/modules/app-observability/data/mock-traces'
import type { TraceStatus } from '@/modules/app-observability/types'

function assertType<T>(_value: T) {}

export const latencyMsUsage: string = formatLatency(345)
export const latencySecondsUsage: string = formatLatency(1234)
export const percentUsage: string = formatPercent(0.125)

const firstTrace = mockTraceDetails[0]

assertType<TraceStatus>(firstTrace.status)

export const traceDetailShapeUsage = {
  traceId: firstTrace.traceId,
  status: firstTrace.status,
  callChain: firstTrace.callChain,
}
```

- [ ] **Step 2: Run test to verify it fails before files exist**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: FAIL because `@/modules/app-observability/lib/format` and mock data files do not exist.

- [ ] **Step 3: Create `types.ts`**

Create `pa-eval-frontend/src/modules/app-observability/types.ts`:

```ts
import type { TreeNode } from '@/components/business/llm-trace-chain'

export type TraceStatus = 'success' | 'failed' | 'running' | 'unknown'

export type TraceEnvironment = 'production' | 'staging' | 'testing'

export type TraceLogRow = {
  traceId: string
  sessionId: string
  projectId: string
  projectName: string
  environment: TraceEnvironment
  status: TraceStatus
  latency: number
  createdAt: string
  userId: string
  businessId: string
  tags: string[]
}

export type TraceDetail = TraceLogRow & {
  updatedAt: string
  input: string
  output: string
  metadata: Record<string, unknown>
  callChain: TreeNode[]
}

export type TraceMetricSummary = {
  total: number
  success: number
  failed: number
  failureRate: number
  averageLatency: number
  p95Latency: number
  totalChangeRate: number
}

export type TraceTrendPoint = {
  time: string
  total: number
  failed: number
}

export type TraceLatencyPoint = {
  time: string
  averageLatency: number
  p95Latency: number
}

export type TraceEnvironmentPoint = {
  environment: TraceEnvironment
  count: number
}

export type TraceMetrics = {
  summary: TraceMetricSummary
  traceTrend: TraceTrendPoint[]
  latencyTrend: TraceLatencyPoint[]
  environmentDistribution: TraceEnvironmentPoint[]
  slowTraces: TraceLogRow[]
}

export type TraceListQuery = {
  projectId: string
  page: number
  pageSize: number
  keyword?: string
  createdAtRange?: string[]
  environments?: string[]
  statuses?: string[]
  tags?: string[]
  latencyMin?: string
  latencyMax?: string
  sessionId?: string
  userId?: string
  businessId?: string
  metadataKey?: string
  metadataValue?: string
}

export type TraceListResponse = {
  total: number
  datas: TraceLogRow[]
}

export type TracePatchInput = {
  input: string
  output: string
  metadata: Record<string, unknown>
}

export type AnnotationTaskResult = {
  taskId: string
  traceCount: number
}
```

- [ ] **Step 4: Create formatting helpers**

Create `pa-eval-frontend/src/modules/app-observability/lib/format.ts`:

```ts
export function formatLatency(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '-'
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`
  }

  return `${(value / 1000).toFixed(2)}s`
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return '-'
  }

  if (value === 0) {
    return '0%'
  }

  return `${(value * 100).toFixed(1)}%`
}

export function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}
```

- [ ] **Step 5: Create static mock Trace data**

Create `pa-eval-frontend/src/modules/app-observability/data/mock-traces.ts`:

```ts
import type { TraceDetail } from '../types'

const projectId = 'project_customer_agent'
const projectName = '客服 Agent'

export const mockTraceDetails: TraceDetail[] = [
  {
    traceId: 'trace_20260703_0001',
    sessionId: 'session_order_8842',
    projectId,
    projectName,
    environment: 'production',
    status: 'success',
    latency: 1234,
    createdAt: '2026-07-03T02:12:00Z',
    updatedAt: '2026-07-03T02:12:02Z',
    userId: 'user_1024',
    businessId: 'order_8842',
    tags: ['agent', 'customer-service'],
    input: '用户询问订单 order_8842 的物流进度。',
    output: '订单正在配送中，预计今天 18:00 前送达。',
    metadata: {
      channel: 'web',
      businessId: 'order_8842',
      city: '杭州',
    },
    callChain: [
      {
        id: 'root-0001',
        type: 'ingress',
        title: 'Agent request',
        duration: '1.23s',
        children: [
          {
            id: 'agent-0001',
            type: 'agent',
            title: 'CustomerSupportAgent',
            duration: '1.11s',
            children: [
              {
                id: 'tool-0001',
                type: 'tool',
                title: 'queryOrderStatus',
                duration: '0.21s',
                tags: ['order'],
              },
              {
                id: 'response-0001',
                type: 'response',
                title: 'Generate response',
                duration: '0.82s',
                tokensIn: 320,
                tokensOut: 96,
                tokensTotal: 416,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    traceId: 'trace_20260703_0002',
    sessionId: 'session_refund_1093',
    projectId,
    projectName,
    environment: 'production',
    status: 'failed',
    latency: 4680,
    createdAt: '2026-07-03T03:22:00Z',
    updatedAt: '2026-07-03T03:22:05Z',
    userId: 'user_2048',
    businessId: 'refund_1093',
    tags: ['agent', 'refund', 'timeout'],
    input: '用户要求查询退款状态。',
    output: '查询退款状态失败，请稍后重试。',
    metadata: {
      channel: 'app',
      businessId: 'refund_1093',
      errorCode: 'TOOL_TIMEOUT',
    },
    callChain: [
      {
        id: 'root-0002',
        type: 'ingress',
        title: 'Agent request',
        duration: '4.68s',
        children: [
          {
            id: 'tool-0002',
            type: 'tool',
            title: 'queryRefundStatus',
            duration: '4.12s',
            tags: ['timeout'],
          },
        ],
      },
    ],
  },
]
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS for new type and formatting files.

- [ ] **Step 7: Review diff without committing**

Run:

```bash
git diff -- pa-eval-frontend/src/modules/app-observability pa-eval-frontend/src/tests/app-observability.types.test.tsx
```

Expected: Only Task 1 files are shown. Do not commit unless the user explicitly asks.

---

### Task 2: Frontend-Only Mock API

**Files:**
- Create: `pa-eval-frontend/src/modules/app-observability/api/mock-trace-api.ts`
- Modify: `pa-eval-frontend/src/tests/app-observability.types.test.tsx`

- [ ] **Step 1: Add tests for mock API list/detail behavior**

Append to `pa-eval-frontend/src/tests/app-observability.types.test.tsx`:

```tsx
import {
  getProjectTraceMock,
  listProjectTracesMock,
  patchProjectTraceMock,
} from '@/modules/app-observability/api/mock-trace-api'

export async function mockApiTypeUsage() {
  const response = await listProjectTracesMock({
    projectId: 'project_customer_agent',
    page: 1,
    pageSize: 10,
    keyword: 'trace_20260703_0001',
  })

  const detail = await getProjectTraceMock(
    'project_customer_agent',
    response.datas[0]?.traceId ?? 'trace_20260703_0001'
  )

  const patched = await patchProjectTraceMock(
    'project_customer_agent',
    detail.traceId,
    {
      input: 'updated input',
      output: 'updated output',
      metadata: { edited: true },
    }
  )

  return {
    total: response.total,
    traceId: patched.traceId,
    metadata: patched.metadata,
  }
}
```

- [ ] **Step 2: Run typecheck to verify missing mock API fails**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: FAIL because `api/mock-trace-api.ts` does not exist.

- [ ] **Step 3: Implement mock API functions**

Create `pa-eval-frontend/src/modules/app-observability/api/mock-trace-api.ts`:

```ts
import { mockTraceDetails } from '../data/mock-traces'
import type {
  AnnotationTaskResult,
  TraceDetail,
  TraceListQuery,
  TraceListResponse,
  TraceMetrics,
  TracePatchInput,
} from '../types'

let traceDetails = [...mockTraceDetails]

const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms))

export async function getTraceMetricsMock(
  projectId: string
): Promise<TraceMetrics> {
  await delay()

  const rows = traceDetails.filter((trace) => trace.projectId === projectId)
  const failed = rows.filter((trace) => trace.status === 'failed').length
  const success = rows.filter((trace) => trace.status === 'success').length
  const totalLatency = rows.reduce((sum, trace) => sum + trace.latency, 0)
  const sortedLatency = rows.map((trace) => trace.latency).sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(sortedLatency.length * 0.95) - 1)

  return {
    summary: {
      total: rows.length,
      success,
      failed,
      failureRate: rows.length ? failed / rows.length : 0,
      averageLatency: rows.length ? Math.round(totalLatency / rows.length) : 0,
      p95Latency: sortedLatency[p95Index] ?? 0,
      totalChangeRate: 0.12,
    },
    traceTrend: [
      { time: '00:00', total: 24, failed: 1 },
      { time: '04:00', total: 32, failed: 2 },
      { time: '08:00', total: 52, failed: 4 },
      { time: '12:00', total: 48, failed: 3 },
      { time: '16:00', total: 61, failed: 5 },
      { time: '20:00', total: 43, failed: 2 },
    ],
    latencyTrend: [
      { time: '00:00', averageLatency: 860, p95Latency: 2100 },
      { time: '04:00', averageLatency: 920, p95Latency: 2400 },
      { time: '08:00', averageLatency: 1120, p95Latency: 3200 },
      { time: '12:00', averageLatency: 1040, p95Latency: 2900 },
      { time: '16:00', averageLatency: 1280, p95Latency: 4680 },
      { time: '20:00', averageLatency: 970, p95Latency: 2500 },
    ],
    environmentDistribution: [
      { environment: 'production', count: rows.length },
      { environment: 'staging', count: 12 },
      { environment: 'testing', count: 8 },
    ],
    slowTraces: [...rows].sort((a, b) => b.latency - a.latency).slice(0, 5),
  }
}

export async function listProjectTracesMock(
  query: TraceListQuery
): Promise<TraceListResponse> {
  await delay()

  const keyword = query.keyword?.trim().toLowerCase()
  const rows = traceDetails.filter((trace) => {
    if (trace.projectId !== query.projectId) return false
    if (
      keyword &&
      !trace.traceId.toLowerCase().includes(keyword) &&
      !trace.sessionId.toLowerCase().includes(keyword)
    ) {
      return false
    }
    if (query.environments?.length && !query.environments.includes(trace.environment)) {
      return false
    }
    if (query.statuses?.length && !query.statuses.includes(trace.status)) {
      return false
    }
    if (query.tags?.length && !query.tags.some((tag) => trace.tags.includes(tag))) {
      return false
    }
    if (query.sessionId && !trace.sessionId.includes(query.sessionId)) {
      return false
    }
    if (query.userId && !trace.userId.includes(query.userId)) {
      return false
    }
    if (query.businessId && !trace.businessId.includes(query.businessId)) {
      return false
    }
    if (query.latencyMin && trace.latency < Number(query.latencyMin)) {
      return false
    }
    if (query.latencyMax && trace.latency > Number(query.latencyMax)) {
      return false
    }
    return true
  })

  const start = (query.page - 1) * query.pageSize

  return {
    total: rows.length,
    datas: rows.slice(start, start + query.pageSize),
  }
}

export async function getProjectTraceMock(
  projectId: string,
  traceId: string
): Promise<TraceDetail> {
  await delay()

  const detail = traceDetails.find(
    (trace) => trace.projectId === projectId && trace.traceId === traceId
  )

  if (!detail) {
    throw new Error('Trace 不存在或已不可用')
  }

  return detail
}

export async function patchProjectTraceMock(
  projectId: string,
  traceId: string,
  input: TracePatchInput
): Promise<TraceDetail> {
  await delay()

  const index = traceDetails.findIndex(
    (trace) => trace.projectId === projectId && trace.traceId === traceId
  )

  if (index < 0) {
    throw new Error('Trace 不存在或已不可用')
  }

  traceDetails[index] = {
    ...traceDetails[index],
    input: input.input,
    output: input.output,
    metadata: input.metadata,
    updatedAt: new Date().toISOString(),
  }

  return traceDetails[index]
}

export async function exportProjectTracesMock(
  projectId: string,
  traceIds: string[]
): Promise<TraceDetail[]> {
  await delay()

  return traceDetails.filter(
    (trace) => trace.projectId === projectId && traceIds.includes(trace.traceId)
  )
}

export async function createAnnotationTaskMock(
  traceIds: string[]
): Promise<AnnotationTaskResult> {
  await delay()

  return {
    taskId: `annotation_${Date.now()}`,
    traceCount: traceIds.length,
  }
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Confirm no backend files changed**

Run:

```bash
git diff --name-only | rg '^(pa-eval-backend|langfuse)/' || true
```

Expected: no output.

---

### Task 3: Route Shell and Page Navigation

**Files:**
- Create: `pa-eval-frontend/src/modules/app-observability/index.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/components/observability-page-nav.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/views/trace-dashboard.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/views/trace-logs.tsx`
- Modify: `pa-eval-frontend/src/routes/index.tsx`

- [ ] **Step 1: Create temporary route views**

Create `pa-eval-frontend/src/modules/app-observability/views/trace-dashboard.tsx`:

```tsx
export function TraceDashboard() {
  return (
    <section className='rounded-lg border bg-card p-4 text-card-foreground'>
      Trace 看板
    </section>
  )
}
```

Create `pa-eval-frontend/src/modules/app-observability/views/trace-logs.tsx`:

```tsx
export function TraceLogs() {
  return (
    <section className='rounded-lg border bg-card p-4 text-card-foreground'>
      Trace 日志
    </section>
  )
}
```

- [ ] **Step 2: Create module page navigation**

Create `pa-eval-frontend/src/modules/app-observability/components/observability-page-nav.tsx`:

```tsx
import { Activity, ListTree, RefreshCw } from 'lucide-react'
import { useLocation, useParams } from 'react-router'
import { PageNav } from '@/components/common/page-nav'

export function ObservabilityPageNav() {
  const location = useLocation()
  const { projectId = 'project_customer_agent' } = useParams()
  const basePath = `/projects/${projectId}/observability`

  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: [
          {
            title: 'Trace 看板',
            href: `${basePath}/traces/dashboard`,
            icon: Activity,
            isActive: location.pathname.endsWith('/traces/dashboard'),
          },
          {
            title: 'Trace 日志',
            href: `${basePath}/traces/logs`,
            icon: ListTree,
            isActive: location.pathname.endsWith('/traces/logs'),
          },
        ],
      }}
      buttonGroups={{
        buttons: [
          {
            id: 'refresh',
            label: '刷新',
            icon: RefreshCw,
            variant: 'outline',
            size: 'sm',
            onClick: () => window.location.reload(),
          },
        ],
      }}
    />
  )
}
```

- [ ] **Step 3: Create module shell**

Create `pa-eval-frontend/src/modules/app-observability/index.tsx`:

```tsx
import { Navigate, Outlet, useParams } from 'react-router'
import { Page } from '@/components/common/page'
import { ObservabilityPageNav } from './components/observability-page-nav'

export function AppObservability() {
  return (
    <Page fixed fluid>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>应用观测</h1>
          <p className='text-muted-foreground'>
            查看当前项目的 Trace 健康度、日志明细和调用链详情。
          </p>
        </div>
        <ObservabilityPageNav />
        <Outlet />
      </div>
    </Page>
  )
}

export function AppObservabilityIndexRedirect() {
  const { projectId = 'project_customer_agent' } = useParams()

  return (
    <Navigate
      to={`/projects/${projectId}/observability/traces/dashboard`}
      replace
    />
  )
}
```

- [ ] **Step 4: Register frontend routes**

Modify `pa-eval-frontend/src/routes/index.tsx`:

```tsx
import {
  AppObservability,
  AppObservabilityIndexRedirect,
} from '@/modules/app-observability'
import { TraceDashboard } from '@/modules/app-observability/views/trace-dashboard'
import { TraceLogs } from '@/modules/app-observability/views/trace-logs'
```

Add under the existing `SidebarLayout` children:

```tsx
{
  path: 'projects/:projectId/observability',
  element: <AppObservability />,
  children: [
    { index: true, element: <AppObservabilityIndexRedirect /> },
    { path: 'traces/dashboard', element: <TraceDashboard /> },
    { path: 'traces/logs', element: <TraceLogs /> },
  ],
}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS. If it fails on `PageNav` prop names, update `ObservabilityPageNav` to match the existing component API.

---

### Task 4: Trace Dashboard View

**Files:**
- Create: `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-filters.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-cards.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-charts.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/components/slow-trace-ranking.tsx`
- Modify: `pa-eval-frontend/src/modules/app-observability/views/trace-dashboard.tsx`

- [ ] **Step 1: Implement dashboard filters**

Create `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-filters.tsx`:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type TraceDashboardFiltersProps = {
  timeRange: string
  environment: string
  onTimeRangeChange: (value: string) => void
  onEnvironmentChange: (value: string) => void
}

export function TraceDashboardFilters({
  timeRange,
  environment,
  onTimeRangeChange,
  onEnvironmentChange,
}: TraceDashboardFiltersProps) {
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Select value={timeRange} onValueChange={onTimeRangeChange}>
        <SelectTrigger className='h-9 w-[150px]'>
          <SelectValue placeholder='时间范围' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='24h'>最近 24 小时</SelectItem>
          <SelectItem value='7d'>最近 7 天</SelectItem>
          <SelectItem value='30d'>最近 30 天</SelectItem>
        </SelectContent>
      </Select>
      <Select value={environment} onValueChange={onEnvironmentChange}>
        <SelectTrigger className='h-9 w-[150px]'>
          <SelectValue placeholder='环境' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>全部环境</SelectItem>
          <SelectItem value='production'>production</SelectItem>
          <SelectItem value='staging'>staging</SelectItem>
          <SelectItem value='testing'>testing</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 2: Implement KPI cards**

Create `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-cards.tsx`:

```tsx
import { Activity, AlertTriangle, CheckCircle2, Clock3, Gauge, Timer } from 'lucide-react'
import { ChartMetricCard } from '@/components/common/charts'
import { formatLatency, formatPercent } from '../lib/format'
import type { TraceMetricSummary } from '../types'

type TraceDashboardCardsProps = {
  summary: TraceMetricSummary
}

export function TraceDashboardCards({ summary }: TraceDashboardCardsProps) {
  return (
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-6'>
      <ChartMetricCard
        title='Trace 总量'
        value={summary.total.toLocaleString()}
        description={`较上一周期 ${formatPercent(summary.totalChangeRate)}`}
        icon={<Activity className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='成功量'
        value={summary.success.toLocaleString()}
        description='已完成且无错误'
        icon={<CheckCircle2 className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='失败量'
        value={summary.failed.toLocaleString()}
        description='点击图表可下钻日志'
        icon={<AlertTriangle className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='失败率'
        value={formatPercent(summary.failureRate)}
        description='失败 Trace 占比'
        icon={<Gauge className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='平均延迟'
        value={formatLatency(summary.averageLatency)}
        description='Trace 平均耗时'
        icon={<Clock3 className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='P95 延迟'
        value={formatLatency(summary.p95Latency)}
        description='95 分位耗时'
        icon={<Timer className='text-muted-foreground h-4 w-4' />}
      />
    </div>
  )
}
```

- [ ] **Step 3: Implement dashboard charts**

Create `pa-eval-frontend/src/modules/app-observability/components/trace-dashboard-charts.tsx`:

```tsx
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatLatency } from '../lib/format'
import type { TraceEnvironmentPoint, TraceLatencyPoint, TraceTrendPoint } from '../types'

export function TraceTrendChart({ data }: { data: TraceTrendPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trace 趋势</CardTitle>
      </CardHeader>
      <CardContent className='h-72'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='time' />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type='monotone' dataKey='total' name='Trace 总量' stroke='var(--chart-1)' />
            <Line type='monotone' dataKey='failed' name='失败量' stroke='var(--destructive)' />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function TraceLatencyChart({ data }: { data: TraceLatencyPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>延迟趋势</CardTitle>
      </CardHeader>
      <CardContent className='h-72'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='time' />
            <YAxis tickFormatter={formatLatency} />
            <Tooltip formatter={(value) => formatLatency(Number(value))} />
            <Legend />
            <Line type='monotone' dataKey='averageLatency' name='平均延迟' stroke='var(--chart-2)' />
            <Line type='monotone' dataKey='p95Latency' name='P95 延迟' stroke='var(--chart-3)' />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function TraceEnvironmentChart({ data }: { data: TraceEnvironmentPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>环境分布</CardTitle>
      </CardHeader>
      <CardContent className='h-72'>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='environment' />
            <YAxis />
            <Tooltip />
            <Bar dataKey='count' name='Trace 数量' fill='var(--chart-4)' radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Implement slow Trace ranking**

Create `pa-eval-frontend/src/modules/app-observability/components/slow-trace-ranking.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatLatency } from '../lib/format'
import type { TraceLogRow } from '../types'
import { StatusBadge } from './status-badge'

type SlowTraceRankingProps = {
  rows: TraceLogRow[]
  onOpenTrace: (traceId: string) => void
}

export function SlowTraceRanking({ rows, onOpenTrace }: SlowTraceRankingProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>慢 Trace 排名</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        {rows.map((row) => (
          <div
            key={row.traceId}
            className='grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-3'
          >
            <div className='min-w-0'>
              <Button
                type='button'
                variant='link'
                className='h-auto max-w-full justify-start p-0'
                onClick={() => onOpenTrace(row.traceId)}
              >
                <span className='truncate'>{row.traceId}</span>
              </Button>
              <p className='truncate text-sm text-muted-foreground'>
                {row.sessionId} · {formatDateTime(row.createdAt)}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <StatusBadge status={row.status} />
              <span className='font-medium tabular-nums'>{formatLatency(row.latency)}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Wire dashboard view to mock API**

Modify `pa-eval-frontend/src/modules/app-observability/views/trace-dashboard.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { getTraceMetricsMock } from '../api/mock-trace-api'
import { SlowTraceRanking } from '../components/slow-trace-ranking'
import { TraceDashboardCards } from '../components/trace-dashboard-cards'
import {
  TraceEnvironmentChart,
  TraceLatencyChart,
  TraceTrendChart,
} from '../components/trace-dashboard-charts'
import { TraceDashboardFilters } from '../components/trace-dashboard-filters'
import type { TraceMetrics } from '../types'

export function TraceDashboard() {
  const navigate = useNavigate()
  const { projectId = 'project_customer_agent' } = useParams()
  const [timeRange, setTimeRange] = useState('24h')
  const [environment, setEnvironment] = useState('all')
  const [metrics, setMetrics] = useState<TraceMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getTraceMetricsMock(projectId)
      .then((nextMetrics) => {
        if (!ignore) setMetrics(nextMetrics)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [projectId, timeRange, environment])

  if (loading || !metrics) {
    return <Skeleton className='h-[520px] rounded-lg' />
  }

  const openTrace = (traceId: string) => {
    navigate(
      `/projects/${projectId}/observability/traces/logs?traceId=${traceId}`
    )
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Trace 看板</h2>
          <p className='text-sm text-muted-foreground'>
            当前项目的 Trace 运行健康度和性能概览。
          </p>
        </div>
        <TraceDashboardFilters
          timeRange={timeRange}
          environment={environment}
          onTimeRangeChange={setTimeRange}
          onEnvironmentChange={setEnvironment}
        />
      </div>
      <TraceDashboardCards summary={metrics.summary} />
      <div className='grid gap-4 xl:grid-cols-[2fr_1fr]'>
        <TraceTrendChart data={metrics.traceTrend} />
        <TraceEnvironmentChart data={metrics.environmentDistribution} />
      </div>
      <div className='grid gap-4 xl:grid-cols-[2fr_1fr]'>
        <TraceLatencyChart data={metrics.latencyTrend} />
        <SlowTraceRanking rows={metrics.slowTraces} onOpenTrace={openTrace} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run typecheck and lint**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
npm run lint
```

Expected: PASS.

---

### Task 5: Trace Log DataTable with Default Filter Interactions

**Files:**
- Create: `pa-eval-frontend/src/modules/app-observability/components/status-badge.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/components/copyable-text.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/components/trace-log-columns.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/components/trace-log-filters.tsx`
- Create: `pa-eval-frontend/src/modules/app-observability/components/trace-log-bulk-actions.tsx`
- Modify: `pa-eval-frontend/src/modules/app-observability/views/trace-logs.tsx`

- [ ] **Step 1: Implement status badge**

Create `pa-eval-frontend/src/modules/app-observability/components/status-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import type { TraceStatus } from '../types'

const statusLabel: Record<TraceStatus, string> = {
  success: '成功',
  failed: '失败',
  running: '运行中',
  unknown: '未知',
}

export function StatusBadge({ status }: { status: TraceStatus }) {
  return (
    <Badge variant={status === 'failed' ? 'destructive' : 'secondary'}>
      {statusLabel[status]}
    </Badge>
  )
}
```

- [ ] **Step 2: Implement copyable text**

Create `pa-eval-frontend/src/modules/app-observability/components/copyable-text.tsx`:

```tsx
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type CopyableTextProps = {
  value: string
}

export function CopyableText({ value }: CopyableTextProps) {
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    toast.success('已复制')
  }

  return (
    <div className='flex min-w-0 items-center gap-1'>
      <span className='truncate font-mono text-xs'>{value}</span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-7 shrink-0'
        aria-label={`复制 ${value}`}
        onClick={copy}
      >
        <Copy />
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Implement DataTable columns**

Create `pa-eval-frontend/src/modules/app-observability/components/trace-log-columns.tsx`:

```tsx
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { formatDateTime, formatLatency } from '../lib/format'
import type { TraceLogRow } from '../types'
import { CopyableText } from './copyable-text'
import { StatusBadge } from './status-badge'

type CreateTraceLogColumnsOptions = {
  onOpenTrace: (traceId: string) => void
}

export function createTraceLogColumns({
  onOpenTrace,
}: CreateTraceLogColumnsOptions): ColumnDef<TraceLogRow>[] {
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
          aria-label='选择全部 Trace'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='选择 Trace'
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'traceId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Trace ID' />
      ),
      cell: ({ row }) => (
        <Button
          type='button'
          variant='link'
          className='h-auto max-w-[220px] justify-start p-0'
          onClick={() => onOpenTrace(row.original.traceId)}
        >
          <span className='truncate font-mono text-xs'>{row.original.traceId}</span>
        </Button>
      ),
    },
    {
      accessorKey: 'sessionId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Session ID' />
      ),
      cell: ({ row }) => <CopyableText value={row.original.sessionId} />,
    },
    {
      accessorKey: 'environment',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='环境' />
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'latency',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='延迟' />
      ),
      cell: ({ row }) => (
        <span className='tabular-nums'>{formatLatency(row.original.latency)}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='创建时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}
```

- [ ] **Step 4: Implement DataTable filter config**

Create `pa-eval-frontend/src/modules/app-observability/components/trace-log-filters.tsx`:

```tsx
import { Circle, CircleCheck, CircleHelp, CircleX, Tags } from 'lucide-react'
import type {
  DataTableFilterBinding,
  DataTableToolbarFilter,
} from '@/components/common/data-table'
import type { FilterGroup } from '@/components/common/filter-panel'

export const traceLogUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'createdAtRange', type: 'array' },
  { fieldId: 'environment', type: 'array', columnId: 'environment' },
  { fieldId: 'status', type: 'array', columnId: 'status' },
  { fieldId: 'tags', type: 'array' },
  { fieldId: 'latencyMin', type: 'string' },
  { fieldId: 'latencyMax', type: 'string' },
  { fieldId: 'sessionId', type: 'string' },
  { fieldId: 'userId', type: 'string' },
  { fieldId: 'businessId', type: 'string' },
  { fieldId: 'metadataKey', type: 'string' },
  { fieldId: 'metadataValue', type: 'string' },
]

export const traceLogToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'environment',
    title: '环境',
    options: [
      { label: 'production', value: 'production' },
      { label: 'staging', value: 'staging' },
      { label: 'testing', value: 'testing' },
    ],
  },
  {
    columnId: 'status',
    title: '状态',
    options: [
      { label: '成功', value: 'success', icon: CircleCheck },
      { label: '失败', value: 'failed', icon: CircleX },
      { label: '运行中', value: 'running', icon: Circle },
      { label: '未知', value: 'unknown', icon: CircleHelp },
    ],
  },
]

export const traceLogFilterGroups: FilterGroup[] = [
  {
    id: 'basic',
    label: '普通筛选',
    defaultOpen: true,
    fields: [
      {
        id: 'createdAtRange',
        type: 'dateRange',
        label: '时间范围',
        showTime: true,
        placeholder: '选择 Trace 创建时间范围',
      },
      {
        id: 'sessionId',
        type: 'input',
        label: 'Session ID',
        placeholder: '输入 Session ID',
      },
    ],
  },
  {
    id: 'advanced',
    label: '高级筛选',
    icon: <Tags className='size-4' />,
    fields: [
      {
        id: 'latencyMin',
        type: 'input',
        label: '最小延迟 ms',
        placeholder: '例如 1000',
      },
      {
        id: 'latencyMax',
        type: 'input',
        label: '最大延迟 ms',
        placeholder: '例如 5000',
      },
      {
        id: 'userId',
        type: 'input',
        label: '用户标识',
        placeholder: '输入 userId',
      },
      {
        id: 'businessId',
        type: 'input',
        label: '业务标识',
        placeholder: '输入 businessId',
      },
      {
        id: 'metadataKey',
        type: 'input',
        label: 'metadata key',
        placeholder: '例如 businessId',
      },
      {
        id: 'metadataValue',
        type: 'input',
        label: 'metadata value',
        placeholder: '可为空',
      },
    ],
  },
]
```

- [ ] **Step 5: Implement bulk actions**

Create `pa-eval-frontend/src/modules/app-observability/components/trace-log-bulk-actions.tsx`:

```tsx
import type { Table } from '@tanstack/react-table'
import { Download, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DataTableBulkActions } from '@/components/common/data-table'
import {
  createAnnotationTaskMock,
  exportProjectTracesMock,
} from '../api/mock-trace-api'
import type { TraceLogRow } from '../types'

type TraceLogBulkActionsProps = {
  table: Table<TraceLogRow>
  projectId: string
}

export function TraceLogBulkActions({ table, projectId }: TraceLogBulkActionsProps) {
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const traceIds = selectedRows.map((row) => row.original.traceId)

  const handleExport = async () => {
    const traces = await exportProjectTracesMock(projectId, traceIds)
    const blob = new Blob([JSON.stringify(traces, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `traces-${projectId}-${Date.now()}-${traces.length}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`已导出 ${traces.length} 条 Trace`)
  }

  const handleCreateAnnotationTask = async () => {
    const result = await createAnnotationTaskMock(traceIds)
    toast.success(`已创建人工标注入口，包含 ${result.traceCount} 条 Trace`)
    table.resetRowSelection()
  }

  return (
    <DataTableBulkActions table={table} entityName='Trace'>
      <Button type='button' size='sm' variant='outline' onClick={handleExport}>
        <Download data-icon='inline-start' />
        导出 JSON
      </Button>
      <Button type='button' size='sm' onClick={handleCreateAnnotationTask}>
        <Tags data-icon='inline-start' />
        人工标注
      </Button>
    </DataTableBulkActions>
  )
}
```

- [ ] **Step 6: Wire Trace logs view to DataTable and mock API**

Modify `pa-eval-frontend/src/modules/app-observability/views/trace-logs.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { DataTable, type DataTableQueryState } from '@/components/common/data-table'
import { listProjectTracesMock } from '../api/mock-trace-api'
import { TraceDetailDrawer } from '../components/trace-detail-drawer'
import { TraceLogBulkActions } from '../components/trace-log-bulk-actions'
import { createTraceLogColumns } from '../components/trace-log-columns'
import {
  traceLogFilterGroups,
  traceLogToolbarFilters,
  traceLogUrlFilters,
} from '../components/trace-log-filters'
import type { TraceListQuery, TraceLogRow } from '../types'

function buildTraceListQuery(
  state: DataTableQueryState,
  projectId: string
): TraceListQuery {
  return {
    projectId,
    page: state.page,
    pageSize: state.pageSize,
    keyword: state.keyword,
    createdAtRange: state.filters.createdAtRange as string[] | undefined,
    environments: state.filters.environment as string[] | undefined,
    statuses: state.filters.status as string[] | undefined,
    tags: state.filters.tags as string[] | undefined,
    latencyMin: String(state.filters.latencyMin ?? ''),
    latencyMax: String(state.filters.latencyMax ?? ''),
    sessionId: String(state.filters.sessionId ?? ''),
    userId: String(state.filters.userId ?? ''),
    businessId: String(state.filters.businessId ?? ''),
    metadataKey: String(state.filters.metadataKey ?? ''),
    metadataValue: String(state.filters.metadataValue ?? ''),
  }
}

export function TraceLogs() {
  const { projectId = 'project_customer_agent' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(
    searchParams.get('traceId')
  )

  const openTrace = (traceId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('traceId', traceId)
    setSearchParams(next, { replace: true })
    setSelectedTraceId(traceId)
  }

  const closeTrace = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('traceId')
    setSearchParams(next, { replace: true })
    setSelectedTraceId(null)
  }

  const columns = useMemo(
    () => createTraceLogColumns({ onOpenTrace: openTrace }),
    [searchParams]
  )

  return (
    <section className='min-w-0 rounded-lg border bg-card p-4 text-card-foreground'>
      <DataTable<TraceLogRow>
        columns={columns}
        request={{
          queryKey: (state) => ['trace-logs', projectId, state],
          queryFn: (state) => listProjectTracesMock(buildTraceListQuery(state, projectId)),
        }}
        urlState={{
          defaultPageSize: 10,
          globalFilterKey: 'keyword',
          filters: traceLogUrlFilters,
        }}
        toolbar={{
          searchPlaceholder: '搜索 traceId / sessionId',
          filters: traceLogToolbarFilters,
          columnLabels: {
            traceId: 'Trace ID',
            sessionId: 'Session ID',
            environment: '环境',
            status: '状态',
            latency: '延迟',
            createdAt: '创建时间',
          },
        }}
        filterPanel={{
          title: '高级筛选',
          groups: traceLogFilterGroups,
          advanceFilterCollapsed: true,
          width: 320,
        }}
        bulkActions={(table) => (
          <TraceLogBulkActions table={table} projectId={projectId} />
        )}
        emptyText='当前筛选条件下暂无 Trace 数据'
        minTableWidth={980}
      />
      <TraceDetailDrawer
        projectId={projectId}
        traceId={selectedTraceId}
        open={Boolean(selectedTraceId)}
        onOpenChange={(open) => {
          if (!open) closeTrace()
        }}
      />
    </section>
  )
}
```

- [ ] **Step 7: Run typecheck and lint**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
npm run lint
```

Expected: FAIL only because `TraceDetailDrawer` is introduced in Task 6. Continue directly to Task 6 before treating this checkpoint as complete.

---

### Task 6: Trace Detail Drawer and Edit Mode

**Files:**
- Create: `pa-eval-frontend/src/modules/app-observability/components/trace-detail-drawer.tsx`

- [ ] **Step 1: Implement drawer with view/edit modes**

Create `pa-eval-frontend/src/modules/app-observability/components/trace-detail-drawer.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { LLMTraceChain } from '@/components/business/llm-trace-chain'
import { Drawer } from '@/components/common/drawer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { getProjectTraceMock, patchProjectTraceMock } from '../api/mock-trace-api'
import { formatDateTime, formatLatency, stringifyJson } from '../lib/format'
import type { TraceDetail } from '../types'
import { CopyableText } from './copyable-text'
import { StatusBadge } from './status-badge'

const metadataSchema = z.record(z.string(), z.unknown())

type TraceDetailDrawerProps = {
  projectId: string
  traceId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TraceDetailDrawer({
  projectId,
  traceId,
  open,
  onOpenChange,
}: TraceDetailDrawerProps) {
  const [detail, setDetail] = useState<TraceDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [metadataText, setMetadataText] = useState('{}')

  useEffect(() => {
    if (!open || !traceId) return

    setLoading(true)
    setEditing(false)
    getProjectTraceMock(projectId, traceId)
      .then((nextDetail) => {
        setDetail(nextDetail)
        setInput(nextDetail.input)
        setOutput(nextDetail.output)
        setMetadataText(stringifyJson(nextDetail.metadata))
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false))
  }, [open, projectId, traceId])

  const dirty = useMemo(() => {
    if (!detail) return false

    return (
      input !== detail.input ||
      output !== detail.output ||
      metadataText !== stringifyJson(detail.metadata)
    )
  }, [detail, input, metadataText, output])

  const cancelEdit = () => {
    if (dirty && !window.confirm('存在未保存修改，确认放弃吗？')) {
      return
    }

    if (detail) {
      setInput(detail.input)
      setOutput(detail.output)
      setMetadataText(stringifyJson(detail.metadata))
    }
    setEditing(false)
  }

  const save = async () => {
    if (!detail) return

    let parsed: unknown
    try {
      parsed = JSON.parse(metadataText)
    } catch {
      toast.error('请输入合法 JSON 对象')
      return
    }

    const result = metadataSchema.safeParse(parsed)
    if (!result.success || Array.isArray(parsed)) {
      toast.error('metadata 必须是合法 JSON 对象')
      return
    }

    setSaving(true)
    try {
      const nextDetail = await patchProjectTraceMock(projectId, detail.traceId, {
        input,
        output,
        metadata: result.data,
      })
      setDetail(nextDetail)
      setMetadataText(stringifyJson(nextDetail.metadata))
      setEditing(false)
      toast.success('Trace 已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && editing && dirty && !window.confirm('存在未保存修改，确认关闭吗？')) {
          return
        }
        onOpenChange(nextOpen)
      }}
      mode='enhanced'
      title={detail ? `Trace 详情：${detail.traceId}` : 'Trace 详情'}
      showConfirm={false}
      cancelText='关闭'
      actions={
        <div className='flex items-center gap-2'>
          {editing ? (
            <>
              <Button type='button' size='sm' disabled={saving} onClick={save}>
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button type='button' size='sm' variant='outline' onClick={cancelEdit}>
                取消
              </Button>
            </>
          ) : (
            <>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={!detail}
                onClick={() => setEditing(true)}
              >
                编辑
              </Button>
              <Button type='button' size='sm' variant='outline' onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </>
          )}
        </div>
      }
      contentProps={{
        className: 'overflow-y-auto',
      }}
    >
      {loading || !detail ? (
        <div className='p-4'>
          <Skeleton className='h-[520px]' />
        </div>
      ) : (
        <div className='flex flex-col gap-4 p-4'>
          <div className='grid gap-3 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-4'>
            <div>
              <p className='text-sm text-muted-foreground'>Trace ID</p>
              <CopyableText value={detail.traceId} />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>状态</p>
              <StatusBadge status={detail.status} />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>环境</p>
              <p>{detail.environment}</p>
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>延迟</p>
              <p className='tabular-nums'>{formatLatency(detail.latency)}</p>
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>Session ID</p>
              <CopyableText value={detail.sessionId} />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>创建时间</p>
              <p>{formatDateTime(detail.createdAt)}</p>
            </div>
          </div>

          {editing ? (
            <div className='grid gap-4 xl:grid-cols-2'>
              <Textarea value={input} onChange={(event) => setInput(event.target.value)} className='min-h-48' />
              <Textarea value={output} onChange={(event) => setOutput(event.target.value)} className='min-h-48' />
              <Textarea
                value={metadataText}
                onChange={(event) => setMetadataText(event.target.value)}
                className='min-h-64 font-mono text-sm xl:col-span-2'
                aria-label='metadata JSON'
              />
            </div>
          ) : (
            <div className='grid gap-4 xl:grid-cols-[1.15fr_1fr]'>
              <LLMTraceChain
                data={detail.callChain}
                width='100%'
                summary={{ duration: formatLatency(detail.latency) }}
              />
              <div className='flex flex-col gap-3'>
                <ReadonlyBlock title='Input' value={detail.input} />
                <ReadonlyBlock title='Output' value={detail.output} />
                <ReadonlyBlock title='Metadata' value={stringifyJson(detail.metadata)} />
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

function ReadonlyBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className='rounded-lg border p-3'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <h3 className='font-medium'>{title}</h3>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => {
            navigator.clipboard.writeText(value)
            toast.success('已复制')
          }}
        >
          复制
        </Button>
      </div>
      <pre className='max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm'>
        {value || '-'}
      </pre>
    </section>
  )
}
```

- [ ] **Step 2: Run typecheck and lint**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
npm run lint
```

Expected: PASS.

---

### Task 7: Visual, Routing, and Build Verification

**Files:**
- Modify only files created or modified in Tasks 1-6 if verification reveals issues.

- [ ] **Step 1: Start frontend dev server**

Run:

```bash
cd pa-eval-frontend
npm run dev
```

Expected: Vite starts and prints a local URL, usually `http://localhost:5173/`.

- [ ] **Step 2: Manually verify dashboard route**

Open:

```text
http://localhost:5173/projects/project_customer_agent/observability/traces/dashboard
```

Expected:

- Page title is `应用观测`.
- Page tabs show `Trace 看板` and `Trace 日志`.
- Dashboard shows six KPI cards.
- Dashboard shows Trace trend, latency trend, environment distribution, and slow Trace ranking.
- No page-level export button exists.

- [ ] **Step 3: Manually verify log route**

Open:

```text
http://localhost:5173/projects/project_customer_agent/observability/traces/logs
```

Expected:

- DataTable toolbar contains keyword search.
- Advanced filter button toggles DataTable/FilterPanel.
- Environment and status faceted filters use DataTable interactions.
- Table columns show Trace ID, Session ID, environment, status, latency, created time.
- Export and annotation buttons are not visible before selecting rows.

- [ ] **Step 4: Verify row selection bulk actions**

In the Trace log table, select one row.

Expected:

- DataTable bulk action bar appears.
- `导出 JSON` appears.
- `人工标注` appears.
- Clicking `导出 JSON` downloads a JSON file.
- Clicking `人工标注` shows a success toast and clears selection.

- [ ] **Step 5: Verify detail drawer and edit validation**

Click a Trace ID.

Expected:

- Right enhanced drawer opens.
- Drawer shows overview fields, `LLMTraceChain`, Input, Output, Metadata.
- Clicking `编辑` switches to edit mode.
- Entering invalid JSON in metadata and clicking `保存` shows `请输入合法 JSON 对象`.
- Entering a JSON array and clicking `保存` shows `metadata 必须是合法 JSON 对象`.
- Entering `{ "reviewed": true }` saves and returns to view mode.

- [ ] **Step 6: Run quality gates**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 7: Confirm no backend or Langfuse files changed**

Run:

```bash
git diff --name-only | rg '^(pa-eval-backend|langfuse)/' || true
```

Expected: no output.

- [ ] **Step 8: Review final changed files without committing**

Run:

```bash
git status --short
git diff --stat
```

Expected: changes are limited to frontend module files, frontend route registration, tests, and docs. Do not commit unless the user explicitly asks.

---

## Self-Review

Spec coverage:

- Trace 看板: covered by Task 4.
- Trace 日志: covered by Task 5.
- DataTable default filtering: covered by Task 5 `trace-log-filters.tsx` and `DataTable` wiring.
- No page-level export button: covered by Task 3/5/7 checks.
- Row-selection bulk export and annotation: covered by Task 5 and Task 7.
- Trace detail drawer: covered by Task 6.
- Edit input/output/metadata with JSON object validation: covered by Task 6.
- Frontend-only mock API: covered by Task 2.
- No backend development: covered by Scope Constraints and Task 7 check.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified implementation steps are intentionally left in this plan.

Type consistency:

- `TraceLogRow`, `TraceDetail`, `TraceMetrics`, and mock API function names are defined in Tasks 1-2 before use in later tasks.
- DataTable query state is converted through `buildTraceListQuery`.
- Bulk actions use selected row `traceId` values and module-local mock functions.
