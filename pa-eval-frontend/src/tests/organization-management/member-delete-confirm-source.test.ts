import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('delete member confirmation warns about removing project roles', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/organization-management/views/members/index.tsx'
    ),
    'utf8'
  )

  assert.match(source, /删除组织成员会移除该用户在组织下所有项目角色/)
  assert.match(source, /需要谨慎/)
})
