import { createContext, useContext, type ReactNode } from 'react'

interface PermissionScopeContextValue {
  projectId?: string
}

const PermissionScopeContext = createContext<PermissionScopeContextValue>({})

interface PermissionScopeProviderProps {
  projectId?: string
  children: ReactNode
}

export function PermissionScopeProvider({
  projectId,
  children,
}: PermissionScopeProviderProps) {
  return (
    <PermissionScopeContext.Provider value={{ projectId }}>
      {children}
    </PermissionScopeContext.Provider>
  )
}

export function usePermissionScope() {
  return useContext(PermissionScopeContext)
}
