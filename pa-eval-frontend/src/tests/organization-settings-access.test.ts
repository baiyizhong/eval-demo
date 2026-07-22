import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('organization members route is visible with organization view permission', () => {
  const source = readFileSync('src/routes/topbar-routes.tsx', 'utf8')
  const membersRoute = source.match(
    /path: 'members'[\s\S]*?<SettingsOrganizationMembers \/>[\s\S]*?<\/RouteGuard>/
  )?.[0]

  assert.ok(membersRoute, 'settings members route should exist')
  assert.ok(
    membersRoute.includes(
      "access: ['org:organization:view', 'org:member:view']"
    ),
    'settings members route should allow org:organization:view for read-only access'
  )
})
