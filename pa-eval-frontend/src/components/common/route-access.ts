import type { PermissionScope } from '@/types/permission'
import { useSessionStore } from '@/stores/session.store'
import { matchPermission } from '@/lib/permission'

export interface RouteAccessConfig {
  access?: string | string[]
  superAccess?: boolean
  scope?: PermissionScope
  projectId?: string
}

export const checkRouteAccess = (config?: RouteAccessConfig): boolean => {
  if (!config) return true

  const { superAdmin } = useSessionStore.getState()
  if (config.superAccess && !superAdmin) return false

  if (config.access) {
    const codes = Array.isArray(config.access) ? config.access : [config.access]
    const scope =
      config.scope ??
      (config.projectId
        ? { type: 'project' as const, projectId: config.projectId }
        : undefined)
    const effectiveCodes = useSessionStore
      .getState()
      .getPermissionsForScope(scope)
    return codes.some((code) => matchPermission(code, effectiveCodes))
  }

  return true
}
