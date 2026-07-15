import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('project member create form uses drawer and links name changes to email', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/modules/project-settings/views/members.tsx'),
    'utf8'
  )

  assert.match(source, /import \{ Drawer \} from '@\/components\/common\/drawer'/)
  assert.doesNotMatch(source, /<Dialog\b/)
  assert.match(source, /getOrganizationMemberEmailSettings/)
  assert.match(source, /buildOrganizationMemberEmail/)
  assert.match(source, /name='name'/)
  assert.match(source, /form\.setValue\(\s*'email'/)
  assert.match(source, /createMutation\.mutate\(input\)/)
})
