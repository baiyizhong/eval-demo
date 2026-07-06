import type { ApiMethod } from '@/api/types'
import type { DataTableListResponse } from '@/components/common/data-table'
import type { EvaluationReportTemplateRecord } from '../types'

type ReportTemplateApiClient = {
  getEvaluationReportTemplates: ApiMethod
  createEvaluationReportTemplate: ApiMethod
  updateEvaluationReportTemplate: ApiMethod
  deleteEvaluationReportTemplate: ApiMethod
}

export type EvaluationReportTemplateInput = Pick<
  EvaluationReportTemplateRecord,
  | 'name'
  | 'description'
  | 'isDefault'
  | 'titleTemplate'
  | 'summaryTemplate'
  | 'sections'
  | 'badcaseRule'
  | 'recommendations'
  | 'risks'
>

export function listProjectEvaluationReportTemplates(
  api: ReportTemplateApiClient,
  projectId: string
) {
  return api.getEvaluationReportTemplates<
    DataTableListResponse<EvaluationReportTemplateRecord>
  >({
    path: { projectId },
    query: { page: 1, pageSize: 100 },
  })
}

export function createProjectEvaluationReportTemplate(
  api: ReportTemplateApiClient,
  projectId: string,
  input: EvaluationReportTemplateInput
) {
  return api.createEvaluationReportTemplate<EvaluationReportTemplateRecord>({
    path: { projectId },
    body: input,
  })
}

export function updateProjectEvaluationReportTemplate(
  api: ReportTemplateApiClient,
  projectId: string,
  templateId: string,
  input: EvaluationReportTemplateInput
) {
  return api.updateEvaluationReportTemplate<EvaluationReportTemplateRecord>({
    path: { projectId, templateId },
    body: input,
  })
}

export function deleteProjectEvaluationReportTemplate(
  api: ReportTemplateApiClient,
  projectId: string,
  templateId: string
) {
  return api.deleteEvaluationReportTemplate<{ id: string }>({
    path: { projectId, templateId },
  })
}
