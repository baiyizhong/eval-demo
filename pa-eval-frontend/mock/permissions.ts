const mockPermissions = {
  user: {
    id: 1,
    name: '测试用户',
  },
  superAdmin: true,
  orgs: [
    {
      id: 'org-001',
      name: '默认组织',
      permissions: ['user:read', 'user:write'],
      projects: [
        { id: 'proj-a', name: '项目 A', permissions: ['example:write'] },
        { id: 'proj-b', name: '项目 B', permissions: [] },
      ],
    },
  ],
}

export default [
  {
    url: '/api/permissions',
    method: 'get',
    response: () => ({
      code: 0,
      data: mockPermissions,
    }),
  },
]
