import { layoutApi } from '@/modules/layout/api'
import { observabilityApi } from '@/modules/app-observability/api'
import { organizationApi } from '@/modules/organization-management/api'

export const apiRegistry = {
  ...layoutApi,
  ...observabilityApi,
  ...organizationApi,
  getPermissions: {
    method: 'GET',
    url: '/permissions',
  },
  getProjects: {
    method: 'GET',
    url: '/projects',
  },
  getEvaluators: {
    method: 'GET',
    url: '/evaluators',
  },
  getEvaluator: {
    method: 'GET',
    url: '/evaluators/:evaluatorId',
  },
  createEvaluator: {
    method: 'POST',
    url: '/evaluators',
  },
  deleteEvaluator: {
    method: 'DELETE',
    url: '/evaluators/:evaluatorId',
  },
  getEvaluationReports: {
    method: 'GET',
    url: '/projects/:projectId/evaluation-reports',
  },
  getProjectDatasets: {
    method: 'GET',
    url: '/projects/:projectId/datasets',
  },
  getProjectDataset: {
    method: 'GET',
    url: '/projects/:projectId/datasets/:datasetId',
  },
  getProjectDatasetMetrics: {
    method: 'GET',
    url: '/projects/:projectId/datasets/:datasetId/metrics',
  },
  getProjectDatasetItems: {
    method: 'GET',
    url: '/projects/:projectId/datasets/:datasetId/items',
  },
  getEvaluationReport: {
    method: 'GET',
    url: '/projects/:projectId/evaluation-reports/:reportId',
  },
  deleteEvaluationReport: {
    method: 'DELETE',
    url: '/projects/:projectId/evaluation-reports/:reportId',
  },
  getEvaluationReportItems: {
    method: 'GET',
    url: '/projects/:projectId/evaluation-reports/:reportId/items',
  },
  getEvaluationReportBadcases: {
    method: 'GET',
    url: '/projects/:projectId/evaluation-reports/:reportId/badcases',
  },
  getAutoEvaluationTasks: {
    method: 'GET',
    url: '/projects/:projectId/auto-evaluations',
  },
  createAutoEvaluationTask: {
    method: 'POST',
    url: '/projects/:projectId/auto-evaluations',
  },
  countProjectTraces: {
    method: 'POST',
    url: '/projects/:projectId/traces/count',
  },
  getAutoEvaluationSummary: {
    method: 'GET',
    url: '/projects/:projectId/auto-evaluations/summary',
  },
  getAutoEvaluationTask: {
    method: 'GET',
    url: '/projects/:projectId/auto-evaluations/:taskId',
  },
  deleteAutoEvaluationTask: {
    method: 'DELETE',
    url: '/projects/:projectId/auto-evaluations/:taskId',
  },
  getAutoEvaluationLatestReport: {
    method: 'GET',
    url: '/projects/:projectId/auto-evaluations/:taskId/latest-report',
  },
  getAutoEvaluationRuns: {
    method: 'GET',
    url: '/projects/:projectId/auto-evaluations/:taskId/runs',
  },
} as const

export type AppApiRegistry = typeof apiRegistry
