import { layoutApi } from '@/modules/layout/api'

export const apiRegistry = {
  ...layoutApi,
  getPermissions: {
    method: 'GET',
    url: '/permissions',
  },
} as const

export type AppApiRegistry = typeof apiRegistry
