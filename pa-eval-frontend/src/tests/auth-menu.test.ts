import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authMenuActions } from '../lib/auth-menu.ts'

test('authMenuActions exposes logout without a passive href', () => {
  assert.deepEqual(
    authMenuActions.map((action) => ({
      id: action.id,
      label: action.label,
      href: action.href,
    })),
    [
      {
        id: 'logout',
        label: '退出登录',
        href: undefined,
      },
    ]
  )
})
