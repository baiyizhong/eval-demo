import { db } from './_data.ts'
import {
  body,
  id,
  keywordIncludes,
  nowIso,
  paginate,
  pathParam,
  success,
} from './_utils.ts'

const withProjects = (org: any) => ({
  ...org,
  projects: db.projects.filter((project) => project.organizationId === org.id),
})

export default [
  {
    url: '/api/organizations/:organizationId/members/import',
    method: 'post',
    response: (req: any) =>
      success({
        organizationId: pathParam(req, 'organizationId'),
        successCount: 1,
        failureCount: 0,
        failures: [],
      }),
  },
  {
    url: '/api/organizations/:organizationId/members/:memberId',
    method: 'patch',
    response: (req: any) => {
      const input = body(req)
      return success({
        id: pathParam(req, 'memberId'),
        organizationId: pathParam(req, 'organizationId'),
        email: input.email ?? 'member@example.com',
        role: input.role ?? 'MEMBER',
        updatedAt: nowIso(),
      })
    },
  },
  {
    url: '/api/organizations/:organizationId/members/:memberId',
    method: 'delete',
    response: (req: any) => success({ id: pathParam(req, 'memberId') }),
  },
  {
    url: '/api/organizations/:organizationId/members',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.users
            .filter((user) => keywordIncludes(user, req.query?.keyword))
            .map((user) => ({
              id: user.id,
              userId: user.id,
              organizationId: pathParam(req, 'organizationId'),
              name: user.name,
              email: user.email,
              role: user.role,
              createdAt: '2026-07-08T08:00:00.000Z',
              updatedAt: '2026-07-08T08:00:00.000Z',
            })),
          req.query,
          10
        )
      ),
  },
  {
    url: '/api/organizations/:organizationId/members',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      return success({
        id: id('org_member'),
        organizationId: pathParam(req, 'organizationId'),
        name: input.name ?? input.email,
        email: input.email,
        role: input.role ?? 'MEMBER',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
    },
  },
  {
    url: '/api/organizations/:organizationId',
    method: 'get',
    response: (req: any) => {
      const org =
        db.organizations.find((item) => item.id === pathParam(req, 'organizationId')) ??
        db.organizations[0]
      return success(withProjects(org))
    },
  },
  {
    url: '/api/organizations/:organizationId',
    method: 'patch',
    response: (req: any) => {
      const input = body(req)
      const index = db.organizations.findIndex(
        (item) => item.id === pathParam(req, 'organizationId')
      )
      if (index >= 0) {
        db.organizations[index] = {
          ...db.organizations[index],
          ...input,
          metadata: {
            ...db.organizations[index].metadata,
            subsystem: input.subsystem ?? db.organizations[index].subsystem,
          },
          updatedAt: nowIso(),
        }
      }
      return success(withProjects(db.organizations[index] ?? db.organizations[0]))
    },
  },
  {
    url: '/api/organizations',
    method: 'get',
    response: ({ query }: any) =>
      success(
        paginate(
          db.organizations
            .filter((org) => keywordIncludes(org, query?.keyword))
            .map(withProjects),
          query,
          10
        )
      ),
  },
  {
    url: '/api/organizations',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const org = {
        id: id('org'),
        name: input.name,
        subsystem: input.subsystem ?? 'pa-eval',
        description: input.description ?? '',
        metadata: { subsystem: input.subsystem ?? 'pa-eval' },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.organizations.unshift(org)
      return success(withProjects(org))
    },
  },
]
