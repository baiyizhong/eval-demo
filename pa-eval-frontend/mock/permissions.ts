import { db } from './_data.ts'
import { success } from './_utils.ts'

export default [
  {
    url: '/api/permissions',
    method: 'get',
    response: () =>
      success({
        user: {
          id: 1,
          name: db.users[0].name,
        },
        superAdmin: true,
        orgs: db.organizations.map((org) => ({
          id: org.id,
          name: org.name,
          permissions: ['organization:read', 'organization:write'],
          projects: db.projects
            .filter((project) => project.organizationId === org.id)
            .map((project) => ({
              id: project.id,
              name: project.name,
              permissions: ['project:read', 'project:write'],
            })),
        })),
      }),
  },
]
