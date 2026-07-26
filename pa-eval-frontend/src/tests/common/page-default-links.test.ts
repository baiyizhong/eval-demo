import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('default page header links return to project management', () => {
  const pageSource = readFileSync('src/components/common/page.tsx', 'utf8')

  assert.match(pageSource, /title:\s*'项目管理'/)
  assert.match(pageSource, /href:\s*'\/apps'/)
  assert.doesNotMatch(pageSource, /title:\s*'应用管理'/)
})
