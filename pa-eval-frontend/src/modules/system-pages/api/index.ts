export const systemManagementApi = {
  getAdminOverview: {
    method: 'GET',
    url: '/admin/overview',
  },
  listAuditLogs: {
    method: 'GET',
    url: '/audit-logs',
  },
  listAdminUsers: {
    method: 'GET',
    url: '/admin/users',
  },
  getAdminUserRoleBindings: {
    method: 'GET',
    url: '/admin/users/:userId/role-bindings',
  },
  patchAdminUserAdmin: {
    method: 'PATCH',
    url: '/admin/users/:userId/admin',
  },
} as const
