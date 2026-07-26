import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('AppCardList only renders icon actions with click handlers', () => {
  const source = readFileSync(
    'src/components/business/app-card-list.tsx',
    'utf8'
  )

  assert.match(source, /renderableIconActions/)
  assert.match(
    source,
    /\.filter\(\s*\(action\) =>\s*Boolean\(action\.onClick\)\s*\)/
  )
  assert.match(source, /renderableIconActions\.map/)
})

test('AppList hides add project action when no add handler is provided', () => {
  const source = readFileSync('src/components/business/app-list.tsx', 'utf8')

  assert.match(source, /const canAdd = Boolean\(/)
  assert.match(
    source,
    /canAdd\s*\?\s*\(\s*<Button[\s\S]*?新增项目[\s\S]*?<\/Button>\s*\)\s*:\s*null/
  )
})
