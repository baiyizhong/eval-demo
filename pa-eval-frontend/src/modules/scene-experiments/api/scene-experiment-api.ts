import type { DatasetRecord } from '@/modules/app-evaluation/types'
import type { ApiMethod } from '@/api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  AggregateExperimentResult,
  CompareExperimentResult,
  CreateExperimentInput,
  ExperimentReport,
  ExperimentReportBaseline,
  SceneDetail,
  SceneFormInput,
  SceneRecord,
} from '../types'

type SceneExperimentApi = {
  getProjectDatasets: ApiMethod
  getProjectScenes: ApiMethod
  createProjectScene: ApiMethod
  getProjectScene: ApiMethod
  updateProjectScene: ApiMethod
  deleteProjectScene: ApiMethod
  createDatasetExperiment: ApiMethod
  getDatasetExperimentReports: ApiMethod
  getExperimentReport: ApiMethod
  aggregateExperimentReports: ApiMethod
  compareExperimentReports: ApiMethod
  getExperimentReportBaselines: ApiMethod
  setExperimentReportBaseline: ApiMethod
}

export async function listAllProjectDatasets(
  api: SceneExperimentApi,
  projectId: string,
  pageSize = 100
) {
  const rows: DatasetRecord[] = []
  const seenIds = new Set<string>()
  const normalizedPageSize = Math.max(1, pageSize)
  let page = 1

  while (true) {
    const response = await api.getProjectDatasets<
      DataTableListResponse<DatasetRecord>
    >({
      path: { projectId },
      query: { page, pageSize: normalizedPageSize },
    })
    if (response.datas.length === 0) break

    const previousSize = rows.length
    for (const dataset of response.datas) {
      if (seenIds.has(dataset.id)) continue
      seenIds.add(dataset.id)
      rows.push(dataset)
    }
    if (response.total <= rows.length || response.total === 0) break
    if (rows.length === previousSize) break
    page += 1
  }

  return rows
}

export function listProjectScenes(
  api: SceneExperimentApi,
  projectId: string,
  query: DataTableQueryState
) {
  const enabled = query.filters.enabled as string[] | undefined
  return api.getProjectScenes<DataTableListResponse<SceneRecord>>({
    path: { projectId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword.trim() ? { keyword: query.keyword.trim() } : {}),
      ...(enabled?.length === 1 ? { enabled: enabled[0] } : {}),
    },
  })
}

export function listAvailableScenes(
  api: SceneExperimentApi,
  projectId: string
) {
  return api.getProjectScenes<DataTableListResponse<SceneRecord>>({
    path: { projectId },
    query: { page: 1, pageSize: 100, enabled: true },
  })
}

export function getProjectScene(
  api: SceneExperimentApi,
  projectId: string,
  sceneId: string
) {
  return api.getProjectScene<SceneDetail>({ path: { projectId, sceneId } })
}

export function saveProjectScene(
  api: SceneExperimentApi,
  projectId: string,
  input: SceneFormInput,
  sceneId?: string
) {
  return sceneId
    ? api.updateProjectScene<SceneDetail>({
        path: { projectId, sceneId },
        body: input,
      })
    : api.createProjectScene<SceneDetail>({ path: { projectId }, body: input })
}

export function patchProjectScene(
  api: SceneExperimentApi,
  projectId: string,
  sceneId: string,
  input: Partial<SceneFormInput>
) {
  return api.updateProjectScene<SceneDetail>({
    path: { projectId, sceneId },
    body: input,
  })
}

export function deleteProjectScene(
  api: SceneExperimentApi,
  projectId: string,
  sceneId: string
) {
  return api.deleteProjectScene<{ id: string }>({
    path: { projectId, sceneId },
  })
}

export function createDatasetExperiment(
  api: SceneExperimentApi,
  projectId: string,
  datasetId: string,
  input: CreateExperimentInput
) {
  return api.createDatasetExperiment<{
    group: unknown
    reports: ExperimentReport[]
  }>({ path: { projectId, datasetId }, body: input })
}

export function listDatasetExperimentReports(
  api: SceneExperimentApi,
  projectId: string,
  datasetId: string,
  query: DataTableQueryState
) {
  return api.getDatasetExperimentReports<
    DataTableListResponse<ExperimentReport>
  >({
    path: { projectId, datasetId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword.trim() ? { keyword: query.keyword.trim() } : {}),
    },
  })
}

export async function listAllDatasetExperimentReports(
  api: SceneExperimentApi,
  projectId: string,
  datasetId: string,
  pageSize = 100
) {
  const rows: ExperimentReport[] = []
  const seenIds = new Set<string>()
  const normalizedPageSize = Math.max(1, pageSize)
  let page = 1

  while (true) {
    const response = await api.getDatasetExperimentReports<
      DataTableListResponse<ExperimentReport>
    >({
      path: { projectId, datasetId },
      query: { page, pageSize: normalizedPageSize },
    })
    if (response.datas.length === 0) break

    const previousSize = rows.length
    for (const report of response.datas) {
      if (seenIds.has(report.id)) continue
      seenIds.add(report.id)
      rows.push(report)
    }
    if (response.total <= rows.length || response.total === 0) break
    if (rows.length === previousSize) break
    page += 1
  }

  return rows
}

export async function listAllMatchingDatasetExperimentReports(
  api: SceneExperimentApi,
  projectId: string,
  datasetId: string,
  query: DataTableQueryState,
  totalRowCount: number,
  pageSize = 100
) {
  const rows: ExperimentReport[] = []
  const seenIds = new Set<string>()
  const normalizedPageSize = Math.max(1, pageSize)
  const pageCount = Math.ceil(Math.max(0, totalRowCount) / normalizedPageSize)

  for (let page = 1; page <= pageCount; page += 1) {
    const response = await listDatasetExperimentReports(
      api,
      projectId,
      datasetId,
      {
        ...query,
        page,
        pageSize: normalizedPageSize,
      }
    )
    if (response.datas.length === 0) break

    const previousSize = rows.length
    for (const report of response.datas) {
      if (seenIds.has(report.id)) continue
      seenIds.add(report.id)
      rows.push(report)
    }
    if (rows.length >= totalRowCount || rows.length === previousSize) break
  }

  return rows.slice(0, totalRowCount)
}

export function getExperimentReport(
  api: SceneExperimentApi,
  projectId: string,
  reportId: string
) {
  return api.getExperimentReport<ExperimentReport>({
    path: { projectId, reportId },
  })
}

export function aggregateExperimentReports(
  api: SceneExperimentApi,
  projectId: string,
  reportIds: string[]
) {
  return api.aggregateExperimentReports<AggregateExperimentResult>({
    path: { projectId },
    body: { reportIds },
  })
}

export function compareExperimentReports(
  api: SceneExperimentApi,
  projectId: string,
  reportIds: string[]
) {
  return api.compareExperimentReports<CompareExperimentResult>({
    path: { projectId },
    body: { reportIds },
  })
}

export function listExperimentReportBaselines(
  api: SceneExperimentApi,
  projectId: string,
  datasetId: string
) {
  return api.getExperimentReportBaselines<ExperimentReportBaseline[]>({
    path: { projectId, datasetId },
  })
}

export function setExperimentReportBaseline(
  api: SceneExperimentApi,
  projectId: string,
  reportId: string
) {
  return api.setExperimentReportBaseline<ExperimentReportBaseline>({
    path: { projectId },
    body: { reportId },
  })
}
