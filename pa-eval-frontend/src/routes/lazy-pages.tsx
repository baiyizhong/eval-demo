import { lazy } from 'react'

export const ProjectAnnotationBatch = lazy(() =>
  import('@/modules/app-evaluation/views/annotation-batch').then((module) => ({
    default: module.ProjectAnnotationBatch,
  }))
)

export const ProjectAnnotationItemAnnotate = lazy(() =>
  import('@/modules/app-evaluation/views/annotation-item-annotate').then(
    (module) => ({ default: module.ProjectAnnotationItemAnnotate })
  )
)

export const ProjectAnnotationQueueDetail = lazy(() =>
  import('@/modules/app-evaluation/views/annotation-queue-detail').then(
    (module) => ({ default: module.ProjectAnnotationQueueDetail })
  )
)

export const ProjectAnnotationQueues = lazy(() =>
  import('@/modules/app-evaluation/views/annotation-queues').then((module) => ({
    default: module.ProjectAnnotationQueues,
  }))
)

export const ProjectAutoEvaluationDetail = lazy(() =>
  import('@/modules/app-evaluation/views/auto-evaluation-detail').then(
    (module) => ({ default: module.ProjectAutoEvaluationDetail })
  )
)

export const ProjectAutoEvaluationNew = lazy(() =>
  import('@/modules/app-evaluation/views/auto-evaluation-new').then(
    (module) => ({
      default: module.ProjectAutoEvaluationNew,
    })
  )
)

export const ProjectAutoEvaluations = lazy(() =>
  import('@/modules/app-evaluation/views/auto-evaluations').then((module) => ({
    default: module.ProjectAutoEvaluations,
  }))
)

export const ProjectDatasetDetail = lazy(() =>
  import('@/modules/app-evaluation/views/dataset-detail').then((module) => ({
    default: module.ProjectDatasetDetail,
  }))
)

export const ProjectDatasets = lazy(() =>
  import('@/modules/app-evaluation/views/datasets').then((module) => ({
    default: module.ProjectDatasets,
  }))
)

export const ProjectEvaluationReportDetail = lazy(() =>
  import('@/modules/app-evaluation/views/evaluation-report-detail').then(
    (module) => ({ default: module.ProjectEvaluationReportDetail })
  )
)

export const ProjectEvaluationReports = lazy(() =>
  import('@/modules/app-evaluation/views/evaluation-reports').then(
    (module) => ({
      default: module.ProjectEvaluationReports,
    })
  )
)

export const TraceDashboard = lazy(() =>
  import('@/modules/app-observability/views/trace-dashboard').then(
    (module) => ({
      default: module.TraceDashboard,
    })
  )
)

export const TraceLogs = lazy(() =>
  import('@/modules/app-observability/views/trace-logs').then((module) => ({
    default: module.TraceLogs,
  }))
)

export const Apps = lazy(() =>
  import('@/modules/apps').then((module) => ({ default: module.Apps }))
)

export const Dashboard = lazy(() =>
  import('@/modules/dashboard').then((module) => ({
    default: module.Dashboard,
  }))
)

export const SettingsOrganizationInfo = lazy(() =>
  import('@/modules/organization-management/views/info').then((module) => ({
    default: module.SettingsOrganizationInfo,
  }))
)

export const SettingsOrganizationMembers = lazy(() =>
  import('@/modules/organization-management/views/members').then((module) => ({
    default: module.SettingsOrganizationMembers,
  }))
)

export const ProjectApiKeysSettings = lazy(() =>
  import('@/modules/project-settings/views/api-keys').then((module) => ({
    default: module.ProjectApiKeysSettings,
  }))
)

export const ProjectGeneralSettings = lazy(() =>
  import('@/modules/project-settings/views/general').then((module) => ({
    default: module.ProjectGeneralSettings,
  }))
)

export const ProjectMembersSettings = lazy(() =>
  import('@/modules/project-settings/views/members').then((module) => ({
    default: module.ProjectMembersSettings,
  }))
)

export const ProjectModelsSettings = lazy(() =>
  import('@/modules/project-settings/views/models').then((module) => ({
    default: module.ProjectModelsSettings,
  }))
)

export const ProjectScoreConfigsSettings = lazy(() =>
  import('@/modules/project-settings/views/score-configs').then((module) => ({
    default: module.ProjectScoreConfigsSettings,
  }))
)

export const ScheduledJobs = lazy(() =>
  import('@/modules/scheduled-jobs').then((module) => ({
    default: module.ScheduledJobs,
  }))
)

export const BackendManagement = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.BackendManagement,
  }))
)

export const BackendOverview = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.BackendOverview,
  }))
)

export const BackendUsers = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.BackendUsers,
  }))
)

export const HelpDocs = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.HelpDocs,
  }))
)

export const OperationAudit = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.OperationAudit,
  }))
)

export const PermissionRequest = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.PermissionRequest,
  }))
)

export const TaskEvaluators = lazy(() =>
  import('@/modules/tasks/views/evaluators').then((module) => ({
    default: module.TaskEvaluators,
  }))
)

export const ProjectSkills = lazy(() =>
  import('@/modules/skills/views/skills').then((module) => ({
    default: module.ProjectSkills,
  }))
)
