import { useMemo } from 'react'
import {
  AppEvaluation,
  AppEvaluationIndexRedirect,
} from '@/modules/app-evaluation'
import { ProjectAnnotationItemAnnotate } from '@/modules/app-evaluation/views/annotation-item-annotate'
import { ProjectAnnotationQueueDetail } from '@/modules/app-evaluation/views/annotation-queue-detail'
import { ProjectAnnotationQueues } from '@/modules/app-evaluation/views/annotation-queues'
import { ProjectAutoEvaluationDetail } from '@/modules/app-evaluation/views/auto-evaluation-detail'
import { ProjectAutoEvaluationNew } from '@/modules/app-evaluation/views/auto-evaluation-new'
import { ProjectAutoEvaluations } from '@/modules/app-evaluation/views/auto-evaluations'
import { ProjectDatasetDetail } from '@/modules/app-evaluation/views/dataset-detail'
import { ProjectDatasets } from '@/modules/app-evaluation/views/datasets'
import { ProjectEvaluationReportDetail } from '@/modules/app-evaluation/views/evaluation-report-detail'
import { ProjectEvaluationReports } from '@/modules/app-evaluation/views/evaluation-reports'
import { ProjectScenarioEvaluations } from '@/modules/app-evaluation/views/scenario-evaluations'
import {
  AppObservability,
  AppObservabilityIndexRedirect,
} from '@/modules/app-observability'
import { TraceDashboard } from '@/modules/app-observability/views/trace-dashboard'
import { TraceLogs } from '@/modules/app-observability/views/trace-logs'
import { Apps } from '@/modules/apps'
import { Dashboard } from '@/modules/dashboard'
import { EnvironmentSelect } from '@/modules/environment'
import { EnvironmentGate } from '@/modules/environment/environment-gate'
import { ForbiddenError } from '@/modules/errors/forbidden'
import { GeneralError } from '@/modules/errors/general-error'
import { MaintenanceError } from '@/modules/errors/maintenance-error'
import { NotFoundError } from '@/modules/errors/not-found-error'
import { UnauthorisedError } from '@/modules/errors/unauthorized-error'
import { Login } from '@/modules/pa-eval-login'
import { OrganizationSwitcher } from '@/modules/organization-management/components/organization-switcher'
import { SettingsOrganizationInfo } from '@/modules/organization-management/views/info'
import { SettingsOrganizationMembers } from '@/modules/organization-management/views/members'
import {
  ProjectSettings,
  ProjectSettingsIndexRedirect,
} from '@/modules/project-settings'
import { ProjectApiKeysSettings } from '@/modules/project-settings/views/api-keys'
import { ProjectGeneralSettings } from '@/modules/project-settings/views/general'
import { ProjectMembersSettings } from '@/modules/project-settings/views/members'
import { ProjectModelsSettings } from '@/modules/project-settings/views/models'
import { ProjectScoreConfigsSettings } from '@/modules/project-settings/views/score-configs'
import { Settings } from '@/modules/settings'
import { Tasks } from '@/modules/tasks'
import { TasksAutoEvaluation } from '@/modules/tasks/views/auto-evaluation'
import { TaskEvaluators } from '@/modules/tasks/views/evaluators'
import { BookOpen, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router'
import { useAuthProfileMenu } from '@/hooks/use-auth-profile-menu'
import { RootErrorBoundary } from '@/components/common/error-boundary/root-error-boundary'
import { RootLayout } from '@/components/layout/root-layout'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { type TopNavProps } from '@/components/layout/top-nav'
import { TopbarLayout } from '@/components/layout/topbar-layout'

const appsTopbarNavigation: TopNavProps = {
  brand: {
    name: '智能评测系统',
    initial: 'A',
    href: '/',
    ariaLabel: 'Go to dashboard',
  },
  items: [
    { id: 'apps', label: '项目管理', href: '/apps', activeMatch: 'prefix' },
    {
      id: 'org',
      label: '组织管理',
      href: '/settings',
      activeMatch: 'prefix',
    },
    {
      id: 'audit',
      label: '操作审计',
      href: '/',
      activeMatch: 'prefix',
    },
    {
      id: 'backend',
      label: '后台管理',
      href: '/backend',
      activeMatch: 'prefix',
    },
  ],
  inlineActions: [
    {
      id: 'help',
      label: '帮助文档',
      href: '/dashboard',
      icon: BookOpen,
      title: '帮助文档',
      ariaLabel: '帮助文档',
    },
    {
      id: 'permissions',
      label: '申请权限',
      href: '#',
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
              { index: true, element: <Dashboard /> },
              { path: 'dashboard', element: <Dashboard /> },
              { path: 'tasks', element: <Tasks /> },
              { path: 'tasks/evaluators', element: <TaskEvaluators /> },
              {
                path: 'tasks/auto-evaluation',
                element: <TasksAutoEvaluation />,
              },
              {
                path: 'projects/:projectId/observability',
                element: <AppObservability />,
                children: [
                  { index: true, element: <AppObservabilityIndexRedirect /> },
                  { path: 'traces/dashboard', element: <TraceDashboard /> },
                  { path: 'traces/logs', element: <TraceLogs /> },
                ],
              },
              {
                path: 'projects/:projectId/evaluation',
                element: <AppEvaluation />,
                children: [
                  { index: true, element: <AppEvaluationIndexRedirect /> },
                  { path: 'datasets', element: <ProjectDatasets /> },
                  {
                    path: 'datasets/:datasetId',
                    element: <ProjectDatasetDetail />,
                  },
                  {
                    path: 'evaluators',
                    element: <TaskEvaluators navigation='project-evaluation' />,
                  },
                  {
                    path: 'annotation-queues',
                    element: <ProjectAnnotationQueues />,
                  },
                  {
                    path: 'annotation-queues/:queueId',
                    element: <ProjectAnnotationQueueDetail />,
                  },
                  {
                    path: 'annotation-queues/:queueId/items/:itemId/annotate',
                    element: <ProjectAnnotationItemAnnotate />,
                  },
                  {
                    path: 'scenario-evaluations',
                    element: (
                      <ProjectRouteGuard access='project:auto-evaluation:view'>
                        <ProjectScenarioEvaluations />
                      </ProjectRouteGuard>
                    ),
                  },
                  {
                    path: 'auto-evaluations',
                    element: <ProjectAutoEvaluations />,
                  },
                  {
                    path: 'auto-evaluations/new',
                    element: <ProjectAutoEvaluationNew />,
                  },
                  {
                    path: 'auto-evaluations/:taskId',
                    element: <ProjectAutoEvaluationDetail />,
                  },
                  { path: 'reports', element: <ProjectEvaluationReports /> },
                  {
                    path: 'reports/:reportId',
                    element: <ProjectEvaluationReportDetail />,
                  },
                ],
              },
              {
                path: 'projects/:projectId/settings',
                element: <ProjectSettings />,
                children: [
                  { index: true, element: <ProjectSettingsIndexRedirect /> },
                  { path: 'general', element: <ProjectGeneralSettings /> },
                  {
                    path: 'score-configs',
                    element: <ProjectScoreConfigsSettings />,
                  },
                  { path: 'members', element: <ProjectMembersSettings /> },
                  { path: 'models', element: <ProjectModelsSettings /> },
                  { path: 'api-keys', element: <ProjectApiKeysSettings /> },
                ],
              },
            ],
          },
          {
            path: '',
            element: <AppsTopbarLayout />,
            children: [
              { path: 'apps', element: <Apps /> },
              {
                path: 'settings',
                element: <Settings />,
                children: [
                  { index: true, element: <Navigate to='info' replace /> },
                  { path: 'info', element: <SettingsOrganizationInfo /> },
                  { path: 'members', element: <SettingsOrganizationMembers /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]
