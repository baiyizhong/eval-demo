import type { ReactNode } from 'react'
import { usePermission } from '@/hooks/use-permission'
import { usePermissionScope } from './permission-scope-context'

interface CanProps {
  permission: string
  fallback?: ReactNode
  children: ReactNode
}

export function Can({ permission, fallback = null, children }: CanProps) {
  const scope = usePermissionScope()
  const { can } = usePermission(scope)

  return can(permission) ? <>{children}</> : <>{fallback}</>
}
