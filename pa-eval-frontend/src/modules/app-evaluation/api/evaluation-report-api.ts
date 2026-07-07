import type { ApiMethod } from '@/api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import type {
  EvaluationReportBadcaseRecord,
  EvaluationReportDetailRecord,
  EvaluationReportFlowbackInput,
  EvaluationReportFlowbackRecord,
  EvaluationReportItemRecord,
  EvaluationReportRecord,
} from '../types'

type EvaluationReportApiClient = {
  getEvaluationReports: ApiMethod
  getEvaluationReport: ApiMethod
  deleteEvaluationReport: ApiMethod
  getEvaluationReportItems: ApiMethod
  getEvaluationReportBadcases: ApiMethod
  getEvaluationReportFlowbacks: ApiMethod
  previewEvaluationReportFlowback: ApiMethod
  createEvaluationReportFlowback: ApiMethod
}

export type EvaluationReportFlowbackPreview = {
  matchedCount: number
  duplicateCount: number
  willCreateCount: number
  defaultDatasetName: string
}

export function listProjectEvaluationReports(
  api: EvaluationReportApiClient,
  projectId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()

  return api.getEvaluationReports<
    DataTableListResponse<EvaluationReportRecord>
  >({
    path: { projectId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
    },
  })
}

export function getProjectEvaluationReport(
  api: EvaluationReportApiClient,
  projectId: string,
  reportId: string
) {
  return api.getEvaluationReport<EvaluationReportDetailRecord>({
    path: { projectId, reportId },
  })
}

export function deleteProjectEvaluationReport(
  api: EvaluationReportApiClient,
  projectId: string,
  reportId: string
) {
  return api.deleteEvaluationReport<{ id: string }>({
    path: { projectId, reportId },
  })
}

export function listProjectEvaluationReportItems(
  api: EvaluationReportApiClient,
  projectId: string,
  reportId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()

  return api.getEvaluationReportItems<
    DataTableListResponse<EvaluationReportItemRecord>
  >({
    path: { projectId, reportId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
    },
  })
}

export function listProjectEvaluationReportBadcases(
  api: EvaluationReportApiClient,
  projectId: string,
  reportId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim()

  return api.getEvaluationReportBadcases<
    DataTableListResponse<EvaluationReportBadcaseRecord>
  >({
    path: { projectId, reportId },
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(keyword ? { keyword } : {}),
    },
  })
}

export function listProjectEvaluationReportFlowbacks(
  api: EvaluationReportApiClient,
  projectId: string,
  reportId: string
) {
  return api.getEvaluationReportFlowbacks<EvaluationReportFlowbackRecord[]>({
    path: { projectId, reportId },
  })
}

export function previewProjectEvaluationReportFlowback(
  api: EvaluationReportApiClient,
  projectId: string,
  reportId: string,
  input: EvaluationReportFlowbackInput
) {
  return api.previewEvaluationReportFlowback<EvaluationReportFlowbackPreview>({
    path: { projectId, reportId },
    body: input,
  })
}

export function createProjectEvaluationReportFlowback(
  api: EvaluationReportApiClient,
  projectId: string,
  reportId: string,
  input: EvaluationReportFlowbackInput
) {
  return api.createEvaluationReportFlowback<EvaluationReportFlowbackRecord>({
    path: { projectId, reportId },
    body: input,
  })
}

export async function exportProjectEvaluationReport(
  api: EvaluationReportApiClient,
  projectId: string,
  reportId: string,
  format: 'markdown'
) {
  const report = await getProjectEvaluationReport(api, projectId, reportId)
  return {
    filename: `${report.title}.${format === 'markdown' ? 'md' : format}`,
    content: [
      `# ${report.title}`,
      '',
      report.summary,
      '',
      `- 样本数：${report.sampleCount}`,
      `- Badcase：${report.badcaseCount}`,
      `- 平均分：${report.metrics.averageScore ?? 0}`,
    ].join('\n'),
  }
}
