import { type ReactNode } from 'react'
import type { PermissionScope } from '@/types/permission'
import { PermissionScopeContext } from './permission-scope-context'

interface PermissionScopeProviderProps {
  scope?: PermissionScope
  projectId?: string
  children: ReactNode
}

export function PermissionScopeProvider({
  scope,
  projectId,
  children,
}: PermissionScopeProviderProps) {
  const effectiveScope =
    scope ?? (projectId ? { type: 'project' as const, projectId } : undefined)

  return (
    <PermissionScopeContext.Provider value={effectiveScope}>
      {children}
    </PermissionScopeContext.Provider>
  )
}
