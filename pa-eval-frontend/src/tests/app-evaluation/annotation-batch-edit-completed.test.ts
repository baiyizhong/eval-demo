import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const apiSource = readFileSync(
  'src/modules/app-evaluation/api/annotation-api.ts',
  'utf8'
)
const pageSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-batch.tsx',
  'utf8'
)

test('batch annotation submits selected pending and completed items by exact match count', () => {
  assert.match(apiSource, /expectedMatchCount:\s*number/)
  assert.match(pageSource, /expectedMatchCount:\s*targetIds\.length/)
  assert.match(pageSource, /filters:\s*\{\s*itemIds:\s*targetIds\s*\}/)
  assert.doesNotMatch(
    pageSource,
    /filters:\s*\{\s*status:\s*\['PENDING'\],\s*itemIds:\s*targetIds/
  )
})
