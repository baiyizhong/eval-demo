import { db } from './_data.ts'
import { body, id, keywordIncludes, nowIso, paginate, pathParam, success } from './_utils.ts'

const projectId = (req: any) => pathParam(req, 'projectId')
const reportId = (req: any) => pathParam(req, 'reportId')

export default [
  {
    url: '/api/projects/:projectId/report-templates/:templateId',
    method: 'patch',
    response: (req: any) => {
      const index = db.reportTemplates.findIndex(
        (template) => template.id === pathParam(req, 'templateId')
      )
      if (index >= 0) {
        db.reportTemplates[index] = {
          ...db.reportTemplates[index],
          ...body(req),
          updatedAt: nowIso(),
        }
      }
      return success(db.reportTemplates[index] ?? { id: pathParam(req, 'templateId') })
    },
  },
  {
    url: '/api/projects/:projectId/report-templates/:templateId',
    method: 'delete',
    response: (req: any) => {
      const templateId = pathParam(req, 'templateId')
      db.reportTemplates = db.reportTemplates.filter((template) => template.id !== templateId)
      return success({ id: templateId })
    },
  },
  {
    url: '/api/projects/:projectId/report-templates',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.reportTemplates
            .filter((template) => template.projectId === projectId(req))
            .filter((template) => keywordIncludes(template, req.query?.keyword)),
          req.query,
          10
        )
      ),
  },
  {
    url: '/api/projects/:projectId/report-templates',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const template = {
        id: id('tpl'),
        projectId: projectId(req),
        name: input.name,
        description: input.description ?? '',
        config: input.config ?? {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.reportTemplates.unshift(template)
      return success(template)
    },
  },
  {
    url: '/api/projects/:projectId/evaluation-reports/:reportId/items',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.reportItems.filter((item) => item.reportId === reportId(req)),
          req.query,
          20
        )
      ),
  },
  {
    url: '/api/projects/:projectId/evaluation-reports/:reportId/badcases',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.reportItems
            .filter((item) => item.reportId === reportId(req))
            .filter((item) => item.status !== 'PASSED'),
          req.query,
          20
        )
      ),
  },
  {
    url: '/api/projects/:projectId/evaluation-reports/:reportId/flowbacks/preview',
    method: 'post',
    response: (req: any) =>
      success({
        reportId: reportId(req),
        targetDatasetId: body(req).datasetId ?? db.datasets[0].id,
        itemCount: db.reportItems.filter((item) => item.reportId === reportId(req)).length,
        conflicts: [],
      }),
  },
  {
    url: '/api/projects/:projectId/evaluation-reports/:reportId/flowbacks',
    method: 'get',
    response: (req: any) =>
      success(db.reportFlowbacks.filter((flowback: any) => flowback.reportId === reportId(req))),
  },
  {
    url: '/api/projects/:projectId/evaluation-reports/:reportId/flowbacks',
    method: 'post',
    response: (req: any) => {
      const flowback = {
        id: id('flowback'),
        projectId: projectId(req),
        reportId: reportId(req),
        datasetId: body(req).datasetId ?? db.datasets[0].id,
        status: 'COMPLETED',
        itemCount: db.reportItems.filter((item) => item.reportId === reportId(req)).length,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.reportFlowbacks.unshift(flowback as never)
      return success(flowback)
    },
  },
  {
    url: '/api/projects/:projectId/evaluation-reports/:reportId',
    method: 'get',
    response: (req: any) =>
      success(
        db.evaluationReports.find(
          (report) => report.projectId === projectId(req) && report.id === reportId(req)
        ) ?? db.evaluationReports[0]
      ),
  },
  {
    url: '/api/projects/:projectId/evaluation-reports/:reportId',
    method: 'delete',
    response: (req: any) => {
      const rid = reportId(req)
      db.evaluationReports = db.evaluationReports.filter((report) => report.id !== rid)
      return success({ id: rid })
    },
  },
  {
    url: '/api/projects/:projectId/evaluation-reports',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.evaluationReports
            .filter((report) => report.projectId === projectId(req))
            .filter((report) => keywordIncludes(report, req.query?.keyword)),
          req.query,
          10
        )
      ),
  },
]
