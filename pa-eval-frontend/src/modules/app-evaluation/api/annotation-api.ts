import type { ApiMethod } from '@/api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  AddAnnotationItemToDatasetInput,
  AnnotationNavigationResult,
  AnnotationQueueExportPayload,
  AnnotationQueueFormInput,
  AnnotationQueueItemRecord,
  AnnotationQueueMetricSummary,
  AnnotationQueueRecord,
  AnnotationScoreFormInput,
  ProjectUserRecord,
  ScoreConfigRecord,
} from '../types'

type AnnotationApiClient = {
  getProjectScoreConfigs: ApiMethod
  ensureDefaultProjectScoreConfig: ApiMethod
  createProjectScoreConfig: ApiMethod
  updateProjectScoreConfig: ApiMethod
  archiveProjectScoreConfig: ApiMethod
  restoreProjectScoreConfig: ApiMethod
  getProjectAnnotationUsers: ApiMethod
  getProjectAnnotationQueues: ApiMethod
  createProjectAnnotationQueue: ApiMethod
  getProjectAnnotationQueue: ApiMethod
  updateProjectAnnotationQueue: ApiMethod
  deleteProjectAnnotationQueue: ApiMethod
  getProjectAnnotationQueueMetrics: ApiMethod
  getProjectAnnotationQueueItems: ApiMethod
  deleteProjectAnnotationQueueItems: ApiMethod
  saveProjectAnnotationScores: ApiMethod
  addProjectAnnotationItemToDataset: ApiMethod
  createTraceAnnotationTask: ApiMethod
  addProjectTracesToDataset: ApiMethod
}

export type ScoreConfigInput = {
  name: string
  dataType: ScoreConfigRecord['dataType']
  description: string
  minValue?: number | null
  maxValue?: number | null
  categories: string[]
}

export function listProjectScoreConfigs(
  api: AnnotationApiClient,
  projectId: string,
  includeArchived = false
) {
  return api.getProjectScoreConfigs<ScoreConfigRecord[]>({
    path: { projectId },
    query: includeArchived ? { includeArchived: true } : undefined,
  })
}

export function ensureDefaultProjectScoreConfig(
  api: AnnotationApiClient,
  projectId: string
) {
  return api.ensureDefaultProjectScoreConfig<ScoreConfigRecord>({
    path: { projectId },
  })
}

export function createProjectScoreConfig(
  api: AnnotationApiClient,
  projectId: string,
  input: ScoreConfigInput
) {
  return api.createProjectScoreConfig<ScoreConfigRecord, ScoreConfigInput>({
    path: { projectId },
    body: input,
  })
}

export function updateProjectScoreConfig(
  api: AnnotationApiClient,
  projectId: string,
  configId: string,
  input: ScoreConfigInput
) {
  return api.updateProjectScoreConfig<ScoreConfigRecord, ScoreConfigInput>({
    path: { projectId, configId },
    body: input,
  })
}

export function archiveProjectScoreConfig(
  api: AnnotationApiClient,
  projectId: string,
  configId: string
) {
  return api.archiveProjectScoreConfig<ScoreConfigRecord>({
    path: { projectId, configId },
  })
}

export function restoreProjectScoreConfig(
  api: AnnotationApiClient,
  projectId: string,
  configId: string
) {
  return api.restoreProjectScoreConfig<ScoreConfigRecord>({
    path: { projectId, configId },
  })
}

export async function listProjectScoreConfigsForAnnotation(
  api: AnnotationApiClient,
  projectId: string
) {
  await ensureDefaultProjectScoreConfig(api, projectId)
  return listProjectScoreConfigs(api, projectId)
}

export function listProjectAnnotationUsers(
  api: AnnotationApiClient,
  projectId: string
) {
  return api.getProjectAnnotationUsers<ProjectUserRecord[]>({
    path: { projectId },
  })
}

export function listProjectAnnotationQueues(
  api: AnnotationApiClient,
  projectId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()
  const assigneeIds = query.filters.assigneeIds as string[] | undefined
  const pendingState = query.filters.pendingState as string[] | undefined

  return api.getProjectAnnotationQueues<
    DataTableListResponse<AnnotationQueueRecord>
  >({
    path: { projectId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
      ...(assigneeIds?.length ? { assigneeIds } : {}),
      ...(pendingState?.length ? { pendingState } : {}),
    },
  })
}

export function createProjectAnnotationQueue(
  api: AnnotationApiClient,
  projectId: string,
  input: AnnotationQueueFormInput
) {
  return api.createProjectAnnotationQueue<AnnotationQueueRecord>({
    path: { projectId },
    body: input,
  })
}

