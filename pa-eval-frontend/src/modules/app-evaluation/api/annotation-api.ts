import type { ApiMethod } from '@/api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  AddAnnotationItemToDatasetInput,
  AnnotationBatchFiltersInput,
  AnnotationBatchPreviewResult,
  AnnotationBatchSaveResult,
  AnnotationAssignmentStrategy,
  AnnotationExportFormat,
  AnnotationExportJobRecord,
  AnnotationExportPreview,
  AnnotationExportScope,
  AnnotationNavigationResult,
  AnnotationQueueExportPayload,
  AnnotationQueueFormInput,
  AnnotationQueueItemAssigneeUpdateResult,
  AnnotationQueueItemFilterCounts,
  AnnotationQueueItemRecord,
  AnnotationQueueMetricSummary,
  AnnotationQueueRecord,
  AnnotationScoreFormInput,
  ProjectUserRecord,
  ScoreConfigCategory,
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
  getProjectAnnotationQueueNameAvailability: ApiMethod
  createProjectAnnotationQueue: ApiMethod
  getProjectAnnotationQueue: ApiMethod
  updateProjectAnnotationQueue: ApiMethod
  deleteProjectAnnotationQueue: ApiMethod
  getProjectAnnotationQueueMetrics: ApiMethod
  getProjectAnnotationQueueItems: ApiMethod
  getProjectAnnotationQueueItem: ApiMethod
  getProjectAnnotationQueueItemFilterCounts: ApiMethod
  deleteProjectAnnotationQueueItems: ApiMethod
  updateProjectAnnotationQueueItemAssignees: ApiMethod
  previewProjectAnnotationExport: ApiMethod
  createProjectAnnotationExportJob: ApiMethod
  getProjectAnnotationExportJob: ApiMethod
  downloadProjectAnnotationExportJob: ApiMethod
  previewProjectAnnotationBatch: ApiMethod
  saveProjectAnnotationBatchScores: ApiMethod
  saveProjectAnnotationScores: ApiMethod
  addProjectAnnotationItemToDataset: ApiMethod
  createTraceAnnotationTask: ApiMethod
  createProjectTraceAnnotationTaskJob?: ApiMethod
  getProjectTraceAnnotationTaskJob?: ApiMethod
  addProjectTracesToDataset: ApiMethod
}

const TRACE_ANNOTATION_TASK_ASYNC_THRESHOLD = 1000
const TRACE_ANNOTATION_TASK_JOB_TIMEOUT_MS = 30 * 60 * 1000

export type TraceAnnotationFilterSelection = {
  type: 'FILTER'
  filters: Record<string, unknown>
  excludedTraceIds: string[]
  totalCount: number
}

export type ScoreConfigInput = {
  name: string
  dataType: ScoreConfigRecord['dataType']
  description: string
  minValue?: number | null
  maxValue?: number | null
  categories?: ScoreConfigCategory[]
}

export type NonEmptyStringArray = [string, ...string[]]

type AnnotationExportScopeInput =
  | {
      scope: 'filtered'
      itemIds?: string[]
    }
  | {
      scope: 'selected'
      itemIds: NonEmptyStringArray
    }

type AnnotationExportBaseInput = AnnotationExportScopeInput & {
  filters?: AnnotationBatchFiltersInput
  splitMetadata?: boolean
}

export type AnnotationExportPreviewInput = AnnotationExportBaseInput & {
  format: AnnotationExportFormat
  previewLimit?: number
}

export type AnnotationExportJobInput = AnnotationExportBaseInput & {
  format: AnnotationExportFormat
  fileName?: string
}

export type AnnotationExportPreviewPayload = {
  scope: AnnotationExportScope
  format: AnnotationExportFormat
  filters: AnnotationBatchFiltersInput
  itemIds: string[]
  previewLimit: number
  splitMetadata: boolean
}

export type AnnotationExportJobPayload = {
  scope: AnnotationExportScope
  format: AnnotationExportFormat
  filters: AnnotationBatchFiltersInput
  itemIds: string[]
  splitMetadata: boolean
  fileName?: string
}

export type TraceAnnotationTaskResult = {
  queueId: string
  createdCount: number
  skippedCount: number
  traceCount: number
}

export type TraceAnnotationTaskProgress = {
  queueId: string
  totalCount: number
  completedCount: number
  createdCount: number
  skippedCount: number
  percent: number
  status: 'running' | 'succeeded' | 'failed'
}

