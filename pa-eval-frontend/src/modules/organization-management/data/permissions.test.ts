import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canAssignRole,
  canManageMembers,
  canRemoveMember,
} from './permissions.ts'

test('owner can manage members and assign owner', () => {
  assert.equal(canManageMembers('OWNER'), true)
  assert.equal(canAssignRole('OWNER', 'OWNER'), true)
})

test('admin can manage members but cannot assign owner', () => {
  assert.equal(canManageMembers('ADMIN'), true)
  assert.equal(canAssignRole('ADMIN', 'OWNER'), false)
  assert.equal(canAssignRole('ADMIN', 'MEMBER'), true)
})

test('member and viewer cannot manage members', () => {
  assert.equal(canManageMembers('MEMBER'), false)
  assert.equal(canManageMembers('VIEWER'), false)
})

test('cannot remove owner as admin or the last owner', () => {
  assert.deepEqual(canRemoveMember('ADMIN', 'OWNER', 2), {
    allowed: false,
    reason: 'Admin 不能删除 Owner',
  })

  assert.deepEqual(canRemoveMember('OWNER', 'OWNER', 1), {
    allowed: false,
    reason: '不能删除最后一个 Owner',
  })

  assert.deepEqual(canRemoveMember('OWNER', 'ADMIN', 1), { allowed: true })
})
