import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  createOrganizationPayloadSchema,
  normalizeOrganizationOwnerAccount,
} from '../../modules/organization-management/data/schema.ts'

test('create organization payload requires a normalized default owner account', () => {
  assert.equal(normalizeOrganizationOwnerAccount('Owner123'), 'owner123')
  assert.equal(normalizeOrganizationOwnerAccount('Owner-中文_123'), 'owner123')

  assert.equal(
    createOrganizationPayloadSchema.safeParse({
      name: '新组织',
      subsystem: 'model-eval',
      description: '模型评测组织',
      defaultOwnerAccount: 'owner123',
    }).success,
    true
  )

  assert.equal(
    createOrganizationPayloadSchema.safeParse({
      name: '新组织',
      subsystem: 'model-eval',
      defaultOwnerAccount: 'owner_123',
    }).success,
    false
  )
})

test('create organization drawer exposes default owner account field', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/organization-management/components/create-organization-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(source, /name='defaultOwnerAccount'/)
  assert.match(source, /默认 Owner 登录账号/)
  assert.match(source, /normalizeOrganizationOwnerAccount/)
})
