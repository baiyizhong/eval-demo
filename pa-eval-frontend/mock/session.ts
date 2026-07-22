import { db } from './_data.ts'
import { success } from './_utils.ts'

export default [
  {
    url: '/api/user/session',
    method: 'get',
    response: () =>
      success({
        user: {
          id: 1,
          name: db.users[0].name,
          email: db.users[0].email,
        },
        superAdmin: true,
        permissions: [],
        orgs: db.organizations.map((org) => ({
          id: org.id,
          name: org.name,
          permissions: [
            'org:project:view',
            'org:project:edit',
            'org:organization:view',
            'org:organization:edit',
            'org:member:view',
            'org:member:edit',
          ],
          projects: db.projects
            .filter((project) => project.organizationId === org.id)
            .map((project) => ({
              id: project.id,
              name: project.name,
              permissions: [
                'project:trace:view',
                'project:trace:edit',
                'project:dataset:view',
                'project:dataset:edit',
                'project:evaluator:view',
                'project:evaluator:edit',
                'project:annotation:view',
                'project:annotation:edit',
                'project:auto-evaluation:view',
                'project:auto-evaluation:edit',
                'project:evaluation-report:view',
                'project:evaluation-report:edit',
                'project:scheduled-job:view',
                'project:scheduled-job:edit',
                'project:settings:view',
                'project:settings:edit',
                'project:score-config:view',
                'project:score-config:edit',
                'project:member:view',
                'project:member:edit',
                'project:model:view',
                'project:model:edit',
                'project:api-key:view',
                'project:api-key:edit',
              ],
            })),
        })),
      }),
  },
]
