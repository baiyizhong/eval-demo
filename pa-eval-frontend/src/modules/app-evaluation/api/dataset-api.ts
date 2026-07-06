import type { ApiMethod } from '@/api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  DatasetFormInput,
  DatasetItemRecord,
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

export async function listProjectAutoEvaluationDatasets(
  api: DatasetApiClient,
  projectId: string,
  keyword = ''
): Promise<MockAutoEvaluationDataset[]> {
  const normalizedKeyword = keyword.trim()
  const projectsResult = await api.getProjects<DataTableListResponse<VisibleProject>>({
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
          pageSize: 50,
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

  return datasetResults.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )
}

function sortCurrentProjectFirst(projects: VisibleProject[], projectId: string) {
  return [...projects].sort((left, right) => {
    if (left.id === projectId) return -1
    if (right.id === projectId) return 1
    return 0
  })
}
