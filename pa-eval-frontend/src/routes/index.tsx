import { lazy, useMemo } from 'react'
import {
  AppEvaluation,
  AppEvaluationIndexRedirect,
} from '@/modules/app-evaluation'
import {
  AppObservability,
  AppObservabilityIndexRedirect,
} from '@/modules/app-observability'
import { EnvironmentSelect } from '@/modules/environment'
import { EnvironmentGate } from '@/modules/environment/environment-gate'
import { ForbiddenError } from '@/modules/errors/forbidden'
import { GeneralError } from '@/modules/errors/general-error'
import { MaintenanceError } from '@/modules/errors/maintenance-error'
import { NotFoundError } from '@/modules/errors/not-found-error'
import { UnauthorisedError } from '@/modules/errors/unauthorized-error'
import { Login } from '@/modules/login'
import { OrganizationSwitcher } from '@/modules/organization-management/components/organization-switcher'
import {
  ProjectSettings,
  ProjectSettingsIndexRedirect,
} from '@/modules/project-settings'
import { Settings } from '@/modules/settings'
import { BookOpen, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router'
import { useAuthProfileMenu } from '@/hooks/use-auth-profile-menu'
import { RootErrorBoundary } from '@/components/common/error-boundary/root-error-boundary'
import { ProjectRouteGuard, RouteGuard } from '@/components/common/route-guard'
import { RootLayout } from '@/components/layout/root-layout'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { type TopNavProps } from '@/components/layout/top-nav'
import { TopbarLayout } from '@/components/layout/topbar-layout'

const ProjectAnnotationBatch = lazy(() =>
  import('@/modules/app-evaluation/views/annotation-batch').then((module) => ({
    default: module.ProjectAnnotationBatch,
  }))
)
const ProjectAnnotationItemAnnotate = lazy(() =>
  import('@/modules/app-evaluation/views/annotation-item-annotate').then(
    (module) => ({ default: module.ProjectAnnotationItemAnnotate })
  )
)
const ProjectAnnotationQueueDetail = lazy(() =>
  import('@/modules/app-evaluation/views/annotation-queue-detail').then(
    (module) => ({ default: module.ProjectAnnotationQueueDetail })
  )
)
const ProjectAnnotationQueues = lazy(() =>
  import('@/modules/app-evaluation/views/annotation-queues').then((module) => ({
    default: module.ProjectAnnotationQueues,
  }))
)
const ProjectAutoEvaluationDetail = lazy(() =>
  import('@/modules/app-evaluation/views/auto-evaluation-detail').then(
    (module) => ({ default: module.ProjectAutoEvaluationDetail })
  )
)
const ProjectAutoEvaluationNew = lazy(() =>
  import('@/modules/app-evaluation/views/auto-evaluation-new').then(
    (module) => ({
      default: module.ProjectAutoEvaluationNew,
    })
  )
)
const ProjectAutoEvaluations = lazy(() =>
  import('@/modules/app-evaluation/views/auto-evaluations').then((module) => ({
    default: module.ProjectAutoEvaluations,
  }))
)
const ProjectDatasetDetail = lazy(() =>
  import('@/modules/app-evaluation/views/dataset-detail').then((module) => ({
    default: module.ProjectDatasetDetail,
  }))
)
const ProjectDatasets = lazy(() =>
  import('@/modules/app-evaluation/views/datasets').then((module) => ({
    default: module.ProjectDatasets,
  }))
)
const ProjectEvaluationReportDetail = lazy(() =>
  import('@/modules/app-evaluation/views/evaluation-report-detail').then(
    (module) => ({ default: module.ProjectEvaluationReportDetail })
  )
)
const ProjectEvaluationReports = lazy(() =>
  import('@/modules/app-evaluation/views/evaluation-reports').then(
    (module) => ({
      default: module.ProjectEvaluationReports,
    })
  )
)
const TraceDashboard = lazy(() =>
  import('@/modules/app-observability/views/trace-dashboard').then(
    (module) => ({
      default: module.TraceDashboard,
    })
  )
)
const TraceLogs = lazy(() =>
  import('@/modules/app-observability/views/trace-logs').then((module) => ({
    default: module.TraceLogs,
  }))
)
const Apps = lazy(() =>
  import('@/modules/apps').then((module) => ({ default: module.Apps }))
)
const Dashboard = lazy(() =>
  import('@/modules/dashboard').then((module) => ({
    default: module.Dashboard,
  }))
)
const SettingsOrganizationInfo = lazy(() =>
  import('@/modules/organization-management/views/info').then((module) => ({
    default: module.SettingsOrganizationInfo,
  }))
)
const SettingsOrganizationMembers = lazy(() =>
  import('@/modules/organization-management/views/members').then((module) => ({
    default: module.SettingsOrganizationMembers,
  }))
)
const ProjectApiKeysSettings = lazy(() =>
  import('@/modules/project-settings/views/api-keys').then((module) => ({
    default: module.ProjectApiKeysSettings,
  }))
)
const ProjectGeneralSettings = lazy(() =>
  import('@/modules/project-settings/views/general').then((module) => ({
    default: module.ProjectGeneralSettings,
  }))
)
const ProjectMembersSettings = lazy(() =>
  import('@/modules/project-settings/views/members').then((module) => ({
    default: module.ProjectMembersSettings,
  }))
)
const ProjectModelsSettings = lazy(() =>
  import('@/modules/project-settings/views/models').then((module) => ({
    default: module.ProjectModelsSettings,
  }))
)
const ProjectScoreConfigsSettings = lazy(() =>
  import('@/modules/project-settings/views/score-configs').then((module) => ({
    default: module.ProjectScoreConfigsSettings,
  }))
)
const ScheduledJobs = lazy(() =>
  import('@/modules/scheduled-jobs').then((module) => ({
    default: module.ScheduledJobs,
  }))
)
const BackendManagement = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.BackendManagement,
  }))
)
const BackendOverview = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.BackendOverview,
  }))
)
const BackendUsers = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.BackendUsers,
  }))
)
const HelpDocs = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.HelpDocs,
  }))
)
const OperationAudit = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.OperationAudit,
  }))
)
const PermissionRequest = lazy(() =>
  import('@/modules/system-pages').then((module) => ({
    default: module.PermissionRequest,
  }))
)
const TaskEvaluators = lazy(() =>
  import('@/modules/tasks/views/evaluators').then((module) => ({
    default: module.TaskEvaluators,
  }))
)

