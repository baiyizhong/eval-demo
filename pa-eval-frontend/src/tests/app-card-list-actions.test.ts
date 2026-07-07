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
