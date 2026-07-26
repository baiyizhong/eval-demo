import { EnvironmentSelect } from '@/modules/environment'
import { EnvironmentGate } from '@/modules/environment/environment-gate'
import { ForbiddenError } from '@/modules/errors/forbidden'
import { GeneralError } from '@/modules/errors/general-error'
import { MaintenanceError } from '@/modules/errors/maintenance-error'
import { NotFoundError } from '@/modules/errors/not-found-error'
import { UnauthorisedError } from '@/modules/errors/unauthorized-error'
import { Login } from '@/modules/pa-eval-login'
import type { RouteObject } from 'react-router'
import { RootErrorBoundary } from '@/components/common/error-boundary/root-error-boundary'
import { RootLayout } from '@/components/layout/root-layout'
import { sidebarRoutes } from './sidebar-routes'
import { topbarRoutes } from './topbar-routes'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
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
        children: [...sidebarRoutes, ...topbarRoutes],
      },
    ],
  },
]
