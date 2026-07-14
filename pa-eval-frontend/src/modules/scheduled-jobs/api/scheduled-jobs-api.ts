import type { ApiMethod } from '@/api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type { ScheduledJobExecutionLog, ScheduledJobTask } from '../types'

type ScheduledJobsApiClient = {
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
  return api.resumeScheduledJob<ScheduledJobTask>({ path: { projectId, jobId } })
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
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()
  const status = getStringArrayFilter(query.filters.status)
  const triggerType = getStringArrayFilter(query.filters.triggerType)

  return api.getScheduledJobLogs<DataTableListResponse<ScheduledJobExecutionLog>>({
    path: { projectId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
      ...(status.length > 0 ? { status } : {}),
      ...(triggerType.length > 0 ? { triggerType } : {}),
    },
  })
}

function getStringArrayFilter(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}
