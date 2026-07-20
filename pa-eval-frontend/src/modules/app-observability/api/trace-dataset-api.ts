import type { DatasetRecord, DatasetType } from '@/modules/app-evaluation/types'
import type { ApiMethod } from '@/api/types'

type TraceDatasetApiClient = {
  createProjectDataset: ApiMethod
  addProjectTracesToDataset: ApiMethod
  createProjectTraceDatasetImportJob?: ApiMethod
  getProjectTraceDatasetImportJob?: ApiMethod
}

const TRACE_DATASET_ADD_BATCH_SIZE = 200
const TRACE_DATASET_ASYNC_THRESHOLD = 1000
const TRACE_DATASET_JOB_TIMEOUT_MS = 30 * 60 * 1000

export type TraceFilterSelection = {
  type: 'FILTER'
  filters: Record<string, unknown>
  excludedTraceIds: string[]
}

type TraceDatasetSelectionInput =
  | {
      traceIds: string[]
      selection?: never
      totalCount?: never
    }
  | {
      traceIds?: never
      selection: TraceFilterSelection
      totalCount: number
    }

export type TraceDatasetTargetInput =
  | ({
      mode: 'existing'
      datasetId: string
    } & TraceDatasetSelectionInput)
  | ({
      mode: 'create'
      name: string
      description: string
      datasetType: DatasetType
    } & TraceDatasetSelectionInput)

export type TraceDatasetAddResult = {
  datasetId: string
  successCount: number
  failureCount: number
  traceCount: number
  itemIds: string[]
  failures: {
    traceId: string
    reason: string
  }[]
}

export type TraceDatasetAddProgress = {
  datasetId: string
  totalCount: number
  completedCount: number
  batchCount: number
  completedBatchCount: number
  percent: number
  status: 'running' | 'succeeded' | 'failed'
}

export type TraceDatasetAddOptions = {
  onProgress?: (progress: TraceDatasetAddProgress) => void
  pollIntervalMs?: number
  timeoutMs?: number
}

type TraceDatasetImportJob = {
  id: string
  datasetId: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  totalCount: number
  completedCount: number
  successCount: number
  failureCount: number
  percent: number
  itemIds: string[]
  failures: TraceDatasetAddResult['failures']
  errorMessage?: string
}

export function buildInitialTraceDatasetAddProgress(
  totalCount: number
): TraceDatasetAddProgress {
  return {
    datasetId: '',
    totalCount,
    completedCount: 0,
    batchCount: 0,
    completedBatchCount: 0,
    percent: 0,
    status: 'running',
  }
}

export async function addProjectTracesToDatasetTarget(
  api: TraceDatasetApiClient,
  projectId: string,
  input: TraceDatasetTargetInput,
  options: TraceDatasetAddOptions = {}
): Promise<TraceDatasetAddResult> {
  const datasetId =
    input.mode === 'existing'
      ? input.datasetId
      : (
          await api.createProjectDataset<DatasetRecord>({
            path: { projectId },
            body: {
              name: input.name,
              type: input.datasetType,
              description: input.description,
              metadata: {
                type: input.datasetType,
                source: 'trace_log_bulk',
              },
              inputSchema: {},
              expectedOutputSchema: {},
            },
          })
        ).id

  const traceIds = input.traceIds ?? []
  const totalCount = input.selection ? input.totalCount : traceIds.length
  const batches = chunkTraceIds(traceIds, TRACE_DATASET_ADD_BATCH_SIZE)
  const results: TraceDatasetAddResult[] = []
  const shouldReportProgress =
    totalCount >= TRACE_DATASET_ASYNC_THRESHOLD && Boolean(options.onProgress)

  if (input.selection || totalCount >= TRACE_DATASET_ASYNC_THRESHOLD) {
    return addProjectTracesToDatasetByImportJob(
      api,
      projectId,
      datasetId,
      input,
      options
    )
  }

  if (shouldReportProgress) {
    options.onProgress?.(
      buildTraceDatasetAddProgress(datasetId, totalCount, batches, 0)
    )
  }

  try {
    for (const [index, traceIds] of batches.entries()) {
      results.push(
        await api.addProjectTracesToDataset<TraceDatasetAddResult>({
          path: { projectId },
          body: {
            datasetId,
            traceIds,
          },
        })
      )
      if (shouldReportProgress) {
        options.onProgress?.(
          buildTraceDatasetAddProgress(
            datasetId,
            totalCount,
            batches,
            index + 1
          )
        )
      }
    }
  } catch (error) {
    if (shouldReportProgress) {
      options.onProgress?.({
        ...buildTraceDatasetAddProgress(
          datasetId,
          totalCount,
          batches,
          results.length
        ),
        status: 'failed',
      })
    }
    throw error
  }

  return mergeTraceDatasetAddResults(datasetId, totalCount, results)
}

