import { BookOpen, LogOut, ShieldCheck } from 'lucide-react'

import { Apps } from '@/modules/apps'
import {
  AppObservability,
  AppObservabilityIndexRedirect,
} from '@/modules/app-observability'
import { TraceDashboard } from '@/modules/app-observability/views/trace-dashboard'
import { TraceLogs } from '@/modules/app-observability/views/trace-logs'
import { Dashboard } from '@/modules/dashboard'
import { ForbiddenError } from '@/modules/errors/forbidden'
import { GeneralError } from '@/modules/errors/general-error'
import { MaintenanceError } from '@/modules/errors/maintenance-error'
import { NotFoundError } from '@/modules/errors/not-found-error'
import { SettingsOrganizationApiKeys } from '@/modules/organization-management/views/api-keys'
import { SettingsOrganizationInfo } from '@/modules/organization-management/views/info'
import { SettingsOrganizationMembers } from '@/modules/organization-management/views/members'
import { OrganizationSwitcher } from '@/modules/organization-management/components/organization-switcher'
import { UnauthorisedError } from '@/modules/errors/unauthorized-error'
import { Tasks } from '@/modules/tasks'
import { TasksAutoEvaluation } from '@/modules/tasks/views/auto-evaluation'
import { RootErrorBoundary } from '@/components/common/error-boundary/root-error-boundary'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { TopbarLayout } from '@/components/layout/topbar-layout'
import {
  type TopNavAction,
  type TopNavProps,
  type TopNavUser,
} from '@/components/layout/top-nav'
import { Settings } from '@/modules/settings'
import { RootLayout } from '@/components/layout/root-layout'
import { Navigate } from 'react-router'

const currentUser: TopNavUser = {
  name: 'PANJIANJIAN065',
  email: 'panjianjian065@example.com',
  initials: 'P',
}

const menuActions: TopNavAction[] = [
  {
    id: 'logout',
    label: '退出登录',
    href: '#',
    icon: LogOut,
    title: '退出登录',
    ariaLabel: '退出登录',
  },
]

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
  user: currentUser,
  menuActions,
}

export const routes = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
      // App routes with SidebarLayout
      {
        path: '',
        element: <SidebarLayout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'tasks', element: <Tasks /> },
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
        ],
      },
      {
        path: '',
        element: <TopbarLayout navigation={appsTopbarNavigation} />,
        children: [
          { path: 'apps', element: <Apps /> },
          {
            path: 'settings',
            element: <Settings />,
            children: [
              { index: true, element: <Navigate to='info' replace /> },
              { path: 'info', element: <SettingsOrganizationInfo /> },
              { path: 'members', element: <SettingsOrganizationMembers /> },
              { path: 'api-keys', element: <SettingsOrganizationApiKeys /> },
            ],
          },
        ],
      },
      // Public error pages
      { path: '401', element: <UnauthorisedError /> },
      { path: '403', element: <ForbiddenError /> },
      { path: '404', element: <NotFoundError /> },
      { path: '500', element: <GeneralError /> },
      { path: '503', element: <MaintenanceError /> },
    ],
  },
]
