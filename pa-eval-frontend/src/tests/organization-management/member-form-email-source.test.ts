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

test('member form prevents adding an existing organization member email', () => {
  const membersSource = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/organization-management/views/members/index.tsx'
    ),
    'utf8'
  )
  const drawerSource = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/organization-management/views/members/member-form-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(
    membersSource,
    /existingMembers=\{actorMembersQuery\.data\?\.datas \?\? \[\]\}/
  )
  assert.match(drawerSource, /existingMembers\?: OrganizationMember\[\]/)
  assert.match(drawerSource, /ORGANIZATION_MEMBER_EXISTS_MESSAGE/)
  assert.match(drawerSource, /用户已在该组织中，请使用设置组织角色调整权限/)
  assert.match(drawerSource, /findExistingOrganizationMemberByEmail/)
  assert.match(drawerSource, /formError/)
  assert.match(
    drawerSource,
    /setFormError\(ORGANIZATION_MEMBER_EXISTS_MESSAGE\)/
  )
  assert.match(
    drawerSource,
    /border-destructive\/30 bg-destructive\/5 text-destructive mx-4 mb-4 rounded-md border px-3 py-2 text-sm/
  )
  assert.doesNotMatch(drawerSource, /setError\(\s*'email'/)
  assert.doesNotMatch(
    drawerSource,
    /toast\.error\(ORGANIZATION_MEMBER_EXISTS_MESSAGE\)/
  )
})
