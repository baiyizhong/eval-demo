import type { PermissionState, UserPermissionPayload } from '@/types/permission'
import { create } from 'zustand'

export const usePermissionStore = create<PermissionState>((set, get) => ({
  user: null,
  superAdmin: false,
  orgs: [],
  setPermissions: (payload: UserPermissionPayload) => {
    set({
      user: payload.user,
      superAdmin: payload.superAdmin,
      orgs: payload.orgs,
    })
  },
  getPermissionsForProject: (projectId: string) => {
    const { superAdmin, orgs } = get()

    if (superAdmin) {
      return ['*']
    }

    if (!orgs || !Array.isArray(orgs)) {
      return []
    }

    for (const org of orgs) {
      const project = org.projects.find((item) => item.id === projectId)
      if (project) {
        if ('permissions' in project) {
          return project.permissions ?? []
        }
        return org.permissions
      }
    }

    return []
  },
}))

export type PermissionStore = typeof usePermissionStore
