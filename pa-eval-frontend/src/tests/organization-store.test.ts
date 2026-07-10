import assert from 'node:assert/strict'
import { test } from 'node:test'
import { useOrganizationStore } from '../stores/organization.store.ts'
import { useSessionStore } from '../stores/session.store.ts'

test('organization store can reset stale organization context', () => {
  useOrganizationStore.getState().setOrganizations([
    {
      id: 'org-mock',
      name: 'Mock 组织',
      description: null,
      subsystem: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ])

  assert.equal(
    useOrganizationStore.getState().currentOrganizationId,
    'org-mock'
  )
  assert.equal(useOrganizationStore.getState().organizations.length, 1)

  useOrganizationStore.getState().resetOrganizations()

  assert.equal(useOrganizationStore.getState().currentOrganizationId, null)
  assert.equal(useOrganizationStore.getState().organizations.length, 0)
  assert.equal(useOrganizationStore.getState().isLoaded, false)
})

test('organization store prefers session organization when initializing context', () => {
  useOrganizationStore.getState().resetOrganizations()
  useSessionStore.getState().setSession({
    user: { name: '项目成员', email: 'member@example.com' },
    superAdmin: false,
    permissions: [],
    orgs: [
      {
        id: 'org-empty',
        name: '空组织',
        role: 'NONE',
        permissions: [],
        projects: [],
      },
      {
        id: 'org-visible',
        name: '可见组织',
        role: 'OWNER',
        permissions: ['org:project:view'],
        projects: [],
      },
    ],
  })

  useOrganizationStore.getState().setOrganizations([
    {
      id: 'org-empty',
      name: '空组织',
      description: null,
      subsystem: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'org-visible',
      name: '可见组织',
      description: null,
      subsystem: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ])

  assert.equal(
    useOrganizationStore.getState().currentOrganizationId,
    'org-visible'
  )
})