export type TraceAnnotationTaskOptions = {
  queueId?: string
  queueName?: string
  assigneeIds?: string[]
  assignmentStrategy?: AnnotationAssignmentStrategy
  assignmentWeights?: Record<string, number>
  onProgress?: (progress: TraceAnnotationTaskProgress) => void
  pollIntervalMs?: number
  timeoutMs?: number
}

type TraceAnnotationTaskJob = {
  id: string
  queueId: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  totalCount: number
  completedCount: number
  createdCount: number
  skippedCount: number
  percent: number
  errorMessage?: string
}

export async function listProjectScoreConfigs(
  api: AnnotationApiClient,
  projectId: string,
  includeArchived = false
) {
  const pageSize = 200
  const firstPage = await listProjectScoreConfigsPage(api, projectId, {
    includeArchived,
    page: 1,
    pageSize,
  })
  const records = [...firstPage.datas]
  const totalPages = Math.ceil(firstPage.total / pageSize)

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await listProjectScoreConfigsPage(api, projectId, {
      includeArchived,
      page,
      pageSize,
    })
    records.push(...nextPage.datas)
  }

  return records
}

export type ScoreConfigListResponse = {
  total: number
  datas: ScoreConfigRecord[]
}

export function listProjectScoreConfigsPage(
  api: AnnotationApiClient,
  projectId: string,
  options: {
    includeArchived?: boolean
    keyword?: string
    page: number
    pageSize: number
  }
) {
  return api.getProjectScoreConfigs<ScoreConfigListResponse>({
    path: { projectId },
    query: {
      includeArchived: options.includeArchived || undefined,
      keyword: options.keyword || undefined,
      page: options.page,
      pageSize: options.pageSize,
    },
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

export async function checkProjectAnnotationQueueNameAvailability(
  api: AnnotationApiClient,
  projectId: string,
  name: string
) {
  const result = await api.getProjectAnnotationQueueNameAvailability<{
    available: boolean
  }>({
    path: { projectId },
    query: { name: name.trim() },
  })
  return result.available
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
  const assigneeIds = query.filters.assigneeIds as string[] | undefined
  const createdAtFrom = query.filters.createdAtFrom as string | undefined
  const createdAtTo = query.filters.createdAtTo as string | undefined
  const completedAtFrom = query.filters.completedAtFrom as string | undefined
  const completedAtTo = query.filters.completedAtTo as string | undefined
  const hasScores = query.filters.hasScores as boolean | undefined
  const metadataKey = query.filters.metadataKey as string | undefined
  const metadataOperator = query.filters.metadataOperator as string | undefined
  const metadataValue = query.filters.metadataValue as string | undefined
  const metadataFilters = query.filters.metadataFilters as
    AnnotationBatchFiltersInput['metadataFilters'] | undefined
  const inputFilters = query.filters.inputFilters as
    AnnotationBatchFiltersInput['inputFilters'] | undefined
  const outputFilters = query.filters.outputFilters as
    AnnotationBatchFiltersInput['outputFilters'] | undefined
  const itemIds = query.filters.itemIds as string[] | undefined

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
      ...(assigneeIds?.length ? { assigneeIds } : {}),
      ...(createdAtFrom ? { createdAtFrom } : {}),
      ...(createdAtTo ? { createdAtTo } : {}),
      ...(completedAtFrom ? { completedAtFrom } : {}),
      ...(completedAtTo ? { completedAtTo } : {}),
      ...(typeof hasScores === 'boolean' ? { hasScores } : {}),
      ...(metadataKey ? { metadataKey } : {}),
      ...(metadataOperator ? { metadataOperator } : {}),
      ...(metadataValue ? { metadataValue } : {}),
      ...(metadataFilters?.length
        ? { metadataFilters: JSON.stringify(metadataFilters) }
        : {}),
      ...(inputFilters?.length
        ? { inputFilters: JSON.stringify(inputFilters) }
        : {}),
      ...(outputFilters?.length
        ? { outputFilters: JSON.stringify(outputFilters) }
        : {}),
      ...(itemIds?.length ? { itemIds } : {}),
    },
  })
}

export function getProjectAnnotationQueueItem(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  itemId: string
) {
  return api.getProjectAnnotationQueueItem<AnnotationQueueItemRecord>({
    path: { projectId, queueId, itemId },
  })
}

export async function getNextPendingProjectAnnotationItem(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string
) {
  const result = await listProjectAnnotationQueueItems(
    api,
    projectId,
    queueId,
    {
      page: 1,
      pageSize: 1,
      keyword: '',
      filters: { status: ['PENDING'] },
      sorting: [],
    }
  )

  return result.datas[0] ?? null
}

