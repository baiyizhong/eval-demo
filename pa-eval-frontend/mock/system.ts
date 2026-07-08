import { db } from './_data.ts'
import { paginate, success } from './_utils.ts'

export default [
  {
    url: '/api/sidebar',
    method: 'get',
    response: () =>
      success({
        user: {
          name: db.users[0].name,
          email: db.users[0].email,
          avatar: db.users[0].avatar,
        },
        teams: [{ name: 'PA Eval', logo: 'Command', plan: 'Mock' }],
        menuGroups: [
          {
            title: '工作台',
            items: [
              {
                title: '项目管理',
                url: '/apps',
                activeMatch: 'prefix',
                icon: 'Boxes',
              },
              {
                title: '组织管理',
                url: '/settings/info',
                activeMatch: 'prefix',
                icon: 'Building2',
              },
            ],
          },
        ],
      }),
  },
  {
    url: '/api/admin/overview',
    method: 'get',
    response: () =>
      success({
        organizations: db.organizations.length,
        projects: db.projects.length,
        users: db.users.length,
        evaluators: db.evaluators.length,
        traces: db.traces.length,
        auditLogs: 2,
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
