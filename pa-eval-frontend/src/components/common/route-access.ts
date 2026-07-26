import type { PermissionAccessRule, PermissionScope } from '@/types/permission'
import { useSessionStore } from '@/stores/session.store'
import { matchPermission } from '@/lib/permission'

export interface RouteAccessConfig {
  access?: string | string[]
  accessRules?: PermissionAccessRule[]
  superAccess?: boolean
  scope?: PermissionScope
  projectId?: string
}

export function checkPermissionAccessRule(rule: PermissionAccessRule): boolean {
  const effectiveCodes = useSessionStore
    .getState()
    .getPermissionsForScope(rule.scope)

  if (rule.anyPermission && effectiveCodes.length > 0) {
    return true
  }

  if (!rule.access) {
    return false
  }

  const codes = Array.isArray(rule.access) ? rule.access : [rule.access]
  return codes.some((code) => matchPermission(code, effectiveCodes))
}

export const checkRouteAccess = (config?: RouteAccessConfig): boolean => {
  if (!config) return true

  const { superAdmin } = useSessionStore.getState()
  if (config.superAccess && !superAdmin) return false

  if (config.accessRules?.length) {
    return config.accessRules.some((rule) => checkPermissionAccessRule(rule))
  }

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