export function getProjectAnnotationQueueItemFilterCounts(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()
  const status = query.filters.status as string[] | undefined
  const objectType = query.filters.objectType as string[] | undefined
  const completedBy = query.filters.completedBy as string[] | undefined
  const assigneeIds = query.filters.assigneeIds as string[] | undefined
  const createdAtFrom = query.filters.createdAtFrom as string | undefined
  const createdAtTo = query.filters.createdAtTo as string | undefined
  const completedAtFrom = query.filters.completedAtFrom as string | undefined
  const completedAtTo = query.filters.completedAtTo as string | undefined
  const hasScores = query.filters.hasScores as boolean | undefined
  const metadataKey = query.filters.metadataKey as string | undefined
  const metadataOperator = query.filters.metadataOperator as string | undefined
  const metadataValue = query.filters.metadataValue as string | undefined
  const metadataFilters = query.filters.metadataFilters as
    AnnotationBatchFiltersInput['metadataFilters'] | undefined
  const inputFilters = query.filters.inputFilters as
    AnnotationBatchFiltersInput['inputFilters'] | undefined
  const outputFilters = query.filters.outputFilters as
    AnnotationBatchFiltersInput['outputFilters'] | undefined
  const itemIds = query.filters.itemIds as string[] | undefined

  return api.getProjectAnnotationQueueItemFilterCounts<AnnotationQueueItemFilterCounts>(
    {
      path: { projectId, queueId },
      query: {
        ...(keyword ? { keyword } : {}),
        ...(status?.length ? { status } : {}),
        ...(objectType?.length ? { objectType } : {}),
        ...(completedBy?.length ? { completedBy } : {}),
        ...(assigneeIds?.length ? { assigneeIds } : {}),
        ...(createdAtFrom ? { createdAtFrom } : {}),
        ...(createdAtTo ? { createdAtTo } : {}),
        ...(completedAtFrom ? { completedAtFrom } : {}),
        ...(completedAtTo ? { completedAtTo } : {}),
        ...(typeof hasScores === 'boolean' ? { hasScores } : {}),
        ...(metadataKey ? { metadataKey } : {}),
        ...(metadataOperator ? { metadataOperator } : {}),
        ...(metadataValue ? { metadataValue } : {}),
        ...(metadataFilters?.length
          ? { metadataFilters: JSON.stringify(metadataFilters) }
          : {}),
        ...(inputFilters?.length
          ? { inputFilters: JSON.stringify(inputFilters) }
          : {}),
        ...(outputFilters?.length
          ? { outputFilters: JSON.stringify(outputFilters) }
          : {}),
        ...(itemIds?.length ? { itemIds } : {}),
      },
    }
  )
}

export function previewProjectAnnotationExport(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  input: AnnotationExportPreviewInput
) {
  return api.previewProjectAnnotationExport<
    AnnotationExportPreview,
    AnnotationExportPreviewPayload
  >({
    path: { projectId, queueId },
    body: {
      scope: input.scope,
      format: input.format,
      filters: input.filters ?? {},
      itemIds: input.itemIds ?? [],
      previewLimit: input.previewLimit ?? 5,
      splitMetadata: input.splitMetadata ?? false,
    },
  })
}

export function createProjectAnnotationExportJob(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  input: AnnotationExportJobInput
) {
  return api.createProjectAnnotationExportJob<
    AnnotationExportJobRecord,
    AnnotationExportJobPayload
  >({
    path: { projectId, queueId },
    body: {
      scope: input.scope,
      format: input.format,
      filters: input.filters ?? {},
      itemIds: input.itemIds ?? [],
      splitMetadata: input.splitMetadata ?? false,
      ...(input.fileName ? { fileName: input.fileName } : {}),
    },
  })
}

export function getProjectAnnotationExportJob(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  jobId: string
) {
  return api.getProjectAnnotationExportJob<AnnotationExportJobRecord>({
    path: { projectId, queueId, jobId },
  })
}

export function downloadProjectAnnotationExportJob(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  jobId: string
) {
  return api.downloadProjectAnnotationExportJob<Blob>({
    path: { projectId, queueId, jobId },
  })
}

export async function pollAnnotationExportJob(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  jobId: string,
  options: {
    intervalMs?: number
    timeoutMs?: number
  } = {}
) {
  const intervalMs = options.intervalMs ?? 1200
  const timeoutMs = options.timeoutMs ?? 120000
  const startedAt = Date.now()

  while (true) {
    const job = await getProjectAnnotationExportJob(
      api,
      projectId,
      queueId,
      jobId
    )

    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
      return job
    }

    const remainingMs = timeoutMs - (Date.now() - startedAt)
    if (remainingMs <= 0) {
      break
    }

    await new Promise((resolve) =>
      globalThis.setTimeout(resolve, Math.min(intervalMs, remainingMs))
    )
  }

  throw new Error('导出任务仍在处理中，请稍后刷新后下载')
}