const appsTopbarNavigation: TopNavProps = {
  brand: {
    name: '智能评测系统',
    initial: 'A',
    ariaLabel: '智能评测系统',
  },
  items: [
    {
      id: 'apps',
      label: '项目管理',
      href: '/apps',
      activeMatch: 'prefix',
      accessRules: [
        { scope: { type: 'org', all: true }, access: 'org:project:view' },
        { scope: { type: 'project', all: true }, anyPermission: true },
      ],
    },
    {
      id: 'org',
      label: '组织管理',
      href: '/settings',
      activeMatch: 'prefix',
      access: ['org:organization:view', 'org:member:view'],
      scope: { type: 'org' },
    },
    {
      id: 'audit',
      label: '操作审计',
      href: '/audit',
      activeMatch: 'prefix',
      access: 'system:audit:view',
      scope: { type: 'system' },
    },
    {
      id: 'backend',
      label: '后台管理',
      href: '/backend',
      activeMatch: 'prefix',
      superAccess: true,
    },
  ],
  inlineActions: [
    {
      id: 'help',
      label: '帮助文档',
      href: '/help',
      icon: BookOpen,
      title: '帮助文档',
      ariaLabel: '帮助文档',
    },
    {
      id: 'permissions',
      label: '申请权限',
      href: '/permissions',
      icon: ShieldCheck,
      title: '申请权限',
      ariaLabel: '申请权限',
    },
  ],
  rightSlot: <OrganizationSwitcher />,
}

function AppsTopbarLayout() {
  const { user, menuActions, handleAuthMenuAction } = useAuthProfileMenu()
  const navigation = useMemo<TopNavProps>(
    () => ({
      ...appsTopbarNavigation,
      user,
      menuActions,
      onAction: handleAuthMenuAction,
    }),
    [handleAuthMenuAction, menuActions, user]
  )

  return <TopbarLayout navigation={navigation} />
}

