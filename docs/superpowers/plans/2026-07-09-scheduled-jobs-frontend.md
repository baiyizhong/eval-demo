# Scheduled Jobs Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-level “定时任务” frontend-only prototype with task list, execution logs, a create/edit drawer, local mock-file data, and automatic-evaluation task configuration.

**Architecture:** Add an isolated `src/modules/scheduled-jobs` frontend module. Existing application pages remain untouched except for a project-level route, sidebar menu entry, and icon map entry. The module owns all mock types, local mock data files, in-memory page state, table columns, drawer form state, and simulated execution behavior.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS v4 utility classes, lucide-react icons, existing shadcn-style UI primitives, existing `Page`, `PageNav`, `Drawer`, `Stepper`, and table primitives.

---

## Scope And Constraints

- Do not modify `langfuse/` or `dify/`.
- Do not modify backend code or database migrations.
- Do not modify existing “应用观测” or “应用评测” feature pages.
- Only add a project-level sidebar entry, route registration, icon map entry, new scheduled-jobs module files, and focused tests.
- Do not run `git commit` unless the user explicitly asks. Each task ends with a checkpoint instead of a commit.

## File Structure

Create:

- `pa-eval-frontend/src/modules/scheduled-jobs/types.ts`  
  Owns scheduled job and execution log types, labels, and shared constants.

- `pa-eval-frontend/src/modules/scheduled-jobs/mock-data.ts`  
  Owns local mock initial tasks, execution logs, evaluators, and datasets. Runtime interactions read from this file as initial data only.

- `pa-eval-frontend/src/modules/scheduled-jobs/mock-store.ts`  
  Owns ID generation, next-run calculation, sample count calculation, frequency labels, cloned initial data helpers, and simulated execution log creation. It must not read or write `localStorage`.

- `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-status-badge.tsx`  
  Renders status badges for task and log statuses.

- `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-jobs-page-nav.tsx`  
  Renders “任务列表 / 执行日志” tabs plus “创建任务 / 刷新” actions.

- `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-drawer.tsx`  
  Implements create/edit drawer with two-step flow and local validation.

- `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-columns.tsx`  
  Table columns for task list and row actions.

- `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-log-columns.tsx`  
  Table columns for execution logs.

- `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx`  
  Main route component with tab routing through query param or in-page state, initial mock-file data loading, in-memory state updates, and action handlers.

- `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`  
  Source-level tests for route/menu presence, drawer rules, sample warning, and JOB naming rule.

Modify:

- `pa-eval-frontend/src/lib/sidebar-data.ts`  
  Add project-level “定时任务” menu item.

- `pa-eval-frontend/src/components/layout/icon-map.ts`  
  Add `CalendarClock`.

- `pa-eval-frontend/src/routes/index.tsx`  
  Register `/projects/:projectId/scheduled-jobs`.

Verify:

- `cd pa-eval-frontend && npm run typecheck`
- `cd pa-eval-frontend && npm run lint`
- `cd pa-eval-frontend && node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`

---

### Task 1: Register Project-Level Entry

**Files:**

- Modify: `pa-eval-frontend/src/components/layout/icon-map.ts`
- Modify: `pa-eval-frontend/src/lib/sidebar-data.ts`
- Modify: `pa-eval-frontend/src/routes/index.tsx`
- Create: `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx`
- Test: `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`

- [ ] **Step 1: Write the failing source test**

Create `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildSidebarDataFromProjects } from '../../lib/sidebar-data.ts'

const routesSource = readFileSync('src/routes/index.tsx', 'utf8')
const iconMapSource = readFileSync('src/components/layout/icon-map.ts', 'utf8')

const projects = [
  {
    id: 'project-real-1',
    name: '真实评测项目',
    organizationId: 'org-1',
    organizationName: '真实组织',
    description: '真实项目',
    status: 'active' as const,
    createdAt: '2026-07-02T08:00:00.000Z',
    updatedAt: '2026-07-02T09:00:00.000Z',
  },
]

test('scheduled jobs is a project-level sidebar entry', () => {
  const sidebar = buildSidebarDataFromProjects(projects, 'project-real-1')
  const items = sidebar.menuGroups[0]?.items ?? []

  assert.deepEqual(
    items.map((item) => item.title),
    ['应用观测', '应用评测', '定时任务', '项目设置']
  )

  const scheduledJobs = items.find((item) => item.title === '定时任务')
  assert.ok(scheduledJobs && 'url' in scheduledJobs)
  assert.equal(
    scheduledJobs.url,
    '/projects/project-real-1/scheduled-jobs'
  )
})

test('scheduled jobs route and icon are registered', () => {
  assert.match(routesSource, /ScheduledJobs/)
  assert.match(routesSource, /scheduled-jobs/)
  assert.match(iconMapSource, /CalendarClock/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: FAIL because `ScheduledJobs`, `scheduled-jobs`, and `CalendarClock` are not registered yet.

- [ ] **Step 3: Add a temporary scheduled jobs page**

Create `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx`:

```tsx
import { useParams } from 'react-router'
import { Page } from '@/components/common/page'

