import { observabilityApi } from '@/modules/app-observability/api'
import { organizationApi } from '@/modules/organization-management/api'
import { systemManagementApi } from '@/modules/system-pages/api'

export const apiRegistry = {
  ...observabilityApi,
  ...organizationApi,
  ...systemManagementApi,
  getSession: {
    method: 'GET',
    url: '/user/session',
  },
  getProjects: {
    method: 'GET',
    url: '/projects',
  },
  createProject: {
    method: 'POST',
    url: '/projects',
  },
  updateProject: {
    method: 'PATCH',
    url: '/projects/:projectId',
  },
  archiveProject: {
    method: 'POST',
    url: '/projects/:projectId/archive',
  },
  restoreProject: {
    method: 'POST',
    url: '/projects/:projectId/restore',
  },
  getProjectApiKeys: {
    method: 'GET',
    url: '/projects/:projectId/settings/api-keys',
  },
  getProjectMembers: {
    method: 'GET',
    url: '/projects/:projectId/settings/members',
  },
  createProjectMember: {
    method: 'POST',
    url: '/projects/:projectId/settings/members',
  },
  updateProjectMember: {
    method: 'PATCH',
    url: '/projects/:projectId/settings/members/:memberId',
  },
  deleteProjectMember: {
    method: 'DELETE',
    url: '/projects/:projectId/settings/members/:memberId',
  },
  createProjectApiKey: {
    method: 'POST',
    url: '/projects/:projectId/settings/api-keys',
  },
  updateProjectApiKey: {
    method: 'PATCH',
    url: '/projects/:projectId/settings/api-keys/:keyId',
  },
  deleteProjectApiKey: {
    method: 'DELETE',
    url: '/projects/:projectId/settings/api-keys/:keyId',
  },
  getProjectModelSettings: {
    method: 'GET',
    url: '/projects/:projectId/settings/models',
  },
  updateProjectDefaultModel: {
    method: 'PATCH',
    url: '/projects/:projectId/settings/models/default',
  },
  createProjectLlmConnection: {
    method: 'POST',
    url: '/projects/:projectId/settings/models/llm-connections',
  },
  updateProjectLlmConnection: {
    method: 'PATCH',
    url: '/projects/:projectId/settings/models/llm-connections/:connectionId',
  },
  deleteProjectLlmConnection: {
    method: 'DELETE',
    url: '/projects/:projectId/settings/models/llm-connections/:connectionId',
  },
  createProjectModelDefinition: {
    method: 'POST',
    url: '/projects/:projectId/settings/models/definitions',
  },
  updateProjectModelDefinition: {
    method: 'PATCH',
    url: '/projects/:projectId/settings/models/definitions/:modelId',
  },
  deleteProjectModelDefinition: {
    method: 'DELETE',
    url: '/projects/:projectId/settings/models/definitions/:modelId',
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
  patchEvaluator: {
    method: 'PATCH',
    url: '/evaluators/:evaluatorId',
  },
  deleteEvaluator: {
    method: 'DELETE',
    url: '/evaluators/:evaluatorId',
  },
  getEvaluationReports: {
    method: 'GET',
    url: '/projects/:projectId/evaluation-reports',
  },
  getEvaluationReportTemplates: {
    method: 'GET',
    url: '/projects/:projectId/report-templates',
  },
  createEvaluationReportTemplate: {
    method: 'POST',
    url: '/projects/:projectId/report-templates',
  },
  updateEvaluationReportTemplate: {
    method: 'PATCH',
    url: '/projects/:projectId/report-templates/:templateId',
  },
  deleteEvaluationReportTemplate: {
    method: 'DELETE',
    url: '/projects/:projectId/report-templates/:templateId',
  },
  getProjectDatasets: {
    method: 'GET',
    url: '/projects/:projectId/datasets',
  },
  getProjectDatasetNameAvailability: {
    method: 'GET',
    url: '/projects/:projectId/datasets/name-availability',
  },
  createProjectDataset: {
    method: 'POST',
    url: '/projects/:projectId/datasets',
  },
  getProjectDataset: {
    method: 'GET',
    url: '/projects/:projectId/datasets/:datasetId',
  },
  updateProjectDataset: {
    method: 'PATCH',
    url: '/projects/:projectId/datasets/:datasetId',
  },
  deleteProjectDataset: {
    method: 'DELETE',
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
  getProjectDatasetItemStatusCounts: {
    method: 'GET',
    url: '/projects/:projectId/datasets/:datasetId/items/status-counts',
  },
  createProjectDatasetExportJob: {
    method: 'POST',
    url: '/projects/:projectId/datasets/:datasetId/export-jobs',
  },
  getProjectDatasetExportJob: {
    method: 'GET',
    url: '/projects/:projectId/datasets/:datasetId/export-jobs/:jobId',
  },
  downloadProjectDatasetExportJob: {
    method: 'GET',
    url: '/projects/:projectId/datasets/:datasetId/export-jobs/:jobId/download',
    responseType: 'blob',
  },
  createProjectDatasetItem: {
    method: 'POST',
    url: '/projects/:projectId/datasets/:datasetId/items',
  },
  updateProjectDatasetItem: {
    method: 'PATCH',
    url: '/projects/:projectId/datasets/:datasetId/items/:itemId',
  },
  deleteProjectDatasetItem: {
    method: 'DELETE',
    url: '/projects/:projectId/datasets/:datasetId/items/:itemId',
  },
  archiveProjectDatasetItem: {
    method: 'POST',
    url: '/projects/:projectId/datasets/:datasetId/items/:itemId/archive',
  },
  getProjectScoreConfigs: {
    method: 'GET',
    url: '/projects/:projectId/score-configs',
  },
  ensureDefaultProjectScoreConfig: {
    method: 'POST',
    url: '/projects/:projectId/score-configs/default',
  },
  createProjectScoreConfig: {
    method: 'POST',
    url: '/projects/:projectId/score-configs',
  },
  updateProjectScoreConfig: {
    method: 'PATCH',
    url: '/projects/:projectId/score-configs/:configId',
  },
  archiveProjectScoreConfig: {
    method: 'POST',
    url: '/projects/:projectId/score-configs/:configId/archive',
  },
  restoreProjectScoreConfig: {
    method: 'POST',
    url: '/projects/:projectId/score-configs/:configId/restore',
  },
  getProjectAnnotationUsers: {
    method: 'GET',
    url: '/projects/:projectId/annotation-users',
  },
  getProjectAnnotationQueues: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues',
  },
  getProjectAnnotationQueueNameAvailability: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues/name-availability',
  },
  createProjectAnnotationQueue: {
    method: 'POST',
    url: '/projects/:projectId/annotation-queues',
  },
  getProjectAnnotationQueue: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues/:queueId',
  },
  updateProjectAnnotationQueue: {
    method: 'PATCH',
    url: '/projects/:projectId/annotation-queues/:queueId',
  },
  deleteProjectAnnotationQueue: {
    method: 'DELETE',
    url: '/projects/:projectId/annotation-queues/:queueId',
  },
  getProjectAnnotationQueueMetrics: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues/:queueId/metrics',
  },
  getProjectAnnotationQueueItems: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues/:queueId/items',
  },
  getProjectAnnotationQueueItemFilterCounts: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues/:queueId/items/filter-counts',
  },
  previewProjectAnnotationExport: {
    method: 'POST',
    url: '/projects/:projectId/annotation-queues/:queueId/export-preview',
  },
  createProjectAnnotationExportJob: {
    method: 'POST',
    url: '/projects/:projectId/annotation-queues/:queueId/export-jobs',
  },
  getProjectAnnotationExportJob: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues/:queueId/export-jobs/:jobId',
  },
  downloadProjectAnnotationExportJob: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues/:queueId/export-jobs/:jobId/download',
    responseType: 'blob',
  },
  createProjectAnnotationQueueItem: {
    method: 'POST',
    url: '/projects/:projectId/annotation-queues/:queueId/items',
  },
  deleteProjectAnnotationQueueItems: {
    method: 'DELETE',
    url: '/projects/:projectId/annotation-queues/:queueId/items',
  },
  updateProjectAnnotationQueueItemAssignees: {
    method: 'PATCH',
    url: '/projects/:projectId/annotation-queues/:queueId/items/assignees',
  },
  getProjectAnnotationQueueItem: {
    method: 'GET',
    url: '/projects/:projectId/annotation-queues/:queueId/items/:itemId',
  },
  previewProjectAnnotationBatch: {
    method: 'POST',
    url: '/projects/:projectId/annotation-queues/:queueId/batch-preview',
  },
  saveProjectAnnotationBatchScores: {
    method: 'POST',
    url: '/projects/:projectId/annotation-queues/:queueId/batch-scores',
  },
  saveProjectAnnotationScores: {
    method: 'POST',
    url: '/projects/:projectId/annotation-queues/:queueId/items/:itemId/scores',
  },
  addProjectAnnotationItemToDataset: {
    method: 'POST',
    url: '/projects/:projectId/annotation-queues/:queueId/items/:itemId/dataset-items',
  },
  createTraceAnnotationTask: {
    method: 'POST',
    url: '/projects/:projectId/traces/annotation-task',
  },
  createProjectTraceAnnotationTaskJob: {
    method: 'POST',
    url: '/projects/:projectId/traces/annotation-task-jobs',
  },
  getProjectTraceAnnotationTaskJob: {
    method: 'GET',
    url: '/projects/:projectId/traces/annotation-task-jobs/:jobId',
  },
  addProjectTracesToDataset: {
    method: 'POST',
    url: '/projects/:projectId/traces/dataset-items',
  },
  createProjectTraceDatasetImportJob: {
    method: 'POST',
    url: '/projects/:projectId/traces/dataset-import-jobs',
  },
  getProjectTraceDatasetImportJob: {
    method: 'GET',
    url: '/projects/:projectId/traces/dataset-import-jobs/:jobId',
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
  getEvaluationReportFlowbacks: {
    method: 'GET',
    url: '/projects/:projectId/evaluation-reports/:reportId/flowbacks',
  },
  previewEvaluationReportFlowback: {
    method: 'POST',
    url: '/projects/:projectId/evaluation-reports/:reportId/flowbacks/preview',
  },
  createEvaluationReportFlowback: {
    method: 'POST',
    url: '/projects/:projectId/evaluation-reports/:reportId/flowbacks',
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
  rerunAutoEvaluationTask: {
    method: 'POST',
    url: '/projects/:projectId/auto-evaluations/:taskId/rerun',
  },
  getAutoEvaluationLatestReport: {
    method: 'GET',
    url: '/projects/:projectId/auto-evaluations/:taskId/latest-report',
  },
  getAutoEvaluationRuns: {
    method: 'GET',
    url: '/projects/:projectId/auto-evaluations/:taskId/runs',
  },
  getScheduledJobs: {
    method: 'GET',
    url: '/projects/:projectId/scheduled-jobs',
  },
  createScheduledJob: {
    method: 'POST',
    url: '/projects/:projectId/scheduled-jobs',
  },
  updateScheduledJob: {
    method: 'PATCH',
    url: '/projects/:projectId/scheduled-jobs/:jobId',
  },
  pauseScheduledJob: {
    method: 'POST',
    url: '/projects/:projectId/scheduled-jobs/:jobId/pause',
  },
  resumeScheduledJob: {
    method: 'POST',
    url: '/projects/:projectId/scheduled-jobs/:jobId/resume',
  },
  deleteScheduledJob: {
    method: 'DELETE',
    url: '/projects/:projectId/scheduled-jobs/:jobId',
  },
  runScheduledJob: {
    method: 'POST',
    url: '/projects/:projectId/scheduled-jobs/:jobId/run',
  },
  triggerScheduledJob: {
    method: 'POST',
    url: '/projects/:projectId/scheduled-jobs/:jobId/trigger',
  },
  getScheduledJobLogs: {
    method: 'GET',
    url: '/projects/:projectId/scheduled-job-logs',
  },
} as const

export type AppApiRegistry = typeof apiRegistry
