import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getRouteActiveState, isRouteActive } from './nav.ts'

test('exact match only activates the same pathname', () => {
  assert.equal(isRouteActive('/settings/account', '/settings/account'), true)
  assert.equal(
    isRouteActive('/settings/account/profile', '/settings/account'),
    false
  )
})

test('prefix match activates nested pathnames', () => {
  assert.equal(isRouteActive('/settings', '/settings', 'prefix'), true)
  assert.equal(isRouteActive('/settings/account', '/settings', 'prefix'), true)
})

test('prefix match respects path segment boundaries', () => {
  assert.equal(isRouteActive('/settings-other', '/settings', 'prefix'), false)
})

test('route active state uses prefix matching for parent topbar items', () => {
  assert.equal(
    getRouteActiveState('/settings/account', {
      href: '/settings',
      activeMatch: 'prefix',
    }),
    true
  )
})
