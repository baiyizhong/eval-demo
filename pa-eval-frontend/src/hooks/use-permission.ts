import { useCallback } from 'react'
import { usePermissionStore } from '@/stores/permission.store'
import { matchPermission } from '@/lib/permission'

export function usePermission(projectId?: string) {
  const getPermissionsForProject = usePermissionStore(
    (s) => s.getPermissionsForProject
  )

  const effectiveCodes = projectId ? getPermissionsForProject(projectId) : []

  const can = useCallback(
    (code: string) => matchPermission(code, effectiveCodes),
    [effectiveCodes]
  )

  const canAny = useCallback((codes: string[]) => codes.some(can), [can])

  const canAll = useCallback((codes: string[]) => codes.every(can), [can])

  return { can, canAny, canAll, effectiveCodes }
}