export function ScheduledJobs() {
  const { projectId = 'project_customer_agent' } = useParams()

  return (
    <Page fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-xl font-semibold'>定时任务</h1>
            <p className='text-muted-foreground text-sm'>
              当前项目：{projectId}
            </p>
          </div>
        </div>
      </div>
    </Page>
  )
}
```

- [ ] **Step 4: Register icon, menu, and route**

In `pa-eval-frontend/src/components/layout/icon-map.ts`, add `CalendarClock` to the lucide import and `iconMap`:

```ts
import {
  AudioWaveform,
  Bell,
  Bug,
  CalendarClock,
  Command,
  Construction,
  Database,
  FileX,
  GalleryVerticalEnd,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  Lock,
  MessagesSquare,
  Monitor,
  Package,
  ServerOff,
  Settings,
  ShieldCheck,
  UserCog,
  UserX,
  Users,
  Wrench,
} from 'lucide-react'
```

```ts
const iconMap: Record<string, LucideIcon> = {
  AudioWaveform,
  Bell,
  Bug,
  CalendarClock,
  Command,
  Construction,
  Database,
  FileX,
  GalleryVerticalEnd,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  Lock,
  MessagesSquare,
  Monitor,
  Package,
  ServerOff,
  Settings,
  ShieldCheck,
  UserCog,
  UserX,
  Users,
  Wrench,
}
```

In `pa-eval-frontend/src/lib/sidebar-data.ts`, add the menu item between “应用评测” and “项目设置”:

```ts
{
  title: '定时任务',
  url: `/projects/${encodedProjectId}/scheduled-jobs`,
  icon: 'CalendarClock',
  activeMatch: 'prefix',
},
```

In `pa-eval-frontend/src/routes/index.tsx`, import and register the route:

```tsx
import { ScheduledJobs } from '@/modules/scheduled-jobs'
```

```tsx
{
  path: 'projects/:projectId/scheduled-jobs',
  element: <ScheduledJobs />,
},
```

- [ ] **Step 5: Verify task passes**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
npm run typecheck
```

Expected: source test PASS; typecheck PASS.

- [ ] **Step 6: Checkpoint**

Run:

```bash
cd /Users/aep/Documents/pae
git status --short pa-eval-frontend/src/modules/scheduled-jobs pa-eval-frontend/src/lib/sidebar-data.ts pa-eval-frontend/src/components/layout/icon-map.ts pa-eval-frontend/src/routes/index.tsx pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: only the files listed in this task are changed or created. Do not commit.

---

### Task 2: Add Types, Local Mock Data File, And Mock Helpers

**Files:**

- Create: `pa-eval-frontend/src/modules/scheduled-jobs/types.ts`
- Create: `pa-eval-frontend/src/modules/scheduled-jobs/mock-data.ts`
- Create: `pa-eval-frontend/src/modules/scheduled-jobs/mock-store.ts`
- Modify: `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`

- [ ] **Step 1: Add source tests for data rules**

Append to `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`:

```ts
const typesSource = readFileSync('src/modules/scheduled-jobs/types.ts', 'utf8')
const mockDataSource = readFileSync(
  'src/modules/scheduled-jobs/mock-data.ts',
  'utf8'
)
const storeSource = readFileSync(
  'src/modules/scheduled-jobs/mock-store.ts',
  'utf8'
)

test('scheduled jobs local mock data and status labels are defined', () => {
  assert.match(typesSource, /未启动/)
  assert.match(typesSource, /已暂停/)
  assert.match(mockDataSource, /scheduledJobMockTasks/)
  assert.match(mockDataSource, /scheduledJobMockLogs/)
  assert.match(mockDataSource, /scheduledJobMockEvaluators/)
  assert.match(mockDataSource, /scheduledJobMockDatasets/)
})

