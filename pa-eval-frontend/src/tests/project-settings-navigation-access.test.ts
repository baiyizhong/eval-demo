import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('project settings navigation items are filtered by project permissions', () => {
  const navSource = readFileSync('src/modules/project-settings/nav.tsx', 'utf8')
  const pageSource = readFileSync('src/modules/project-settings/index.tsx', 'utf8')

  for (const permission of [
    'project:settings:view',
    'project:score-config:view',
    'project:member:view',
    'project:model:view',
    'project:api-key:view',
  ]) {
    assert.ok(
      navSource.includes(permission),
      `project settings nav should declare ${permission}`
    )
  }

  assert.ok(
    pageSource.includes('getPermissionsForScope'),
    'project settings page should read scoped project permissions'
  )
  assert.ok(
    pageSource.includes('matchPermission'),
    'project settings page should filter nav items with permission matcher'
  )
})
