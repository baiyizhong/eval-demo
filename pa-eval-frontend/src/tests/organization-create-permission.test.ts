import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldShowCreateOrganization } from '../modules/organization-management/data/create-permission.ts'

test('create organization entry is visible only for super admins', () => {
  assert.equal(shouldShowCreateOrganization(true), true)
  assert.equal(shouldShowCreateOrganization(false), false)
})