export const routes = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
      // Public pages
      { path: 'login', element: <Login /> },
      { path: 'environment', element: <EnvironmentSelect /> },
      { path: '401', element: <UnauthorisedError /> },
      { path: '403', element: <ForbiddenError /> },
      { path: '404', element: <NotFoundError /> },
      { path: '500', element: <GeneralError /> },
      { path: '503', element: <MaintenanceError /> },
      {
        path: '',
        element: <EnvironmentGate />,
        children: [
          // App routes with SidebarLayout
          {
            path: '',
            element: <SidebarLayout />,
            children: [
              { index: true, element: <Navigate to='/apps' replace /> },
              { path: 'dashboard', element: <Dashboard /> },
              {
                path: 'projects/:projectId/observability',
                element: <AppObservability />,
                children: [
                  { index: true, element: <AppObservabilityIndexRedirect /> },
                  {
                    path: 'traces/dashboard',
                    element: (
                      <ProjectRouteGuard access='project:trace:view'>
                        <TraceDashboard />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'traces/logs',
                    element: (
                      <ProjectRouteGuard access='project:trace:view'>
                        <TraceLogs />
                      </ProjectRouteGuard>
                    ),
                  },
                ],
              },
              {
                path: 'projects/:projectId/evaluation',
                element: <AppEvaluation />,
                children: [
                  { index: true, element: <AppEvaluationIndexRedirect /> },
                  {
                    path: 'datasets',
                    element: (
                      <ProjectRouteGuard access='project:dataset:view'>
                        <ProjectDatasets />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'datasets/:datasetId',
                    element: (
                      <ProjectRouteGuard access='project:dataset:view'>
                        <ProjectDatasetDetail />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'evaluators',
                    element: (
                      <ProjectRouteGuard access='project:evaluator:view'>
                        <TaskEvaluators navigation='project-evaluation' />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'annotation-queues',
                    element: (
                      <ProjectRouteGuard access='project:annotation:view'>
                        <ProjectAnnotationQueues />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'annotation-queues/:queueId',
                    element: (
                      <ProjectRouteGuard access='project:annotation:view'>
                        <ProjectAnnotationQueueDetail />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'annotation-queues/:queueId/batch-annotate',
                    element: (
                      <ProjectRouteGuard access='project:annotation:edit'>
                        <ProjectAnnotationBatch />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'annotation-queues/:queueId/items/:itemId/annotate',
                    element: (
                      <ProjectRouteGuard access='project:annotation:edit'>
                        <ProjectAnnotationItemAnnotate />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'manual-annotations/:queueId/batch',
                    element: (
                      <ProjectRouteGuard access='project:annotation:edit'>
                        <ProjectAnnotationBatch />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'auto-evaluations',
                    element: (
                      <ProjectRouteGuard access='project:auto-evaluation:view'>
                        <ProjectAutoEvaluations />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'auto-evaluations/new',
                    element: (
                      <ProjectRouteGuard access='project:auto-evaluation:edit'>
                        <ProjectAutoEvaluationNew />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'auto-evaluations/:taskId',
                    element: (
                      <ProjectRouteGuard access='project:auto-evaluation:view'>
                        <ProjectAutoEvaluationDetail />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'reports',
                    element: (
                      <ProjectRouteGuard access='project:evaluation-report:view'>
                        <ProjectEvaluationReports />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'reports/:reportId',
                    element: (
                      <ProjectRouteGuard access='project:evaluation-report:view'>
                        <ProjectEvaluationReportDetail />
                      </ProjectRouteGuard>
                    ),
                  },
                ],
              },
              {
                path: 'projects/:projectId/scheduled-jobs',
                element: (
                  <ProjectRouteGuard access='project:scheduled-job:view'>
                    <ScheduledJobs />
                  </ProjectRouteGuard>
                ),
              },
              {
                path: 'projects/:projectId/settings',
                element: <ProjectSettings />,
                children: [
                  { index: true, element: <ProjectSettingsIndexRedirect /> },
                  {
                    path: 'general',
                    element: (
                      <ProjectRouteGuard access='project:settings:view'>
                        <ProjectGeneralSettings />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'score-configs',
                    element: (
                      <ProjectRouteGuard access='project:score-config:view'>
                        <ProjectScoreConfigsSettings />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'members',
                    element: (
                      <ProjectRouteGuard access='project:member:view'>
                        <ProjectMembersSettings />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'models',
                    element: (
                      <ProjectRouteGuard access='project:model:view'>
                        <ProjectModelsSettings />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'api-keys',
                    element: (
                      <ProjectRouteGuard access='project:api-key:view'>
                        <ProjectApiKeysSettings />
                      </ProjectRouteGuard>
                    ),
                  },
                ],
              },
            ],
          },
          {
            path: '',
            element: <AppsTopbarLayout />,
            children: [
              {
                path: 'apps',
                element: (
                  <RouteGuard
                    accessConfig={{
                      accessRules: [
                        {
                          scope: { type: 'org', all: true },
                          access: 'org:project:view',
                        },
                        {
                          scope: { type: 'project', all: true },
                          anyPermission: true,
                        },
                      ],
                    }}
                  >
                    <Apps />
                  </RouteGuard>
                ),
              },
              {
                path: 'audit',
                element: (
                  <RouteGuard
                    accessConfig={{
                      scope: { type: 'system' },
                      access: 'system:audit:view',
                    }}
                  >
                    <OperationAudit />
                  </RouteGuard>
                ),
              },
              {
                path: 'backend',
                element: (
                  <RouteGuard accessConfig={{ superAccess: true }}>
                    <BackendManagement />
                  </RouteGuard>
                ),
                children: [
                  { index: true, element: <Navigate to='overview' replace /> },
                  { path: 'overview', element: <BackendOverview /> },
                  { path: 'users', element: <BackendUsers /> },
                ],
              },
              { path: 'help', element: <HelpDocs /> },
              { path: 'permissions', element: <PermissionRequest /> },
              {
                path: 'settings',
                element: <Settings />,
                children: [
                  { index: true, element: <Navigate to='info' replace /> },
                  {
                    path: 'info',
                    element: (
                      <RouteGuard
                        accessConfig={{
                          scope: { type: 'org' },
                          access: 'org:organization:view',
                        }}
                      >
                        <SettingsOrganizationInfo />
                      </RouteGuard>
                    ),
                  },
                  {
                    path: 'members',
                    element: (
                      <RouteGuard
                        accessConfig={{
                          scope: { type: 'org' },
                          access: ['org:organization:view', 'org:member:view'],
                        }}
                      >
                        <SettingsOrganizationMembers />
                      </RouteGuard>
                    ),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]