async function addProjectTracesToDatasetByImportJob(
  api: TraceDatasetApiClient,
  projectId: string,
  datasetId: string,
  input: TraceDatasetTargetInput,
  options: TraceDatasetAddOptions
): Promise<TraceDatasetAddResult> {
  if (
    !api.createProjectTraceDatasetImportJob ||
    !api.getProjectTraceDatasetImportJob
  ) {
    throw new Error('当前环境不支持大批量异步加入数据集')
  }

  let job = await api.createProjectTraceDatasetImportJob<TraceDatasetImportJob>(
    {
      path: { projectId },
      body: {
        datasetId,
        ...(input.selection
          ? { selection: input.selection }
          : { traceIds: input.traceIds }),
      },
    }
  )
  options.onProgress?.(traceDatasetImportJobToProgress(job))

  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs ?? TRACE_DATASET_JOB_TIMEOUT_MS
  while (job.status === 'PENDING' || job.status === 'RUNNING') {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('任务处理时间较长，仍在后台执行，请稍后重试查看结果')
    }
    await waitForTraceDatasetImportPoll(options.pollIntervalMs ?? 1000)
    job = await api.getProjectTraceDatasetImportJob<TraceDatasetImportJob>({
      path: { projectId, jobId: job.id },
    })
    options.onProgress?.(traceDatasetImportJobToProgress(job))
  }

  if (job.status === 'FAILED') {
    throw new Error(job.errorMessage || '加入数据集失败，请稍后重试')
  }

  return {
    datasetId: job.datasetId,
    successCount: job.successCount,
    failureCount: job.failureCount,
    traceCount: job.totalCount,
    itemIds: job.itemIds ?? [],
    failures: job.failures ?? [],
  }
}

function chunkTraceIds(traceIds: string[], batchSize: number) {
  const chunks: string[][] = []
  for (let start = 0; start < traceIds.length; start += batchSize) {
    chunks.push(traceIds.slice(start, start + batchSize))
  }
  return chunks
}

function mergeTraceDatasetAddResults(
  datasetId: string,
  traceCount: number,
  results: TraceDatasetAddResult[]
): TraceDatasetAddResult {
  return {
    datasetId,
    successCount: results.reduce(
      (total, result) => total + (result.successCount ?? 0),
      0
    ),
    failureCount: results.reduce(
      (total, result) => total + (result.failureCount ?? 0),
      0
    ),
    traceCount,
    itemIds: results.flatMap((result) => result.itemIds ?? []),
    failures: results.flatMap((result) => result.failures ?? []),
  }
}

function buildTraceDatasetAddProgress(
  datasetId: string,
  totalCount: number,
  batches: string[][],
  completedBatchCount: number
): TraceDatasetAddProgress {
  const completedBatches = batches.slice(0, completedBatchCount)
  const completedCount = completedBatches.reduce(
    (total, batch) => total + batch.length,
    0
  )
  const batchCount = batches.length || 1
  const percent =
    completedBatchCount >= batches.length
      ? 100
      : Math.round((completedBatchCount / batchCount) * 100)

  return {
    datasetId,
    totalCount,
    completedCount,
    batchCount: batches.length,
    completedBatchCount,
    percent,
    status: completedBatchCount >= batches.length ? 'succeeded' : 'running',
  }
}

function traceDatasetImportJobToProgress(
  job: TraceDatasetImportJob
): TraceDatasetAddProgress {
  const status =
    job.status === 'FAILED'
      ? 'failed'
      : job.status === 'SUCCEEDED'
        ? 'succeeded'
        : 'running'

  return {
    datasetId: job.datasetId,
    totalCount: job.totalCount,
    completedCount: job.completedCount,
    batchCount: 0,
    completedBatchCount: 0,
    percent: job.percent,
    status,
  }
}

async function waitForTraceDatasetImportPoll(intervalMs: number) {
  if (intervalMs <= 0) {
    return
  }
  await new Promise((resolve) => {
    globalThis.setTimeout(resolve, intervalMs)
  })
}
