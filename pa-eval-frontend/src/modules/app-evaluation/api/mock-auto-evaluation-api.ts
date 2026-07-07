import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import {
  mockAutoEvaluationDatasets,
  mockAutoEvaluationEvaluators,
  mockAutoEvaluationRuns,
  mockAutoEvaluationTasks,
} from '../data/mock-auto-evaluations.ts'
import type {
  AutoEvaluationLatestReportSummary,
  AutoEvaluationRunRecord,
  AutoEvaluationTaskFormInput,
  AutoEvaluationTaskRecord,
  MockAutoEvaluationDataset,
  MockAutoEvaluationEvaluator,
} from '../types'

type AutoEvaluationStatusFilter =
  'all' | AutoEvaluationTaskRecord['status'] | 'NOT_STARTED' | 'HAS_BADCASE'

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
      return [task.name, task.description]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
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

export async function getProjectAutoEvaluationTaskSummaryMock(
  projectId: string
) {
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
  return runs.filter(
    (run) => run.projectId === projectId && run.taskId === taskId
  )
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
  if (
    tasks.some(
      (task) => task.projectId === projectId && task.name === input.name
    )
  ) {
    throw new Error('任务名称已存在')
  }
  const now = new Date().toISOString()
  const evaluator = mockAutoEvaluationEvaluators.find(
    (item) => item.id === input.evaluatorId
  )
  if (!evaluator) throw new Error('评估器不存在')

  let source: MockAutoEvaluationDataset | null = null
  let sampleCount = 0
  if (input.dataSource.type === 'DATASET') {
    const datasetId = input.dataSource.datasetId
    source =
      mockAutoEvaluationDatasets.find((dataset) => dataset.id === datasetId) ??
      null
    sampleCount = source?.itemCount ?? 0
  } else {
    sampleCount = input.dataSource.estimatedCount
  }
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
          ? (source?.name ?? '数据集')
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
  tasks = tasks.filter(
    (item) => item.projectId !== projectId || item.id !== taskId
  )
  runs = runs.filter(
    (run) => run.projectId !== projectId || run.taskId !== taskId
  )
}

export async function rerunProjectAutoEvaluationTaskMock(
  projectId: string,
  taskId: string
): Promise<AutoEvaluationTaskRecord> {
  await delay()
  const index = tasks.findIndex(
    (task) => task.projectId === projectId && task.id === taskId
  )
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
  const index = tasks.findIndex(
    (task) => task.projectId === projectId && task.id === taskId
  )
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
    run.projectId === projectId &&
    run.taskId === taskId &&
    run.status === 'RUNNING'
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
  if (running)
    return refreshProjectAutoEvaluationTaskMock(projectId, running.id)
  await delay()
  return null
}

function findTask(projectId: string, taskId: string) {
  const task = tasks.find(
    (item) => item.projectId === projectId && item.id === taskId
  )
  if (!task) throw new Error('自动评测任务不存在')
  return task
}

function paginate<T>(
  rows: T[],
  query: DataTableQueryState
): DataTableListResponse<T> {
  const start = (query.page - 1) * query.pageSize
  return {
    total: rows.length,
    datas: rows.slice(start, start + query.pageSize),
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
