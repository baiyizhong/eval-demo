import { Settings } from '@/modules/settings'
import { Navigate, type RouteObject } from 'react-router'
import { RouteGuard } from '@/components/common/route-guard'
import {
  Apps,
  BackendManagement,
  BackendOverview,
  BackendUsers,
  HelpDocs,
  OperationAudit,
  PermissionRequest,
  SettingsOrganizationInfo,
  SettingsOrganizationMembers,
} from './lazy-pages'
import { AppsTopbarLayout } from './topbar-navigation'

export const topbarRoutes: RouteObject[] = [
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
]
