import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCurrentOrganizationRole } from '../../modules/organization-management/data/current-organization-role.ts'

test('resolves organization owner role from the session user email', () => {
  const role = resolveCurrentOrganizationRole(
    [
      {
        id: 'mem-1',
        organizationId: 'org-1',
        userId: 'real-owner-user',
        name: 'Owner',
        email: 'owner@example.com',
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    {
      email: 'owner@example.com',
    }
  )

  assert.equal(role, 'OWNER')
})

test('matches organization role with case-insensitive session email', () => {
  const role = resolveCurrentOrganizationRole(
    [
      {
        id: 'mem-2',
        organizationId: 'org-1',
        userId: 'user-from-langfuse',
        name: 'Admin',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    {
      email: 'ADMIN@example.com',
    }
  )

  assert.equal(role, 'ADMIN')
})

test('ignores pending organization invitations when resolving current role', () => {
  const role = resolveCurrentOrganizationRole(
    [
      {
        id: 'invite-1',
        organizationId: 'org-1',
        userId: '',
        name: 'Pending',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'INVITED',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    {
      email: 'admin@example.com',
    }
  )

  assert.equal(role, null)
})
