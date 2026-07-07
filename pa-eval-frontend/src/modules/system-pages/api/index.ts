export const systemManagementApi = {
  getAdminOverview: {
    method: 'GET',
    url: '/admin/overview',
  },
  listAuditLogs: {
    method: 'GET',
    url: '/audit-logs',
  },
} as const
