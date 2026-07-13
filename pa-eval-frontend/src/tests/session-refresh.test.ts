import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRouteAccess } from '../components/common/route-access.ts'
import { refreshSessionStore } from '../lib/session-refresh.ts'
import { useSessionStore } from '../stores/session.store.ts'
import type { UserSessionPayload } from '../types/permission.ts'

const staleSession: UserSessionPayload = {
  user: { name: '项目管理员', email: 'admin@example.com' },
  superAdmin: false,
  permissions: [],
  orgs: [
    {
      id: 'org-1',
      name: '组织一',
      role: 'OWNER',
      permissions: ['org:project:view', 'org:project:edit'],
      projects: [],
    },
  ],
}

const refreshedSession: UserSessionPayload = {
  ...staleSession,
  orgs: [
    {
      ...staleSession.orgs[0],
      projects: [
        {
          id: 'project-new',
          name: '新项目',
          role: 'OWNER',
          permissions: ['project:trace:view'],
        },
      ],
    },
  ],
}

const refreshedOrganizationSession: UserSessionPayload = {
  ...staleSession,
  orgs: [
    ...staleSession.orgs,
    {
      id: 'org-new',
      name: '新组织',
      role: 'OWNER',
      permissions: ['org:organization:view', 'org:member:view'],
      projects: [],
    },
  ],
}

test('refreshSessionStore updates project permissions after project creation', async () => {
  useSessionStore.getState().setSession(staleSession)

  assert.equal(
    checkRouteAccess({
      scope: { type: 'project', projectId: 'project-new' },
      access: 'project:trace:view',
    }),
    false
  )

  await refreshSessionStore({
    getSession: async <TResponse = unknown>() =>
      refreshedSession as TResponse,
  })

  assert.equal(
    checkRouteAccess({
      scope: { type: 'project', projectId: 'project-new' },
      access: 'project:trace:view',
    }),
    true
  )
})

test('refreshSessionStore updates org permissions after organization creation', async () => {
  useSessionStore.getState().setSession(staleSession)

  assert.equal(
    checkRouteAccess({
      scope: { type: 'org', orgId: 'org-new' },
      access: 'org:organization:view',
    }),
    false
  )

  await refreshSessionStore({
    getSession: async <TResponse = unknown>() =>
      refreshedOrganizationSession as TResponse,
  })

  assert.equal(
    checkRouteAccess({
      scope: { type: 'org', orgId: 'org-new' },
      access: 'org:organization:view',
    }),
    true
  )
})
