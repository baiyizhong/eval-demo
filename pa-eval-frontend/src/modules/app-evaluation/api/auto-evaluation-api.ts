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
