import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('project member create form uses drawer and links name changes to email', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/modules/project-settings/views/members.tsx'),
    'utf8'
  )

  assert.match(
    source,
    /import \{ Drawer \} from '@\/components\/common\/drawer'/
  )
  assert.doesNotMatch(source, /<Dialog\b/)
  assert.match(source, /getOrganizationMemberEmailSettings/)
  assert.match(source, /buildOrganizationMemberEmail/)
  assert.match(source, /normalizeMemberNameInput/)
  assert.match(source, /name='name'/)
  assert.match(source, /form\.setValue\(\s*'email'/)
  assert.match(source, /createMutation\.mutate\(input\)/)
})

test('project member create form handles duplicate members inside drawer before requesting api', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/modules/project-settings/views/members.tsx'),
    'utf8'
  )

  assert.match(
    source,
    /const PROJECT_MEMBER_EXISTS_MESSAGE\s*=\s*'用户已在该项目中，请使用设置项目角色调整权限'/
  )
  assert.match(source, /const \[formError, setFormError\] = useState/)
  assert.match(source, /findExistingProjectMemberByEmail\(/)
  assert.match(source, /setFormError\(PROJECT_MEMBER_EXISTS_MESSAGE\)/)
  assert.match(source, /return\s*\n\s*}\s*\n\s*createMutation\.mutate\(input\)/)
  assert.match(
    source,
    /border-destructive\/30 bg-destructive\/5 text-destructive mx-4 mb-4 rounded-md border px-3 py-2 text-sm/
  )
})
