import { createContext, useContext } from 'react'
import type { PermissionScope } from '@/types/permission'

export const PermissionScopeContext = createContext<
  PermissionScope | undefined
>(undefined)

export function usePermissionScope() {
  return useContext(PermissionScopeContext)
}
