import type { ReactNode } from 'react'
import { usePermission } from '@/hooks/use-permission'
import { usePermissionScope } from './permission-scope'

interface CanProps {
  permission: string
  fallback?: ReactNode
  children: ReactNode
}

export function Can({ permission, fallback = null, children }: CanProps) {
  const { projectId } = usePermissionScope()
  const { can } = usePermission(projectId)

  return can(permission) ? <>{children}</> : <>{fallback}</>
}