export async function getProjectAnnotationNavigation(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  itemId: string,
  query: DataTableQueryState,
  currentItem?: AnnotationQueueItemRecord
): Promise<AnnotationNavigationResult> {
  const current =
    currentItem ??
    (await getProjectAnnotationQueueItem(api, projectId, queueId, itemId))
  const result = await listProjectAnnotationQueueItems(
    api,
    projectId,
    queueId,
    {
      ...query,
      page: query.page,
      pageSize: query.pageSize,
    }
  )
  const index = result.datas.findIndex((item) => item.id === itemId)
  const absoluteIndex =
    index >= 0 ? (query.page - 1) * query.pageSize + index : 0

  return {
    current,
    previous: index >= 0 ? (result.datas[index - 1] ?? null) : null,
    next: index >= 0 ? (result.datas[index + 1] ?? null) : null,
    index: absoluteIndex,
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

export async function previewProjectAnnotationBatch(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  input: {
    filters: AnnotationBatchFiltersInput
    limit?: number
  }
): Promise<AnnotationBatchPreviewResult> {
  return api.previewProjectAnnotationBatch<AnnotationBatchPreviewResult>({
    path: { projectId, queueId },
    body: input,
  })
}

export async function saveProjectAnnotationBatchScores(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  input: {
    filters: AnnotationBatchFiltersInput
    scores: AnnotationScoreFormInput['scores']
    expectedMatchCount: number
    confirmLargeBatch?: boolean
  }
): Promise<AnnotationBatchSaveResult> {
  return api.saveProjectAnnotationBatchScores<AnnotationBatchSaveResult>({
    path: { projectId, queueId },
    body: input,
  })
}

export function buildAnnotationBatchFilters(
  query: DataTableQueryState
): AnnotationBatchFiltersInput {
  const keyword = query.keyword.trim()
  const status = query.filters.status as string[] | undefined
  const objectType = query.filters.objectType as string[] | undefined
  const completedBy = query.filters.completedBy as string[] | undefined
  const assigneeIds = query.filters.assigneeIds as string[] | undefined
  const createdAtFrom = query.filters.createdAtFrom as string | undefined
  const createdAtTo = query.filters.createdAtTo as string | undefined
  const completedAtFrom = query.filters.completedAtFrom as string | undefined
  const completedAtTo = query.filters.completedAtTo as string | undefined
  const hasScores = query.filters.hasScores as boolean | undefined
  const metadataKey = query.filters.metadataKey as string | undefined
  const metadataOperator = query.filters.metadataOperator as
    | NonNullable<AnnotationBatchFiltersInput['metadataFilter']>['operator']
    | undefined
  const metadataValue = query.filters.metadataValue as string | undefined
  const metadataFilters = query.filters.metadataFilters as
    AnnotationBatchFiltersInput['metadataFilters'] | undefined
  const inputFilters = query.filters.inputFilters as
    AnnotationBatchFiltersInput['inputFilters'] | undefined
  const outputFilters = query.filters.outputFilters as
    AnnotationBatchFiltersInput['outputFilters'] | undefined
  const itemIds = query.filters.itemIds as string[] | undefined

  return {
    ...(keyword ? { keyword } : {}),
    ...(status?.length
      ? { status: status as AnnotationBatchFiltersInput['status'] }
      : {}),
    ...(objectType?.length
      ? { objectType: objectType as AnnotationBatchFiltersInput['objectType'] }
      : {}),
    ...(completedBy?.length ? { completedBy } : {}),
    ...(assigneeIds?.length ? { assigneeIds } : {}),
    ...(createdAtFrom ? { createdAtFrom } : {}),
    ...(createdAtTo ? { createdAtTo } : {}),
    ...(completedAtFrom ? { completedAtFrom } : {}),
    ...(completedAtTo ? { completedAtTo } : {}),
    ...(typeof hasScores === 'boolean' ? { hasScores } : {}),
    ...(metadataKey
      ? {
          metadataFilter: {
            key: metadataKey,
            operator: metadataOperator ?? 'contains',
            ...(metadataValue ? { value: metadataValue } : {}),
          },
        }
      : {}),
    ...(metadataFilters?.length ? { metadataFilters } : {}),
    ...(inputFilters?.length ? { inputFilters } : {}),
    ...(outputFilters?.length ? { outputFilters } : {}),
    ...(itemIds?.length ? { itemIds } : {}),
  }
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

export function updateProjectAnnotationQueueItemAssignees(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  itemIds: string[],
  assigneeUserId: string
) {
  return api.updateProjectAnnotationQueueItemAssignees<
    AnnotationQueueItemAssigneeUpdateResult,
    { itemIds: string[]; assigneeUserId: string }
  >({
    path: { projectId, queueId },
    body: { itemIds, assigneeUserId },
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
  selection: string[] | TraceAnnotationFilterSelection,
  options: TraceAnnotationTaskOptions = {}
) {
  const { onProgress, pollIntervalMs, timeoutMs, ...taskOptions } = options
  const totalCount = Array.isArray(selection)
    ? selection.length
    : selection.totalCount
  if (
    !Array.isArray(selection) ||
    totalCount >= TRACE_ANNOTATION_TASK_ASYNC_THRESHOLD
  ) {
    return createTraceAnnotationTaskByJob(api, projectId, selection, {
      ...taskOptions,
      onProgress,
      pollIntervalMs,
      timeoutMs,
    })
  }

  return api.createTraceAnnotationTask<TraceAnnotationTaskResult>({
    path: { projectId },
    body: { traceIds: selection, ...taskOptions },
  })
}

export function buildInitialTraceAnnotationTaskProgress(
  totalCount: number
): TraceAnnotationTaskProgress {
  return {
    queueId: '',
    totalCount,
    completedCount: 0,
    createdCount: 0,
    skippedCount: 0,
    percent: 0,
    status: 'running',
  }
}

async function createTraceAnnotationTaskByJob(
  api: AnnotationApiClient,
  projectId: string,
  selection: string[] | TraceAnnotationFilterSelection,
  options: TraceAnnotationTaskOptions
): Promise<TraceAnnotationTaskResult> {
  if (
    !api.createProjectTraceAnnotationTaskJob ||
    !api.getProjectTraceAnnotationTaskJob
  ) {
    throw new Error('当前环境不支持大批量异步创建人工标注任务')
  }

  const { onProgress, pollIntervalMs, timeoutMs, ...taskOptions } = options
  let job =
    await api.createProjectTraceAnnotationTaskJob<TraceAnnotationTaskJob>({
      path: { projectId },
      body: {
        ...(Array.isArray(selection)
          ? { traceIds: selection }
          : {
              selection: {
                type: selection.type,
                filters: selection.filters,
                excludedTraceIds: selection.excludedTraceIds,
              },
            }),
        ...taskOptions,
      },
    })
  onProgress?.(traceAnnotationTaskJobToProgress(job))

  const startedAt = Date.now()
  const effectiveTimeoutMs = timeoutMs ?? TRACE_ANNOTATION_TASK_JOB_TIMEOUT_MS
  while (job.status === 'PENDING' || job.status === 'RUNNING') {
    if (Date.now() - startedAt >= effectiveTimeoutMs) {
      throw new Error('任务处理时间较长，仍在后台执行，请稍后重试查看结果')
    }
    await waitForTraceAnnotationTaskPoll(pollIntervalMs ?? 1000)
    job = await api.getProjectTraceAnnotationTaskJob<TraceAnnotationTaskJob>({
      path: { projectId, jobId: job.id },
    })
    onProgress?.(traceAnnotationTaskJobToProgress(job))
  }

  if (job.status === 'FAILED') {
    throw new Error(job.errorMessage || '创建人工标注任务失败，请稍后重试')
  }

  return {
    queueId: job.queueId,
    createdCount: job.createdCount,
    skippedCount: job.skippedCount,
    traceCount: job.totalCount,
  }
}

function traceAnnotationTaskJobToProgress(
  job: TraceAnnotationTaskJob
): TraceAnnotationTaskProgress {
  const status =
    job.status === 'FAILED'
      ? 'failed'
      : job.status === 'SUCCEEDED'
        ? 'succeeded'
        : 'running'

  return {
    queueId: job.queueId,
    totalCount: job.totalCount,
    completedCount: job.completedCount,
    createdCount: job.createdCount,
    skippedCount: job.skippedCount,
    percent: job.percent,
    status,
  }
}

async function waitForTraceAnnotationTaskPoll(intervalMs: number) {
  if (intervalMs <= 0) {
    return
  }
  await new Promise((resolve) => {
    globalThis.setTimeout(resolve, intervalMs)
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
