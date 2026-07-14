import type { ApiMethod } from '@/api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  DatasetFormInput,
  DatasetExportFormat,
  DatasetExportJobRecord,
  DatasetItemFormInput,
  DatasetItemRecord,
  DatasetItemStatus,
  DatasetMetricSummary,
  DatasetRecord,
  DatasetTypeFilter,
  MockAutoEvaluationDataset,
} from '../types'

type DatasetApiClient = {
  getProjects: ApiMethod
  getProjectDatasets: ApiMethod
  createProjectDataset: ApiMethod
  getProjectDataset: ApiMethod
  updateProjectDataset: ApiMethod
  deleteProjectDataset: ApiMethod
  getProjectDatasetMetrics: ApiMethod
  getProjectDatasetItems: ApiMethod
  getProjectDatasetItemStatusCounts: ApiMethod
  createProjectDatasetExportJob: ApiMethod
  getProjectDatasetExportJob: ApiMethod
  downloadProjectDatasetExportJob: ApiMethod
  createProjectDatasetItem: ApiMethod
  updateProjectDatasetItem: ApiMethod
  deleteProjectDatasetItem: ApiMethod
  archiveProjectDatasetItem: ApiMethod
}

type VisibleProject = {
  id: string
  name: string
  status: 'active' | 'archived'
}

export function listProjectDatasets(
  api: DatasetApiClient,
  projectId: string,
  query: DataTableQueryState,
  type: DatasetTypeFilter = 'all'
) {
  const keyword = query.keyword.trim()

  return api.getProjectDatasets<DataTableListResponse<DatasetRecord>>({
    path: { projectId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
      ...(type === 'all' ? {} : { type }),
    },
  })
}

export function createProjectDataset(
  api: DatasetApiClient,
  projectId: string,
  input: DatasetFormInput
) {
  return api.createProjectDataset<DatasetRecord>({
    path: { projectId },
    body: input,
  })
}

export function getProjectDataset(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string
) {
  return api.getProjectDataset<DatasetRecord>({
    path: { projectId, datasetId },
  })
}

export function updateProjectDataset(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  input: DatasetFormInput
) {
  return api.updateProjectDataset<DatasetRecord>({
    path: { projectId, datasetId },
    body: input,
  })
}

export function deleteProjectDataset(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string
) {
  return api.deleteProjectDataset<{ id: string }>({
    path: { projectId, datasetId },
  })
}

export function getProjectDatasetMetricSummary(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string
) {
  return api.getProjectDatasetMetrics<DatasetMetricSummary>({
    path: { projectId, datasetId },
  })
}

export function listProjectDatasetItems(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()
  const statuses = query.filters.status as string[] | undefined

  return api.getProjectDatasetItems<DataTableListResponse<DatasetItemRecord>>({
    path: { projectId, datasetId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
      ...(statuses?.length ? { status: statuses } : {}),
    },
  })
}

export function getProjectDatasetItemStatusCounts(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  query: { keyword?: string } = {}
) {
  const keyword = query.keyword?.trim()

  return api.getProjectDatasetItemStatusCounts<
    Record<DatasetItemStatus, number>
  >({
    path: { projectId, datasetId },
    query: {
      ...(keyword ? { keyword } : {}),
    },
  })
}

export function createProjectDatasetExportJob(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  format: DatasetExportFormat
) {
  return api.createProjectDatasetExportJob<DatasetExportJobRecord>({
    path: { projectId, datasetId },
    body: { format },
  })
}

export function getProjectDatasetExportJob(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  jobId: string
) {
  return api.getProjectDatasetExportJob<DatasetExportJobRecord>({
    path: { projectId, datasetId, jobId },
  })
}

export function downloadProjectDatasetExportJob(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  jobId: string
) {
  return api.downloadProjectDatasetExportJob<Blob>({
    path: { projectId, datasetId, jobId },
  })
}

export async function pollDatasetExportJob(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  jobId: string,
  options: {
    intervalMs?: number
    timeoutMs?: number
  } = {}
) {
  const intervalMs = options.intervalMs ?? 1200
  const timeoutMs = options.timeoutMs ?? 120000
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    const job = await getProjectDatasetExportJob(api, projectId, datasetId, jobId)

    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
      return job
    }

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
  }

  throw new Error('导出任务仍在处理中，请稍后刷新后下载')
}

export function createProjectDatasetItem(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  input: DatasetItemFormInput
) {
  return api.createProjectDatasetItem<DatasetItemRecord>({
    path: { projectId, datasetId },
    body: input,
  })
}

export function updateProjectDatasetItem(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  itemId: string,
  input: DatasetItemFormInput
) {
  return api.updateProjectDatasetItem<DatasetItemRecord>({
    path: { projectId, datasetId, itemId },
    body: input,
  })
}

export function archiveProjectDatasetItem(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  itemId: string
) {
  return api.archiveProjectDatasetItem<DatasetItemRecord>({
    path: { projectId, datasetId, itemId },
  })
}

export function deleteProjectDatasetItem(
  api: DatasetApiClient,
  projectId: string,
  datasetId: string,
  itemId: string
) {
  return api.deleteProjectDatasetItem<{ id: string }>({
    path: { projectId, datasetId, itemId },
  })
}

export async function listProjectAutoEvaluationDatasets(
  api: DatasetApiClient,
  projectId: string,
  keyword = ''
): Promise<MockAutoEvaluationDataset[]> {
  const normalizedKeyword = keyword.trim()
  const projectsResult = await api.getProjects<
    DataTableListResponse<VisibleProject>
  >({
    query: {
      page: 1,
      pageSize: 200,
      status: 'active',
    },
  })
  const projects = sortCurrentProjectFirst(projectsResult.datas, projectId)
  const datasetResults = await Promise.allSettled(
    projects.map(async (project) => {
      const result = await api.getProjectDatasets<
        DataTableListResponse<DatasetRecord>
      >({
        path: { projectId: project.id },
        query: {
          page: 1,
          pageSize: 200,
          ...(normalizedKeyword ? { keyword: normalizedKeyword } : {}),
        },
      })

      return result.datas.map((dataset) => ({
        id: dataset.id,
        projectId: project.id,
        projectName: project.name,
        name: dataset.name,
        description: dataset.description,
        itemCount: dataset.itemCount,
        updatedAt: dataset.updatedAt,
      }))
    })
  )

  const datasets = datasetResults.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )

  if (!normalizedKeyword) {
    return datasets
  }

  const lowerKeyword = normalizedKeyword.toLowerCase()
  return datasets.filter((dataset) =>
    [dataset.id, dataset.name, dataset.description, dataset.projectName].some(
      (value) => String(value ?? '').toLowerCase().includes(lowerKeyword)
    )
  )
}

function sortCurrentProjectFirst(
  projects: VisibleProject[],
  projectId: string
) {
  return [...projects].sort((left, right) => {
    if (left.id === projectId) return -1
    if (right.id === projectId) return 1
    return 0
  })
}
