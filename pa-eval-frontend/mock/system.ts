import { db } from './_data.ts'
import { paginate, success } from './_utils.ts'

export default [
  {
    url: '/api/admin/overview',
    method: 'get',
    response: () =>
      success({
        service: { name: 'PA Eval Backend', status: 'healthy' },
        database: { configured: true, connected: true },
        metrics: {
          organizations: db.organizations.length,
          projects: db.projects.length,
          activeProjects: db.projects.filter(
            (project: any) => project.status !== 'archived'
          ).length,
          archivedProjects: db.projects.filter(
            (project: any) => project.status === 'archived'
          ).length,
          users: db.users.length,
          auditLogs: 2,
        },
      }),
  },
  {
    url: '/api/admin/users',
    method: 'get',
    response: ({ query }: any) => {
      const keyword = String(query?.keyword ?? '').toLowerCase()
      const adminFilter =
        query?.admin === undefined || query?.admin === ''
          ? undefined
          : query.admin === true || query.admin === 'true'
      const users = db.users
        .map((user: any, index: number) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          admin: index === 0,
          createdAt: user.createdAt ?? '2026-07-08T08:00:00.000Z',
          updatedAt: user.updatedAt ?? '2026-07-08T08:00:00.000Z',
        }))
        .filter((user: any) =>
          keyword
            ? [user.id, user.name, user.email]
                .join(' ')
                .toLowerCase()
                .includes(keyword)
            : true
        )
        .filter((user: any) =>
          adminFilter === undefined ? true : user.admin === adminFilter
        )

      return success(paginate(users, query, 20))
    },
  },
  {
    url: '/api/admin/users/:userId/role-bindings',
    method: 'get',
    response: ({ query }: any) => {
      const user =
        db.users.find((item: any) => item.id === query?.userId) ?? db.users[0]

      return success({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          admin: user.id === db.users[0].id,
          createdAt: user.createdAt ?? '2026-07-08T08:00:00.000Z',
          updatedAt: user.updatedAt ?? '2026-07-08T08:00:00.000Z',
        },
        organizations: db.organizations.map((organization: any) => ({
          id: organization.id,
          name: organization.name,
          role: user.id === db.users[0].id ? 'OWNER' : 'MEMBER',
        })),
        projects: db.projects.map((project: any) => ({
          id: project.id,
          name: project.name,
          organizationId: project.organizationId,
          organizationName: project.organizationName,
          organizationRole: user.id === db.users[0].id ? 'OWNER' : 'MEMBER',
          projectRole: user.id === db.users[0].id ? 'OWNER' : 'VIEWER',
          effectiveRole: user.id === db.users[0].id ? 'OWNER' : 'VIEWER',
        })),
      })
    },
  },
  {
    url: '/api/admin/users/:userId/admin',
    method: 'patch',
    response: ({ query, body }: any) =>
      success({
        id: query?.userId,
        admin: Boolean(body?.admin),
      }),
  },
  {
    url: '/api/audit-logs',
    method: 'get',
    response: ({ query }: any) =>
      success(
        paginate(
          [
            {
              id: 'audit_001',
              action: 'mock.project.create',
              resourceType: 'project',
              resourceId: 'proj_a',
              actor: db.users[0].email,
              createdAt: '2026-07-08T08:00:00.000Z',
              detail: { mode: 'mock' },
            },
            {
              id: 'audit_002',
              action: 'mock.evaluation.run',
              resourceType: 'auto_evaluation',
              resourceId: 'auto_eval_001',
              actor: db.users[0].email,
              createdAt: '2026-07-08T08:05:00.000Z',
              detail: { mode: 'mock' },
            },
          ],
          query,
          20
        )
      ),
  },
]
