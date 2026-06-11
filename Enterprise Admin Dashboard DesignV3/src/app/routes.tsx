import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { ProjectList } from './pages/ProjectList';
import { TraceLogs } from './pages/TraceLogs';
import { EvaluationTasks } from './pages/EvaluationTasks';
import { LLMJudge } from './pages/LLMJudge';
import { HumanAnnotation } from './pages/HumanAnnotation';
import { Datasets } from './pages/Datasets';
import { Evaluators } from './pages/Evaluators';
import { Settings } from './pages/Settings';
import { TenantManagement } from './pages/TenantManagement';
import { UserManagement } from './pages/UserManagement';
import { SystemSettings } from './pages/SystemSettings';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: ProjectList },
      { path: 'system/tenants', Component: TenantManagement },
      { path: 'system/users', Component: UserManagement },
      { path: 'system/settings', Component: SystemSettings },
      { path: 'project/:projectId/traces', Component: TraceLogs },
      { path: 'project/:projectId/evaluations', Component: EvaluationTasks },
      { path: 'project/:projectId/evaluations/judge', Component: LLMJudge },
      { path: 'project/:projectId/evaluations/annotation', Component: HumanAnnotation },
      { path: 'project/:projectId/evaluations/datasets', Component: Datasets },
      { path: 'project/:projectId/evaluators', Component: Evaluators },
      { path: 'project/:projectId/settings', Component: Settings },
      { path: 'project/:projectId', element: <Navigate to="traces" replace /> },
    ],
  },
]);
