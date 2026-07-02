import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { usePermissionStore } from '@/stores/permission.store'
import { matchPermission } from '@/lib/permission'

export interface RouteAccessConfig {
  access?: string | string[]
  superAccess?: boolean
  projectId?: string
}

const checkRouteAccess = (config?: RouteAccessConfig): boolean => {
  if (!config) return true

  const { superAdmin } = usePermissionStore.getState()
  if (config.superAccess && !superAdmin) return false

  if (config.access) {
    const codes = Array.isArray(config.access) ? config.access : [config.access]
    const effectiveCodes = usePermissionStore
      .getState()
      .getPermissionsForProject(config.projectId ?? '')
    return codes.some((code) => matchPermission(code, effectiveCodes))
  }

  return true
}

export function RouteGuard({
  children,
  accessConfig,
}: {
  children: ReactNode
  accessConfig?: RouteAccessConfig
}) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!checkRouteAccess(accessConfig)) {
      navigate('/403', { replace: true })
    }
  }, [accessConfig, navigate])

  if (!checkRouteAccess(accessConfig)) return null
  return <>{children}</>
}

export { checkRouteAccess }
