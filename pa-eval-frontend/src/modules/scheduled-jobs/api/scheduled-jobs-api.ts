import type { ApiMethod } from '@/api/types'
import type { AutoEvaluationTaskRecord } from '@/modules/app-evaluation/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  ScheduledJobAutoEvaluationOption,
  ScheduledJobDataSource,
  ScheduledJobExecutionLog,
  ScheduledJobTask,
} from '../types'

type ScheduledJobsApiClient = {
  getAutoEvaluationTasks: ApiMethod
  getScheduledJobs: ApiMethod
  createScheduledJob: ApiMethod
  updateScheduledJob: ApiMethod
  pauseScheduledJob: ApiMethod
  resumeScheduledJob: ApiMethod
  deleteScheduledJob: ApiMethod
  runScheduledJob: ApiMethod
  triggerScheduledJob: ApiMethod
  getScheduledJobLogs: ApiMethod
}

export function listScheduledJobAutoEvaluationOptions(
  api: ScheduledJobsApiClient,
  projectId: string
) {
  return api
    .getAutoEvaluationTasks<DataTableListResponse<AutoEvaluationTaskRecord>>({
      path: { projectId },
      query: { page: 1, pageSize: 100 },
    })
    .then((response) => response.datas.map(toScheduledJobAutoEvaluationOption))
}

export type ScheduledJobInput = Pick<
  ScheduledJobTask,
  | 'name'
  | 'description'
  | 'scoreName'
  | 'scoreMapping'
  | 'runMode'
  | 'frequency'
  | 'dataSource'
  | 'variableMapping'
  | 'sampleRate'
  | 'reportTemplateId'
  | 'badcase'
  | 'binding'
> & {
  taskType: ScheduledJobTask['type']
  evaluatorId: string
  timezone?: string
}

export function listProjectScheduledJobs(
  api: ScheduledJobsApiClient,
  projectId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()
  const status = getStringArrayFilter(query.filters.status)

  return api.getScheduledJobs<DataTableListResponse<ScheduledJobTask>>({
    path: { projectId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
      ...(status.length > 0 ? { status } : {}),
    },
  })
}

export function createProjectScheduledJob(
  api: ScheduledJobsApiClient,
  projectId: string,
  input: ScheduledJobInput
) {
  return api.createScheduledJob<ScheduledJobTask>({
    path: { projectId },
    body: input,
  })
}

export function updateProjectScheduledJob(
  api: ScheduledJobsApiClient,
  projectId: string,
  jobId: string,
  input: ScheduledJobInput
) {
  return api.updateScheduledJob<ScheduledJobTask>({
    path: { projectId, jobId },
    body: input,
  })
}

export function pauseProjectScheduledJob(
  api: ScheduledJobsApiClient,
  projectId: string,
  jobId: string
) {
  return api.pauseScheduledJob<ScheduledJobTask>({ path: { projectId, jobId } })
}

export function resumeProjectScheduledJob(
  api: ScheduledJobsApiClient,
  projectId: string,
  jobId: string
) {
  return api.resumeScheduledJob<ScheduledJobTask>({
    path: { projectId, jobId },
  })
}

export function deleteProjectScheduledJob(
  api: ScheduledJobsApiClient,
  projectId: string,
  jobId: string
) {
  return api.deleteScheduledJob<{ id: string }>({ path: { projectId, jobId } })
}

export function runProjectScheduledJob(
  api: ScheduledJobsApiClient,
  projectId: string,
  jobId: string
) {
  return api.runScheduledJob<{ id: string; status: string }>({
    path: { projectId, jobId },
  })
}

export function triggerProjectScheduledJob(
  api: ScheduledJobsApiClient,
  projectId: string,
  jobId: string
) {
  return api.triggerScheduledJob<{ id: string; status: string }>({
    path: { projectId, jobId },
  })
}

export function listProjectScheduledJobLogs(
  api: ScheduledJobsApiClient,
  projectId: string,
  query: DataTableQueryState,
  taskType?: ScheduledJobTask['type']
) {
  const keyword = query.keyword.trim()
  const status = getStringArrayFilter(query.filters.status)
  const triggerType = getStringArrayFilter(query.filters.triggerType)

  return api.getScheduledJobLogs<
    DataTableListResponse<ScheduledJobExecutionLog>
  >({
    path: { projectId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
      ...(status.length > 0 ? { status } : {}),
      ...(triggerType.length > 0 ? { triggerType } : {}),
      ...(taskType ? { taskType: [taskType] } : {}),
    },
  })
}

function getStringArrayFilter(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

function toScheduledJobAutoEvaluationOption(
  task: AutoEvaluationTaskRecord
): ScheduledJobAutoEvaluationOption {
  return {
    id: task.id,
    projectId: task.projectId,
    name: task.name,
    description: task.description,
    supportsScheduledExecution: task.status !== 'DRAFT',
    status:
      task.status === 'COMPLETED' ||
      task.status === 'FAILED' ||
      task.status === 'RUNNING'
        ? task.status
        : 'READY',
    scoreName: task.scoreName,
    evaluator: {
      id: task.evaluator.id,
      name: task.evaluator.name,
      provider: 'DIFY',
      description: task.evaluator.type,
      variables: [],
      outputVariables: [],
      updatedAt: task.updatedAt,
    },
    dataSource: toScheduledJobDataSource(task),
    sampleRate: task.sampleRate,
    reportTemplateId: task.latestReport?.id ?? 'default',
    badcase: { enabled: task.badcaseCount > 0, threshold: null },
    lastRunAt: task.lastRunAt || null,
    updatedAt: task.updatedAt,
  }
}

function toScheduledJobDataSource(
  task: AutoEvaluationTaskRecord
): ScheduledJobDataSource {
  if (task.dataSource.type === 'DATASET') {
    return {
      type: 'DATASET',
      datasetId: task.dataSource.name,
      datasetName: task.dataSource.name,
      estimatedCount: task.dataSource.sampleCount,
    }
  }

  return {
    type: 'TRACE_FILTER',
    traceWindow: { mode: 'PREVIOUS_DAY' },
    traceFilter: {
      name: task.dataSource.name,
      userId: '',
      sessionId: '',
      tags: [],
      estimatedCount: task.dataSource.sampleCount,
    },
    estimatedCount: task.dataSource.sampleCount,
  }
}
