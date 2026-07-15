import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('member form loads backend email domain and links name changes to email', () => {
  const apiSource = readFileSync(
    resolve(process.cwd(), 'src/modules/organization-management/api/index.ts'),
    'utf8'
  )
  const drawerSource = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/organization-management/views/members/member-form-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(apiSource, /getOrganizationMemberEmailSettings/)
  assert.match(apiSource, /\/organizations\/member-email-settings/)
  assert.match(drawerSource, /getOrganizationMemberEmailSettings/)
  assert.match(drawerSource, /buildOrganizationMemberEmail/)
  assert.match(drawerSource, /form\.setValue\(\s*'email'/)
})
