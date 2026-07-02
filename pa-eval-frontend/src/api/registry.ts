import { layoutApi } from '@/modules/layout/api'
import { organizationApi } from '@/modules/organization-management/api'

export const apiRegistry = {
  ...layoutApi,
  ...organizationApi,
  getPermissions: {
    method: 'GET',
    url: '/permissions',
  },
  getProjects: {
    method: 'GET',
    url: '/projects',
  },
} as const

export type AppApiRegistry = typeof apiRegistry
