import type {
  TraceListResponse,
  TraceLogRow,
} from '@/modules/app-observability/types'
import type { ApiMethod } from '@/api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  AutoEvaluationLatestReportSummary,
  AutoEvaluationRunRecord,
  AutoEvaluationTaskRecord,
  AutoEvaluationTaskFormInput,
} from '../types'

type AutoEvaluationApiClient = {
  getAutoEvaluationTasks: ApiMethod
  createAutoEvaluationTask: ApiMethod
  countProjectTraces: ApiMethod
  listProjectTraces: ApiMethod
  getAutoEvaluationSummary: ApiMethod
  getAutoEvaluationTask: ApiMethod
  deleteAutoEvaluationTask: ApiMethod
  rerunAutoEvaluationTask: ApiMethod
  getAutoEvaluationLatestReport: ApiMethod
  getAutoEvaluationRuns: ApiMethod
}

export function createProjectAutoEvaluationTask(
  api: AutoEvaluationApiClient,
  projectId: string,
  input: {
    name: string
    description: string
    scoreName: string
    evaluatorId: string
    sampleRate: number
    dataSource: AutoEvaluationTaskFormInput['dataSource']
    variableMapping: AutoEvaluationTaskFormInput['variableMapping']
    reportTemplateId: string
  }
) {
  return api.createAutoEvaluationTask<AutoEvaluationTaskRecord>({
    path: { projectId },
    body: {
      ...input,
      input: '用户问：怎么申请退款？',
      output: '您可以在订单详情页提交退款申请。',
      expectedOutput: '退款申请',
      context: '客服场景',
    },
  })
}

export function countProjectAutoEvaluationTraces(
  api: AutoEvaluationApiClient,
  projectId: string,
  traceFilter: Extract<
    AutoEvaluationTaskFormInput['dataSource'],
    { type: 'TRACE_FILTER' }
  >
) {
  return api.countProjectTraces<{ count: number }>({
    path: { projectId },
    body: { traceFilter },
  })
}

export function listProjectAutoEvaluationTracePreview(
  api: AutoEvaluationApiClient,
  projectId: string,
  traceFilter: Extract<
    AutoEvaluationTaskFormInput['dataSource'],
    { type: 'TRACE_FILTER' }
  >,
  options: { page?: number; pageSize?: number } = {}
) {
  return api.listProjectTraces<TraceListResponse>({
    path: { projectId },
    query: buildAutoEvaluationTraceListQuery(traceFilter, options),
  })
}

function buildAutoEvaluationTraceListQuery(
  traceFilter: Extract<
    AutoEvaluationTaskFormInput['dataSource'],
    { type: 'TRACE_FILTER' }
  >,
  options: { page?: number; pageSize?: number }
) {
  const userId = traceFilter.userId.trim()
  const sessionId = traceFilter.sessionId.trim()
  const createdAtRange = traceFilter.createdAtRange
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 100,
    ...(createdAtRange.length === 2
      ? { createdAtRange }
      : { timeRange: traceFilter.timeRange || '3d' }),
    ...(traceFilter.environments.length
      ? { environments: traceFilter.environments }
      : {}),
    ...(userId ? { userId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(traceFilter.tags.length ? { tags: traceFilter.tags } : {}),
  }
}

export type { TraceLogRow }

export function listProjectAutoEvaluationTasks(
  api: AutoEvaluationApiClient,
  projectId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()

  return api.getAutoEvaluationTasks<
    DataTableListResponse<AutoEvaluationTaskRecord>
  >({
    path: { projectId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
    },
  })
}

export function getProjectAutoEvaluationTaskSummary(
  api: AutoEvaluationApiClient,
  projectId: string
) {
  return api.getAutoEvaluationSummary<{
    total: number
    running: number
    completed: number
    failed: number
    notStarted: number
    badcase: number
  }>({ path: { projectId } })
}

export function getProjectAutoEvaluationTask(
  api: AutoEvaluationApiClient,
  projectId: string,
  taskId: string
) {
  return api.getAutoEvaluationTask<AutoEvaluationTaskRecord>({
    path: { projectId, taskId },
  })
}

export function deleteProjectAutoEvaluationTask(
  api: AutoEvaluationApiClient,
  projectId: string,
  taskId: string
) {
  return api.deleteAutoEvaluationTask<{ id: string }>({
    path: { projectId, taskId },
  })
}

export function rerunProjectAutoEvaluationTask(
  api: AutoEvaluationApiClient,
  projectId: string,
  taskId: string
) {
  return api.rerunAutoEvaluationTask<AutoEvaluationTaskRecord>({
    path: { projectId, taskId },
  })
}

export function getProjectAutoEvaluationLatestReport(
  api: AutoEvaluationApiClient,
  projectId: string,
  taskId: string
) {
  return api.getAutoEvaluationLatestReport<AutoEvaluationLatestReportSummary | null>(
    {
      path: { projectId, taskId },
    }
  )
}

export function listProjectAutoEvaluationRuns(
  api: AutoEvaluationApiClient,
  projectId: string,
  taskId: string
) {
  return api.getAutoEvaluationRuns<AutoEvaluationRunRecord[]>({
    path: { projectId, taskId },
  })
}
