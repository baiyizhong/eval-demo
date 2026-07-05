import { getEnvironmentRedirectPath } from '@/modules/environment/environment-routing'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useEnvironmentStore } from '@/stores/environment-store'

export function EnvironmentGate() {
  const { pathname } = useLocation()
  const accessToken = useAuthStore((state) => state.auth.accessToken)
  const environmentCode = useEnvironmentStore((state) => state.environmentCode)
  const redirectPath = accessToken
    ? getEnvironmentRedirectPath(pathname, environmentCode)
    : null

  if (redirectPath) {
    return <Navigate to={redirectPath} replace />
  }

  return <Outlet />
}
