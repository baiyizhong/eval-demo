import type { SessionState, UserSessionPayload } from '@/types/permission'
import { create } from 'zustand'

function uniquePermissions(permissions: string[]) {
  return Array.from(new Set(permissions))
}

function findProjectOrgId(state: SessionState, projectId: string) {
  return state.orgs.find((org) =>
    org.projects.some((project) => project.id === projectId)
  )?.id
}

function selectInitialOrg(orgs: UserSessionPayload['orgs']) {
  return (
    orgs.find((org) => (org.permissions ?? []).length > 0) ??
    orgs.find((org) =>
      (org.projects ?? []).some((project) => {
        if ('permissions' in project) {
          return (project.permissions ?? []).length > 0
        }

        return (org.permissions ?? []).length > 0
      })
    ) ??
    orgs[0]
  )
}

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  superAdmin: false,
  permissions: [],
  orgs: [],
  currentOrgId: null,
  currentProjectId: null,
  setSession: (payload: UserSessionPayload) => {
    const firstOrg = selectInitialOrg(payload.orgs)
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
  setCurrentOrgId: (currentOrgId) =>
    set((state) => ({
      currentOrgId,
      currentProjectId:
        state.currentOrgId === currentOrgId ? state.currentProjectId : null,
    })),
  setCurrentProjectId: (currentProjectId) =>
    set((state) => ({
      currentOrgId: currentProjectId
        ? (findProjectOrgId(state, currentProjectId) ?? state.currentOrgId)
        : state.currentOrgId,
      currentProjectId,
    })),
  setCurrentProjectContext: (currentProjectId, orgId) =>
    set((state) => ({
      currentOrgId: currentProjectId
        ? (orgId ??
          findProjectOrgId(state, currentProjectId) ??
          state.currentOrgId)
        : (orgId ?? state.currentOrgId),
      currentProjectId,
    })),
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
      if (scope.all) {
        if (state.superAdmin) {
          return ['*']
        }

        return uniquePermissions(
          state.orgs.flatMap((org) => org.permissions ?? [])
        )
      }

      return state.getPermissionsForOrg(scope.orgId)
    }

    if (scope.type === 'project') {
      if (scope.all) {
        if (state.superAdmin) {
          return ['*']
        }

        return uniquePermissions(
          state.orgs.flatMap((org) =>
            (org.projects ?? []).flatMap((project) => {
              if ('permissions' in project) {
                return project.permissions ?? []
              }

              return org.permissions ?? []
            })
          )
        )
      }

      return state.getPermissionsForProject(scope.projectId)
    }

    return state.getSystemPermissions()
  },
}))

export type SessionStore = typeof useSessionStore