export function updateProjectAnnotationQueue(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  input: AnnotationQueueFormInput
) {
  return api.updateProjectAnnotationQueue<AnnotationQueueRecord>({
    path: { projectId, queueId },
    body: input,
  })
}

export function deleteProjectAnnotationQueue(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string
) {
  return api.deleteProjectAnnotationQueue<{ id: string }>({
    path: { projectId, queueId },
  })
}

export function getProjectAnnotationQueue(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string
) {
  return api.getProjectAnnotationQueue<AnnotationQueueRecord>({
    path: { projectId, queueId },
  })
}

export function getProjectAnnotationQueueMetricSummary(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string
) {
  return api.getProjectAnnotationQueueMetrics<AnnotationQueueMetricSummary>({
    path: { projectId, queueId },
  })
}

export function listProjectAnnotationQueueItems(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()
  const status = query.filters.status as string[] | undefined
  const objectType = query.filters.objectType as string[] | undefined
  const completedBy = query.filters.completedBy as string[] | undefined

  return api.getProjectAnnotationQueueItems<
    DataTableListResponse<AnnotationQueueItemRecord>
  >({
    path: { projectId, queueId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
      ...(status?.length ? { status } : {}),
      ...(objectType?.length ? { objectType } : {}),
      ...(completedBy?.length ? { completedBy } : {}),
    },
  })
}

export async function getProjectAnnotationNavigation(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  itemId: string,
  query: DataTableQueryState
): Promise<AnnotationNavigationResult> {
  const result = await listProjectAnnotationQueueItems(
    api,
    projectId,
    queueId,
    {
      ...query,
      page: 1,
      pageSize: 5000,
    }
  )
  const index = result.datas.findIndex((item) => item.id === itemId)
  if (index < 0) {
    throw new Error('当前筛选条件下找不到该标注数据')
  }

  return {
    current: result.datas[index],
    previous: result.datas[index - 1] ?? null,
    next: result.datas[index + 1] ?? null,
    index,
    total: result.total,
  }
}

export function saveProjectAnnotationScores(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  itemId: string,
  input: AnnotationScoreFormInput
) {
  return api.saveProjectAnnotationScores<AnnotationQueueItemRecord>({
    path: { projectId, queueId, itemId },
    body: input,
  })
}

export function deleteProjectAnnotationQueueItems(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  itemIds: string[]
) {
  return api.deleteProjectAnnotationQueueItems<{ ids: string[] }>({
    path: { projectId, queueId },
    body: { itemIds },
  })
}

export async function exportProjectAnnotationQueue(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  query: DataTableQueryState
): Promise<AnnotationQueueExportPayload> {
  const [queue, items] = await Promise.all([
    getProjectAnnotationQueue(api, projectId, queueId),
    listProjectAnnotationQueueItems(api, projectId, queueId, {
      ...query,
      page: 1,
      pageSize: 5000,
    }),
  ])

  return { queue, items: items.datas }
}

export async function exportProjectAnnotationQueueItems(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  itemIds: string[]
): Promise<AnnotationQueueExportPayload> {
  const [queue, items] = await Promise.all([
    getProjectAnnotationQueue(api, projectId, queueId),
    listProjectAnnotationQueueItems(api, projectId, queueId, {
      page: 1,
      pageSize: 5000,
      keyword: '',
      filters: {},
      sorting: [],
    }),
  ])

  return {
    queue,
    items: items.datas.filter((item) => itemIds.includes(item.id)),
  }
}

export function addProjectAnnotationItemToDataset(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  itemId: string,
  input: AddAnnotationItemToDatasetInput
) {
  return api.addProjectAnnotationItemToDataset({
    path: { projectId, queueId, itemId },
    body: input,
  })
}

export function createTraceAnnotationTask(
  api: AnnotationApiClient,
  projectId: string,
  traceIds: string[],
  options: {
    queueId?: string
    queueName?: string
  } = {}
) {
  return api.createTraceAnnotationTask<{
    queueId: string
    createdCount: number
    skippedCount: number
    traceCount: number
  }>({
    path: { projectId },
    body: { traceIds, ...options },
  })
}

export function addProjectTracesToDataset(
  api: AnnotationApiClient,
  projectId: string,
  input: {
    datasetId: string
    traceIds: string[]
  }
) {
  return api.addProjectTracesToDataset<{
    datasetId: string
    successCount: number
    failureCount: number
    traceCount: number
    itemIds: string[]
    failures: {
      traceId: string
      reason: string
    }[]
  }>({
    path: { projectId },
    body: input,
  })
}