test('scheduled jobs mock helpers contain job trigger naming and sample warning rules', () => {
  assert.match(storeSource, /【JOB触发】/)
  assert.match(storeSource, /formatJobTriggeredAutoEvaluationName/)
  assert.match(storeSource, /getEffectiveSampleCount/)
  assert.match(storeSource, /shouldShowSampleWarning/)
  assert.match(storeSource, /> 1000/)
  assert.doesNotMatch(storeSource, /localStorage/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: FAIL because `types.ts`, `mock-data.ts`, and `mock-store.ts` do not exist.

- [ ] **Step 3: Create scheduled job types**

Create `pa-eval-frontend/src/modules/scheduled-jobs/types.ts`:

```ts
export type ScheduledJobTaskType = 'AUTO_EVALUATION'
export type ScheduledJobRunMode = 'ONCE' | 'RECURRING'
export type ScheduledJobFrequencyKind =
  | 'ONCE'
  | 'EVERY_MINUTES'
  | 'EVERY_HOURS'
  | 'DAILY'
  | 'WEEKLY'
  | 'CRON'
export type ScheduledJobStatus =
  | 'NOT_STARTED'
  | 'RUNNING'
  | 'PAUSED'
  | 'SUCCEEDED'
  | 'FAILED'
export type ScheduledJobLogStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED'
export type ScheduledJobTriggerType = 'MANUAL' | 'JOB'
export type ScheduledJobDataSourceType = 'TRACE_FILTER' | 'DATASET'
export type ScheduledJobTraceWindowMode = 'FIXED' | 'ROLLING' | 'PREVIOUS_DAY'

export type ScheduledJobFrequency = {
  mode: ScheduledJobRunMode
  kind: ScheduledJobFrequencyKind
  everyMinutes: number
  everyHours: number
  dailyHour: number
  weeklyDay: number
  weeklyHour: number
  cronExpression: string
  label: string
}

export type ScheduledJobTraceWindow = {
  mode: ScheduledJobTraceWindowMode
  fixedStart: string
  fixedEnd: string
  rollingValue: number
  rollingUnit: 'minute' | 'hour' | 'day'
  label: string
}

export type ScheduledJobTraceFilter = {
  environments: string[]
  tags: string[]
  userId: string
  sessionId: string
  estimatedCount: number
  window: ScheduledJobTraceWindow
}

export type ScheduledJobDataSource =
  | {
      type: 'TRACE_FILTER'
      traceFilter: ScheduledJobTraceFilter
    }
  | {
      type: 'DATASET'
      datasetId: string
      datasetName: string
      estimatedCount: number
    }

export type ScheduledJobEvaluator = {
  id: string
  name: string
  provider: 'DIFY' | 'N8N'
  version: string
  description: string
  variables: string[]
  variableMapping: Record<string, string>
}

export type ScheduledJobTask = {
  id: string
  projectId: string
  name: string
  description: string
  taskType: ScheduledJobTaskType
  scoreName: string
  frequency: ScheduledJobFrequency
  traceWindow: ScheduledJobTraceWindow
  dataSource: ScheduledJobDataSource
  evaluator: ScheduledJobEvaluator
  sampleRate: number
  status: ScheduledJobStatus
  nextRunAt: string
  createdAt: string
  updatedAt: string
  deleted?: boolean
}

export type ScheduledJobExecutionLog = {
  id: string
  projectId: string
  jobId: string
  jobName: string
  triggerType: ScheduledJobTriggerType
  taskType: ScheduledJobTaskType
  status: ScheduledJobLogStatus
  startedAt: string
  endedAt: string
  durationText: string
  sampleCount: number
  autoEvaluationTaskName: string
  autoEvaluationTaskPath: string
  evaluationReportPath: string
  message: string
  jobDeleted: boolean
}

export const scheduledJobTaskTypeLabels: Record<ScheduledJobTaskType, string> =
  {
    AUTO_EVALUATION: '自动评测',
  }

export const scheduledJobStatusLabels: Record<ScheduledJobStatus, string> = {
  NOT_STARTED: '未启动',
  RUNNING: '运行中',
  PAUSED: '已暂停',
  SUCCEEDED: '执行成功',
  FAILED: '执行失败',
}

export const scheduledJobLogStatusLabels: Record<
  ScheduledJobLogStatus,
  string
> = {
  RUNNING: '运行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
}

export const scheduledJobTriggerLabels: Record<ScheduledJobTriggerType, string> =
  {
    MANUAL: '手动执行',
    JOB: 'JOB 触发',
  }
```

- [ ] **Step 4: Create local mock data file**

Create `pa-eval-frontend/src/modules/scheduled-jobs/mock-data.ts`:

```ts
import type {
  ScheduledJobEvaluator,
  ScheduledJobExecutionLog,
  ScheduledJobTask,
} from './types'

export const scheduledJobMockEvaluators: ScheduledJobEvaluator[] = [
  {
    id: 'eval_dify_quality',
    name: 'Dify 质量评估器',
    provider: 'DIFY',
    version: 'v1',
    description: '用于前端原型的 mock workflow 评估器',
    variables: ['input', 'output', 'expectedOutput'],
    variableMapping: {
      input: 'sample.input',
      output: 'sample.output',
      expectedOutput: 'sample.expectedOutput',
    },
  },
  {
    id: 'eval_n8n_safety',
    name: 'N8N 安全评估器',
    provider: 'N8N',
    version: 'v2',
    description: '用于验证多评估器选择的 mock workflow 评估器',
    variables: ['input', 'output'],
    variableMapping: {
      input: 'sample.input',
      output: 'sample.output',
    },
  },
]

export const scheduledJobMockDatasets = [
  {
    id: 'dataset_mock_quality',
    name: '客服质量评测集',
    estimatedCount: 860,
  },
  {
    id: 'dataset_mock_large',
    name: '大批量回归评测集',
    estimatedCount: 1800,
  },
]

export const scheduledJobMockTasks: ScheduledJobTask[] = [
  {
    id: 'pajob_mock_daily_quality',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    name: '每日客服质量评测',
    description: '每天凌晨评测上一天的客服 Trace。',
    taskType: 'AUTO_EVALUATION',
    scoreName: 'daily_quality_score',
    frequency: {
      mode: 'RECURRING',
      kind: 'DAILY',
      everyMinutes: 30,
      everyHours: 1,
      dailyHour: 1,
      weeklyDay: 1,
      weeklyHour: 1,
      cronExpression: '',
      label: '每天 1:00',
    },
    traceWindow: {
      mode: 'PREVIOUS_DAY',
      fixedStart: '',
      fixedEnd: '',
      rollingValue: 1,
      rollingUnit: 'day',
      label: '上一天 0 点到当天 0 点',
    },
    dataSource: {
      type: 'TRACE_FILTER',
      traceFilter: {
        environments: ['production'],
        tags: ['customer-service'],
        userId: '',
        sessionId: '',
        estimatedCount: 1280,
        window: {
          mode: 'PREVIOUS_DAY',
          fixedStart: '',
          fixedEnd: '',
          rollingValue: 1,
          rollingUnit: 'day',
          label: '上一天 0 点到当天 0 点',
        },
      },
    },
    evaluator: scheduledJobMockEvaluators[0],
    sampleRate: 50,
    status: 'NOT_STARTED',
    nextRunAt: '2026-07-10T01:00:00.000+08:00',
    createdAt: '2026-07-09T09:00:00.000+08:00',
    updatedAt: '2026-07-09T09:00:00.000+08:00',
  },
]

export const scheduledJobMockLogs: ScheduledJobExecutionLog[] = [
  {
    id: 'pajoblog_mock_daily_quality',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    jobId: 'pajob_mock_daily_quality',
    jobName: '每日客服质量评测',
    triggerType: 'JOB',
    taskType: 'AUTO_EVALUATION',
    status: 'SUCCEEDED',
    startedAt: '2026-07-09T01:00:00.000+08:00',
    endedAt: '2026-07-09T01:00:42.000+08:00',
    durationText: '42 秒',
    sampleCount: 640,
    autoEvaluationTaskName: '【JOB触发】每日客服质量评测-202607090100',
    autoEvaluationTaskPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/auto-evaluations/mock-pajob-daily-quality',
    evaluationReportPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/reports/mock-pajob-daily-quality',
    message: '前端 mock 执行成功',
    jobDeleted: false,
  },
]
```

- [ ] **Step 5: Create mock store helpers**

Create `pa-eval-frontend/src/modules/scheduled-jobs/mock-store.ts`:

```ts
import type {
  ScheduledJobDataSource,
  ScheduledJobExecutionLog,
  ScheduledJobFrequency,
  ScheduledJobTask,
  ScheduledJobTriggerType,
} from './types'
import {
  scheduledJobMockLogs,
  scheduledJobMockTasks,
} from './mock-data'

const minute = 60 * 1000
const hour = 60 * minute
const day = 24 * hour

export function createScheduledJobId() {
  return `pajob_${crypto.randomUUID().replaceAll('-', '')}`
}

export function createScheduledJobLogId() {
  return `pajoblog_${crypto.randomUUID().replaceAll('-', '')}`
}

export function formatJobTriggeredAutoEvaluationName(
  jobName: string,
  triggeredAt: Date
) {
  const year = triggeredAt.getFullYear()
  const month = `${triggeredAt.getMonth() + 1}`.padStart(2, '0')
  const date = `${triggeredAt.getDate()}`.padStart(2, '0')
  const hourText = `${triggeredAt.getHours()}`.padStart(2, '0')
  const minuteText = `${triggeredAt.getMinutes()}`.padStart(2, '0')
  return `【JOB触发】${jobName}-${year}${month}${date}${hourText}${minuteText}`
}

export function getEstimatedCount(dataSource: ScheduledJobDataSource) {
  return dataSource.type === 'TRACE_FILTER'
    ? dataSource.traceFilter.estimatedCount
    : dataSource.estimatedCount
}

export function getEffectiveSampleCount(
  estimatedCount: number,
  sampleRate: number
) {
  return Math.ceil((estimatedCount * sampleRate) / 100)
}

export function shouldShowSampleWarning(
  estimatedCount: number,
  sampleRate: number
) {
  return getEffectiveSampleCount(estimatedCount, sampleRate) > 1000
}

export function formatFrequencyLabel(frequency: ScheduledJobFrequency) {
  if (frequency.mode === 'ONCE') return '单次执行'
  if (frequency.kind === 'EVERY_MINUTES') {
    return `每 ${frequency.everyMinutes} 分钟`
  }
  if (frequency.kind === 'EVERY_HOURS') {
    return `每 ${frequency.everyHours} 小时`
  }
  if (frequency.kind === 'DAILY') return `每天 ${frequency.dailyHour}:00`
  if (frequency.kind === 'WEEKLY') {
    return `每周 ${frequency.weeklyDay} ${frequency.weeklyHour}:00`
  }
  return frequency.cronExpression
    ? `Cron ${frequency.cronExpression}`
    : '自定义 cron'
}

export function calculateNextRunAt(frequency: ScheduledJobFrequency) {
  if (frequency.mode === 'ONCE') return '--'
  const now = new Date()
  if (frequency.kind === 'EVERY_MINUTES') {
    return new Date(now.getTime() + frequency.everyMinutes * minute).toISOString()
  }
  if (frequency.kind === 'EVERY_HOURS') {
    return new Date(now.getTime() + frequency.everyHours * hour).toISOString()
  }
  if (frequency.kind === 'DAILY') {
    const next = new Date(now)
    next.setHours(frequency.dailyHour, 0, 0, 0)
    if (next <= now) next.setTime(next.getTime() + day)
    return next.toISOString()
  }
  if (frequency.kind === 'WEEKLY') {
    const next = new Date(now)
    const currentDay = next.getDay() === 0 ? 7 : next.getDay()
    const delta = (frequency.weeklyDay - currentDay + 7) % 7
    next.setDate(next.getDate() + delta)
    next.setHours(frequency.weeklyHour, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 7)
    return next.toISOString()
  }
  return new Date(now.getTime() + hour).toISOString()
}

export function cloneMockTasks(projectId: string) {
  return scheduledJobMockTasks
    .filter((task) => task.projectId === projectId)
    .map((task) => structuredClone(task))
}

export function cloneMockLogs(projectId: string) {
  return scheduledJobMockLogs
    .filter((log) => log.projectId === projectId)
    .map((log) => structuredClone(log))
}

export function createExecutionLog(
  task: ScheduledJobTask,
  triggerType: ScheduledJobTriggerType
) {
  const started = new Date()
  const ended = new Date(started.getTime() + 42_000)
  const sampleCount = getEffectiveSampleCount(
    getEstimatedCount(task.dataSource),
    task.sampleRate
  )
  const autoEvaluationTaskName =
    triggerType === 'JOB'
      ? formatJobTriggeredAutoEvaluationName(task.name, started)
      : task.name

  return {
    id: createScheduledJobLogId(),
    projectId: task.projectId,
    jobId: task.id,
    jobName: task.name,
    triggerType,
    taskType: task.taskType,
    status: 'SUCCEEDED',
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    durationText: '42 秒',
    sampleCount,
    autoEvaluationTaskName,
    autoEvaluationTaskPath: `/projects/${task.projectId}/evaluation/auto-evaluations/mock-${task.id}`,
    evaluationReportPath: `/projects/${task.projectId}/evaluation/reports/mock-${task.id}`,
    message: '前端 mock 执行成功',
    jobDeleted: Boolean(task.deleted),
  } satisfies ScheduledJobExecutionLog
}
```

- [ ] **Step 6: Verify task passes**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
npm run typecheck
```

Expected: source test PASS; typecheck PASS.

- [ ] **Step 7: Checkpoint**

Run:

```bash
cd /Users/aep/Documents/pae
git status --short pa-eval-frontend/src/modules/scheduled-jobs pa-eval-frontend/src/tests/scheduled-jobs
```

Expected: only scheduled-jobs module/test files plus previous route/menu changes are changed. Do not commit.

---

### Task 3: Build Page Navigation And Main State Shell

**Files:**

- Create: `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-jobs-page-nav.tsx`
- Modify: `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx`
- Modify: `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`

- [ ] **Step 1: Add source test for page nav**

Append:

```ts
const pageSource = readFileSync('src/modules/scheduled-jobs/index.tsx', 'utf8')
const pageNavSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-jobs-page-nav.tsx',
  'utf8'
)

test('scheduled jobs page has task list and execution log tabs', () => {
  assert.match(pageNavSource, /任务列表/)
  assert.match(pageNavSource, /执行日志/)
  assert.match(pageNavSource, /创建任务/)
  assert.match(pageSource, /activeTab/)
  assert.match(pageSource, /cloneMockTasks/)
  assert.match(pageSource, /cloneMockLogs/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: FAIL because page nav file does not exist.

- [ ] **Step 3: Create page nav component**

Create `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-jobs-page-nav.tsx`:

```tsx
import { FileClock, ListChecks, Plus, RefreshCw } from 'lucide-react'
import { PageNav } from '@/components/common/page-nav'

export type ScheduledJobsTab = 'tasks' | 'logs'

type ScheduledJobsPageNavProps = {
  activeTab: ScheduledJobsTab
  onTabChange: (tab: ScheduledJobsTab) => void
  onCreate: () => void
  onRefresh: () => void
}

export function ScheduledJobsPageNav({
  activeTab,
  onTabChange,
  onCreate,
  onRefresh,
}: ScheduledJobsPageNavProps) {
  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: [
          {
            title: '任务列表',
            href: '#tasks',
            icon: ListChecks,
            isActive: activeTab === 'tasks',
            onClick: (event) => {
              event.preventDefault()
              onTabChange('tasks')
            },
          },
          {
            title: '执行日志',
            href: '#logs',
            icon: FileClock,
            isActive: activeTab === 'logs',
            onClick: (event) => {
              event.preventDefault()
              onTabChange('logs')
            },
          },
        ],
      }}
      buttonGroups={{
        buttons: [
          {
            id: 'refresh',
            label: '刷新',
            icon: RefreshCw,
            iconPosition: 'start',
            variant: 'outline',
            size: 'sm',
            onClick: onRefresh,
          },
          {
            id: 'create',
            label: '创建任务',
            icon: Plus,
            iconPosition: 'start',
            variant: 'default',
            size: 'sm',
            onClick: onCreate,
          },
        ],
      }}
    />
  )
}
```

- [ ] **Step 4: Replace temporary page with state shell**

Update `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Page } from '@/components/common/page'
import type { ScheduledJobExecutionLog, ScheduledJobTask } from './types'
import {
  cloneMockLogs,
  cloneMockTasks,
} from './mock-store'
import {
  ScheduledJobsPageNav,
  type ScheduledJobsTab,
} from './components/scheduled-jobs-page-nav'

export function ScheduledJobs() {
  const { projectId = 'project_customer_agent' } = useParams()
  const [activeTab, setActiveTab] = useState<ScheduledJobsTab>('tasks')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tasks, setTasks] = useState<ScheduledJobTask[]>([])
  const [logs, setLogs] = useState<ScheduledJobExecutionLog[]>([])

  const refresh = useCallback(() => {
    setTasks(cloneMockTasks(projectId))
    setLogs(cloneMockLogs(projectId))
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <Page fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <ScheduledJobsPageNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onCreate={() => setDrawerOpen(true)}
          onRefresh={() => {
            refresh()
            toast.success('定时任务数据已刷新')
          }}
        />
        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          {activeTab === 'tasks' ? (
            <div className='text-muted-foreground flex min-h-64 items-center justify-center text-sm'>
              {tasks.length === 0
                ? '暂无定时任务'
                : `已加载 ${tasks.length} 个定时任务`}
            </div>
          ) : (
            <div className='text-muted-foreground flex min-h-64 items-center justify-center text-sm'>
              {logs.length === 0
                ? '暂无执行日志'
                : `已加载 ${logs.length} 条执行日志`}
            </div>
          )}
        </section>
        <div hidden={!drawerOpen} data-testid='scheduled-job-drawer-placeholder' />
      </div>
    </Page>
  )
}
```

- [ ] **Step 5: Verify task passes**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
npm run typecheck
```

Expected: source test PASS; typecheck PASS.

- [ ] **Step 6: Checkpoint**

Run `git status --short` for scheduled-jobs files. Do not commit.

---

### Task 4: Implement Create/Edit Drawer

**Files:**

- Create: `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-drawer.tsx`
- Modify: `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx`
- Modify: `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`

- [ ] **Step 1: Add source test for drawer rules**

Append:

```ts
const drawerSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-drawer.tsx',
  'utf8'
)

test('scheduled job drawer implements required creation flow rules', () => {
  assert.match(drawerSource, /基础信息/)
  assert.match(drawerSource, /自动评测配置/)
  assert.match(drawerSource, /Score Name/)
  assert.match(drawerSource, /周期性执行/)
  assert.match(drawerSource, /高级 cron/)
  assert.match(drawerSource, /TRACE_FILTER/)
  assert.match(drawerSource, /DATASET/)
  assert.match(drawerSource, /shouldShowSampleWarning/)
  assert.match(drawerSource, /超过 1000 条样本/)
  assert.match(drawerSource, /form\\.frequency\\.mode === 'RECURRING'/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: FAIL because drawer file does not exist.

- [ ] **Step 3: Create drawer component**

Create `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-drawer.tsx` with this structure:

```tsx
import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Drawer } from '@/components/common/drawer'
import { Stepper } from '@/components/common/stepper'
import type { ScheduledJobTask } from '../types'
import {
  calculateNextRunAt,
  createScheduledJobId,
  formatFrequencyLabel,
  getEffectiveSampleCount,
  getEstimatedCount,
  shouldShowSampleWarning,
} from '../mock-store'

type ScheduledJobDrawerProps = {
  projectId: string
  open: boolean
  task?: ScheduledJobTask | null
  onOpenChange: (open: boolean) => void
  onSave: (task: ScheduledJobTask) => void
}

const nowIso = () => new Date().toISOString()

function createDefaultTask(projectId: string): ScheduledJobTask {
  const frequency = {
    mode: 'ONCE',
    kind: 'ONCE',
    everyMinutes: 30,
    everyHours: 1,
    dailyHour: 1,
    weeklyDay: 1,
    weeklyHour: 1,
    cronExpression: '',
    label: '单次执行',
  } as const

  return {
    id: createScheduledJobId(),
    projectId,
    name: '',
    description: '',
    taskType: 'AUTO_EVALUATION',
    scoreName: '',
    frequency,
    traceWindow: {
      mode: 'FIXED',
      fixedStart: '',
      fixedEnd: '',
      rollingValue: 1,
      rollingUnit: 'hour',
      label: '固定时间窗口',
    },
    dataSource: {
      type: 'TRACE_FILTER',
      traceFilter: {
        environments: [],
        tags: [],
        userId: '',
        sessionId: '',
        estimatedCount: 1280,
        window: {
          mode: 'FIXED',
          fixedStart: '',
          fixedEnd: '',
          rollingValue: 1,
          rollingUnit: 'hour',
          label: '固定时间窗口',
        },
      },
    },
    evaluator: {
      id: 'eval_dify_quality',
      name: 'Dify 质量评估器',
      provider: 'DIFY',
      version: 'v1',
      description: '用于前端原型的 mock workflow 评估器',
      variables: ['input', 'output', 'expectedOutput'],
      variableMapping: {
        input: 'sample.input',
        output: 'sample.output',
        expectedOutput: 'sample.expectedOutput',
      },
    },
    sampleRate: 100,
    status: 'NOT_STARTED',
    nextRunAt: '--',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

export function ScheduledJobDrawer({
  projectId,
  open,
  task,
  onOpenChange,
  onSave,
}: ScheduledJobDrawerProps) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ScheduledJobTask>(
    task ?? createDefaultTask(projectId)
  )

  const estimatedCount = getEstimatedCount(form.dataSource)
  const effectiveSampleCount = getEffectiveSampleCount(
    estimatedCount,
    form.sampleRate
  )
  const sampleWarning = shouldShowSampleWarning(
    estimatedCount,
    form.sampleRate
  )

  const stepItems = useMemo(
    () => [
      { title: '基础信息', description: '任务类型、名称和执行频率' },
      { title: '自动评测配置', description: '评估器、数据来源和采样' },
    ],
    []
  )

  const save = () => {
    if (!form.name.trim()) {
      toast.error('请输入任务名称')
      return
    }
    if (!form.scoreName.trim()) {
      toast.error('请输入 Score Name')
      return
    }
    if (
      form.frequency.mode === 'RECURRING' &&
      form.frequency.kind === 'CRON' &&
      !form.frequency.cronExpression.trim()
    ) {
      toast.error('请输入高级 cron 表达式')
      return
    }
    onSave({
      ...form,
      frequency: {
        ...form.frequency,
        label: formatFrequencyLabel(form.frequency),
      },
      nextRunAt:
        form.status === 'PAUSED' ? '--' : calculateNextRunAt(form.frequency),
      updatedAt: nowIso(),
    })
    onOpenChange(false)
  }

  return (
    <Drawer
      title={task ? '查看 / 编辑任务' : '创建任务'}
      open={open}
      onOpenChange={onOpenChange}
      width='720px'
      confirmText={step === 0 ? '下一步' : '保存'}
      onConfirm={() => {
        if (step === 0) setStep(1)
        else save()
      }}
      cancelText={step === 0 ? '取消' : '上一步'}
      onCancel={() => {
        if (step === 1) setStep(0)
      }}
    >
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4'>
        <Stepper items={stepItems} activeStep={step} />
        {step === 0 ? (
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label>任务类型</Label>
              <Select value='AUTO_EVALUATION' disabled>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='AUTO_EVALUATION'>自动评测</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label>任务名称</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label>任务描述</Label>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label>Score Name</Label>
              <Input
                value={form.scoreName}
                onChange={(event) =>
                  setForm({ ...form, scoreName: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label>执行频率</Label>
              <ToggleGroup
                type='single'
                value={form.frequency.mode}
                onValueChange={(value) => {
                  if (value === 'ONCE' || value === 'RECURRING') {
                    setForm({
                      ...form,
                      frequency: {
                        ...form.frequency,
                        mode: value,
                        kind: value === 'ONCE' ? 'ONCE' : 'EVERY_HOURS',
                      },
                      dataSource:
                        value === 'RECURRING' &&
                        form.dataSource.type === 'DATASET'
                          ? createDefaultTask(projectId).dataSource
                          : form.dataSource,
                    })
                  }
                }}
              >
                <ToggleGroupItem value='ONCE'>单次执行</ToggleGroupItem>
                <ToggleGroupItem value='RECURRING'>周期性执行</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {form.frequency.mode === 'RECURRING' ? (
              <div className='grid gap-3 rounded-lg border p-3'>
                <Label>周期性执行</Label>
                <Select
                  value={form.frequency.kind}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      frequency: {
                        ...form.frequency,
                        kind: value as ScheduledJobTask['frequency']['kind'],
                      },
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='EVERY_MINUTES'>每 N 分钟</SelectItem>
                    <SelectItem value='EVERY_HOURS'>每 N 小时</SelectItem>
                    <SelectItem value='DAILY'>每天几点</SelectItem>
                    <SelectItem value='WEEKLY'>每周几几点</SelectItem>
                    <SelectItem value='CRON'>高级 cron</SelectItem>
                  </SelectContent>
                </Select>
                {form.frequency.kind === 'CRON' ? (
                  <Input
                    aria-label='高级 cron'
                    placeholder='例如 0 1 * * *'
                    value={form.frequency.cronExpression}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        frequency: {
                          ...form.frequency,
                          cronExpression: event.target.value,
                        },
                      })
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className='grid gap-4'>
            <section className='grid gap-3 rounded-lg border p-3'>
              <h3 className='text-sm font-semibold'>选择评估器</h3>
              <Select value={form.evaluator.id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='eval_dify_quality'>
                    Dify 质量评估器 · v1
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className='text-muted-foreground text-xs'>
                变量映射：input → sample.input，output → sample.output
              </div>
            </section>
            <section className='grid gap-3 rounded-lg border p-3'>
              <h3 className='text-sm font-semibold'>选择评测数据来源</h3>
              <ToggleGroup
                type='single'
                value={form.dataSource.type}
                onValueChange={(value) => {
                  if (value === 'TRACE_FILTER') {
                    setForm({ ...form, dataSource: createDefaultTask(projectId).dataSource })
                  }
                  if (
                    value === 'DATASET' &&
                    form.frequency.mode !== 'RECURRING'
                  ) {
                    setForm({
                      ...form,
                      dataSource: {
                        type: 'DATASET',
                        datasetId: 'dataset_mock_quality',
                        datasetName: '客服质量评测集',
                        estimatedCount: 860,
                      },
                    })
                  }
                }}
              >
                <ToggleGroupItem value='TRACE_FILTER'>Trace 过滤</ToggleGroupItem>
                <ToggleGroupItem
                  value='DATASET'
                  disabled={form.frequency.mode === 'RECURRING'}
                >
                  数据集
                </ToggleGroupItem>
              </ToggleGroup>
              {form.frequency.mode === 'RECURRING' ? (
                <p className='text-muted-foreground text-xs'>
                  周期性执行只支持 Trace 过滤，时间窗口会根据执行频率动态计算。
                </p>
              ) : null}
              <div className='grid gap-2'>
                <Label>采样率</Label>
                <Input
                  type='number'
                  min={1}
                  max={100}
                  value={form.sampleRate}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      sampleRate: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className='rounded-lg border p-3 text-sm'>
                预估命中 {estimatedCount} 条，采样后预计处理{' '}
                {effectiveSampleCount} 条。
              </div>
              {sampleWarning ? (
                <div className='text-destructive flex items-start gap-2 rounded-lg border border-destructive/30 p-3 text-sm'>
                  <AlertTriangle className='mt-0.5 size-4' />
                  <span>
                    本次预计处理超过 1000 条样本，可能影响执行耗时和系统性能。
                    建议降低采样率或缩小 Trace 筛选范围。
                  </span>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </Drawer>
  )
}
```

- [ ] **Step 4: Wire drawer into page**

In `index.tsx`, import and render drawer, and implement an in-memory save handler:

```tsx
import { ScheduledJobDrawer } from './components/scheduled-job-drawer'
```

```tsx
const handleSaveTask = (task: ScheduledJobTask) => {
  const nextTasks = tasks.some((row) => row.id === task.id)
    ? tasks.map((row) => (row.id === task.id ? task : row))
    : [task, ...tasks]
  setTasks(nextTasks)
  toast.success('定时任务已保存')
}
```

Replace the placeholder with:

```tsx
<ScheduledJobDrawer
  projectId={projectId}
  open={drawerOpen}
  onOpenChange={setDrawerOpen}
  onSave={handleSaveTask}
/>
```

- [ ] **Step 5: Verify task passes**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
npm run typecheck
```

Expected: source test PASS; typecheck PASS.

- [ ] **Step 6: Checkpoint**

Run `git status --short`. Do not commit.

---

### Task 5: Implement Task List, Row Actions, And Execution Logs

**Files:**

- Create: `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-status-badge.tsx`
- Create: `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-columns.tsx`
- Create: `pa-eval-frontend/src/modules/scheduled-jobs/components/scheduled-job-log-columns.tsx`
- Modify: `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx`
- Modify: `pa-eval-frontend/src/tests/scheduled-jobs/scheduled-jobs-source.test.ts`

- [ ] **Step 1: Add source tests for table and actions**

Append:

```ts
const taskColumnsSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-columns.tsx',
  'utf8'
)
const logColumnsSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-log-columns.tsx',
  'utf8'
)

test('scheduled job tables expose required columns and actions', () => {
  assert.match(taskColumnsSource, /任务名称/)
  assert.match(taskColumnsSource, /任务类型/)
  assert.match(taskColumnsSource, /执行频率/)
  assert.match(taskColumnsSource, /下次执行时间/)
  assert.match(taskColumnsSource, /查看\\/编辑/)
  assert.match(taskColumnsSource, /暂停/)
  assert.match(taskColumnsSource, /恢复/)
  assert.match(taskColumnsSource, /手动执行/)
  assert.match(taskColumnsSource, /模拟 JOB 触发/)
  assert.match(logColumnsSource, /触发方式/)
  assert.match(logColumnsSource, /执行状态/)
  assert.match(logColumnsSource, /执行时长/)
  assert.match(logColumnsSource, /关联自动评测任务/)
  assert.match(logColumnsSource, /关联评测报告/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: FAIL because columns files do not exist.

- [ ] **Step 3: Add status badge**

Create `scheduled-job-status-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import type { ScheduledJobLogStatus, ScheduledJobStatus } from '../types'
import {
  scheduledJobLogStatusLabels,
  scheduledJobStatusLabels,
} from '../types'

const taskVariants: Record<
  ScheduledJobStatus,
  React.ComponentProps<typeof Badge>['variant']
> = {
  NOT_STARTED: 'outline',
  RUNNING: 'default',
  PAUSED: 'secondary',
  SUCCEEDED: 'secondary',
  FAILED: 'destructive',
}

const logVariants: Record<
  ScheduledJobLogStatus,
  React.ComponentProps<typeof Badge>['variant']
> = {
  RUNNING: 'default',
  SUCCEEDED: 'secondary',
  FAILED: 'destructive',
}

export function ScheduledJobStatusBadge({
  status,
}: {
  status: ScheduledJobStatus
}) {
  return <Badge variant={taskVariants[status]}>{scheduledJobStatusLabels[status]}</Badge>
}

export function ScheduledJobLogStatusBadge({
  status,
}: {
  status: ScheduledJobLogStatus
}) {
  return (
    <Badge variant={logVariants[status]}>
      {scheduledJobLogStatusLabels[status]}
    </Badge>
  )
}
```

- [ ] **Step 4: Add task columns**

Create `scheduled-job-columns.tsx` using `ColumnDef<ScheduledJobTask>[]`, `DataTableColumnHeader`, `Button`, and inline action buttons. Required callbacks:

```tsx
type ScheduledJobColumnsOptions = {
  onEdit: (task: ScheduledJobTask) => void
  onPause: (task: ScheduledJobTask) => void
  onResume: (task: ScheduledJobTask) => void
  onRunManually: (task: ScheduledJobTask) => void
  onTriggerJob: (task: ScheduledJobTask) => void
  onDelete: (task: ScheduledJobTask) => void
}
```

Use these exact visible labels in the actions block:

```tsx
<Button variant='ghost' size='sm' onClick={() => onEdit(task)}>
  查看/编辑
</Button>
<Button variant='ghost' size='sm' onClick={() => onPause(task)}>
  暂停
</Button>
<Button variant='ghost' size='sm' onClick={() => onResume(task)}>
  恢复
</Button>
<Button variant='ghost' size='sm' onClick={() => onRunManually(task)}>
  手动执行
</Button>
<Button variant='ghost' size='sm' onClick={() => onTriggerJob(task)}>
  模拟 JOB 触发
</Button>
<Button variant='ghost' size='sm' onClick={() => onDelete(task)}>
  删除
</Button>
```

Columns must render these headers:

```tsx
'任务名称'
'描述'
'任务类型'
'执行频率'
'任务状态'
'下次执行时间'
'操作'
```

- [ ] **Step 5: Add log columns**

Create `scheduled-job-log-columns.tsx` using `ColumnDef<ScheduledJobExecutionLog>[]`. Columns must render these headers:

```tsx
'任务名称'
'触发方式'
'任务类型'
'执行状态'
'开始时间'
'结束时间'
'执行时长'
'处理样本数'
'关联自动评测任务'
'关联评测报告'
```

For linked fields use `Link`:

```tsx
<Link to={row.original.autoEvaluationTaskPath} className='underline-offset-4 hover:underline'>
  {row.original.autoEvaluationTaskName}
</Link>
```

```tsx
<Link to={row.original.evaluationReportPath} className='underline-offset-4 hover:underline'>
  查看报告
</Link>
```

- [ ] **Step 6: Wire actions and render tables in main page**

In `index.tsx`, add state:

```tsx
const [editingTask, setEditingTask] = useState<ScheduledJobTask | null>(null)
```

Add handlers:

```tsx
const persistTasks = (nextTasks: ScheduledJobTask[]) => {
  setTasks(nextTasks)
}

const persistLogs = (nextLogs: ScheduledJobExecutionLog[]) => {
  setLogs(nextLogs)
}

const updateTaskStatus = (
  task: ScheduledJobTask,
  status: ScheduledJobTask['status']
) => {
  const nextTask = {
    ...task,
    status,
    nextRunAt: status === 'PAUSED' ? '--' : calculateNextRunAt(task.frequency),
    updatedAt: new Date().toISOString(),
  }
  persistTasks(tasks.map((row) => (row.id === task.id ? nextTask : row)))
}

const executeTask = (
  task: ScheduledJobTask,
  triggerType: ScheduledJobTriggerType
) => {
  const log = createExecutionLog(task, triggerType)
  persistLogs([log, ...logs])
  updateTaskStatus(task, 'SUCCEEDED')
  setActiveTab('logs')
  toast.success('已生成前端 mock 执行日志')
}
```

Render the task table and log table. If using `DataTable` request mode is too heavy for local rows, use the existing `Table` UI primitives for this prototype. The rendered table must keep the required columns and empty states from the spec.

- [ ] **Step 7: Verify task passes**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
npm run typecheck
```

Expected: source test PASS; typecheck PASS.

- [ ] **Step 8: Checkpoint**

Run `git status --short`. Do not commit.

---

### Task 6: Final Verification And Browser QA

**Files:**

- Modify only files from previous tasks if verification finds issues.

- [ ] **Step 1: Run source tests**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
node --test src/tests/scheduled-jobs/scheduled-jobs-source.test.ts
```

Expected: all scheduled-jobs source tests PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run lint**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
npm run lint
```

Expected: PASS. If unrelated lint errors appear outside changed files, record them and do not modify unrelated files.

- [ ] **Step 4: Start or reuse dev server**

Run:

```bash
cd /Users/aep/Documents/pae/pa-eval-frontend
npm run dev -- --host 127.0.0.1
```

Expected: Vite serves the app, usually at `http://127.0.0.1:5173`. If that port is occupied, use the port Vite prints.

- [ ] **Step 5: Browser QA**

Open:

```text
http://127.0.0.1:5173/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/scheduled-jobs
```

Verify manually:

- Sidebar shows project-level “定时任务”.
- Page has “任务列表” and “执行日志”.
- “创建任务” opens a right drawer.
- First step has task type, task name, description, Score Name, single/recurring frequency, and advanced cron.
- Recurring mode disables dataset source and keeps Trace filter.
- Estimated effective sample count over 1000 shows the warning.
- Saving creates a task and returns to task list.
- Pause changes status to “已暂停” and next run to `--`.
- Resume recalculates a mock next run time.
- Manual execution creates a log.
- Simulated JOB trigger creates a log whose auto evaluation name matches `【JOB触发】任务名-YYYYMMDDHHmm`.

- [ ] **Step 6: Final checkpoint**

Run:

```bash
cd /Users/aep/Documents/pae
git status --short
```

Expected: changed files are limited to:

- `docs/superpowers/specs/2026-07-09-scheduled-jobs-frontend-design.md`
- `docs/superpowers/plans/2026-07-09-scheduled-jobs-frontend.md`
- scheduled-jobs frontend module files
- route/menu/icon/test files listed in this plan

Do not commit.

---

## Self-Review

Spec coverage:

- Project-level menu entry: Task 1.
- New page with task list and execution logs: Tasks 3 and 5.
- Drawer create/edit flow: Task 4.
- Auto evaluation task type, Score Name, evaluator, data source: Task 4.
- Single vs recurring source rules: Task 4.
- Cron-friendly recurring configuration: Task 4.
- Trace window and sample warning: Tasks 2 and 4.
- Task actions pause/resume/manual/JOB/delete: Task 5.
- Execution logs and JOB naming rule: Tasks 2 and 5.
- Frontend-only local mock file data and in-memory runtime state: Task 2.
- Isolation from existing pages: Scope constraints and Task 1 boundaries.
- Verification: Task 6.

Placeholder scan:

- This plan contains no `TBD`, `TODO`, or deferred implementation placeholders.
- Commit steps are intentionally replaced with checkpoints because project rules forbid automatic commits.

Type consistency:

- `ScheduledJobTask`, `ScheduledJobExecutionLog`, and status unions are defined in Task 2 before use.
- `formatJobTriggeredAutoEvaluationName`, `getEffectiveSampleCount`, and `shouldShowSampleWarning` are defined in Task 2 before use.
- Route, component, and file names match across tasks.
