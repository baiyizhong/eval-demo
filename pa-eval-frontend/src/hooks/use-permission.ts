import { useCallback } from 'react'
import type { PermissionScope } from '@/types/permission'
import { useSessionStore } from '@/stores/session.store'
import { matchPermission } from '@/lib/permission'

export function usePermission(scope?: PermissionScope | string) {
  const getPermissionsForScope = useSessionStore(
    (s) => s.getPermissionsForScope
  )

  const effectiveScope =
    typeof scope === 'string'
      ? { type: 'project' as const, projectId: scope }
      : scope
  const effectiveCodes = getPermissionsForScope(effectiveScope)

  const can = useCallback(
    (code: string) => matchPermission(code, effectiveCodes),
    [effectiveCodes]
  )

  const canAny = useCallback((codes: string[]) => codes.some(can), [can])

  const canAll = useCallback((codes: string[]) => codes.every(can), [can])

  return { can, canAny, canAll, effectiveCodes }
}
