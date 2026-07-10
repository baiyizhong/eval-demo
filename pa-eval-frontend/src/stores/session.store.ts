import type { SessionState, UserSessionPayload } from '@/types/permission'
import { create } from 'zustand'

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  superAdmin: false,
  permissions: [],
  orgs: [],
  currentOrgId: null,
  currentProjectId: null,
  setSession: (payload: UserSessionPayload) => {
    const firstOrg = payload.orgs[0]
    const firstProject = firstOrg?.projects[0]

    set({
      user: payload.user,
      superAdmin: payload.superAdmin,
      permissions: payload.permissions ?? [],
      orgs: payload.orgs,
      currentOrgId: firstOrg?.id ?? null,
      currentProjectId: firstProject?.id ?? null,
    })
  },
  setCurrentOrgId: (currentOrgId) => set({ currentOrgId }),
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),
  getPermissionsForOrg: (orgId?: string) => {
    const { superAdmin, orgs, currentOrgId } = get()

    if (superAdmin) {
      return ['*']
    }

    const effectiveOrgId = orgId ?? currentOrgId ?? undefined

    if (!effectiveOrgId || !orgs || !Array.isArray(orgs)) {
      return []
    }

    return orgs.find((org) => org.id === effectiveOrgId)?.permissions ?? []
  },
  getPermissionsForProject: (projectId?: string) => {
    const { superAdmin, orgs, currentProjectId } = get()

    if (superAdmin) {
      return ['*']
    }

    const effectiveProjectId = projectId ?? currentProjectId ?? undefined

    if (!effectiveProjectId || !orgs || !Array.isArray(orgs)) {
      return []
    }

    for (const org of orgs) {
      const project = org.projects?.find(
        (item) => item.id === effectiveProjectId
      )
      if (project) {
        if ('permissions' in project) {
          return project.permissions ?? []
        }
        return org.permissions
      }
    }

    return []
  },
  getSystemPermissions: () => {
    const { superAdmin, permissions } = get()

    if (superAdmin) {
      return ['*']
    }

    return permissions
  },
  getPermissionsForScope: (scope) => {
    if (!scope) {
      return []
    }

    const state = get()

    if (scope.type === 'org') {
      return state.getPermissionsForOrg(scope.orgId)
    }

    if (scope.type === 'project') {
      return state.getPermissionsForProject(scope.projectId)
    }

    return state.getSystemPermissions()
  },
}))

export type SessionStore = typeof useSessionStore
