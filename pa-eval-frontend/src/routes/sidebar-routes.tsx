import {
  AppEvaluation,
  AppEvaluationIndexRedirect,
} from '@/modules/app-evaluation'
import {
  AppObservability,
  AppObservabilityIndexRedirect,
} from '@/modules/app-observability'
import {
  ProjectSettings,
  ProjectSettingsIndexRedirect,
} from '@/modules/project-settings'
import { Navigate, type RouteObject } from 'react-router'
import { ProjectRouteGuard } from '@/components/common/route-guard'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import {
  Dashboard,
  ExperimentAggregate,
  ExperimentCompare,
  ExperimentReportDetail,
  ProjectAnnotationBatch,
  ProjectAnnotationItemAnnotate,
  ProjectAnnotationQueueDetail,
  ProjectAnnotationQueues,
  ProjectApiKeysSettings,
  ProjectAutoEvaluationDetail,
  ProjectAutoEvaluationNew,
  ProjectAutoEvaluations,
  ProjectDatasetDetail,
  ProjectDatasets,
  ProjectEvaluationReportDetail,
  ProjectEvaluationReports,
  ProjectGeneralSettings,
  ProjectMembersSettings,
  ProjectModelsSettings,
  ProjectScoreConfigsSettings,
  ProjectSceneDetail,
  ProjectScenes,
  ScheduledJobs,
  TaskEvaluators,
  TraceDashboard,
  TraceLogs,
} from './lazy-pages'

export const sidebarRoutes: RouteObject[] = [
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
            path: 'datasets/:datasetId/experiment-reports/:reportId',
            element: (
              <ProjectRouteGuard access='project:dataset:view'>
                <ExperimentReportDetail />
              </ProjectRouteGuard>
            ),
          },
          {
            path: 'datasets/:datasetId/experiments/aggregate',
            element: (
              <ProjectRouteGuard access='project:dataset:view'>
                <ExperimentAggregate />
              </ProjectRouteGuard>
            ),
          },
          {
            path: 'datasets/:datasetId/experiments/compare',
            element: (
              <ProjectRouteGuard access='project:dataset:view'>
                <ExperimentCompare />
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
        path: 'projects/:projectId/scenes',
        element: (
          <ProjectRouteGuard access='project:dataset:view'>
            <ProjectScenes />
          </ProjectRouteGuard>
        ),
      },
      {
        path: 'projects/:projectId/scenes/:sceneId',
        element: (
          <ProjectRouteGuard access='project:dataset:view'>
            <ProjectSceneDetail />
          </ProjectRouteGuard>
        ),
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
]
