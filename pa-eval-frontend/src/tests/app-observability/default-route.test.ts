import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  fileURLToPath(
    new URL('../../modules/app-observability/index.tsx', import.meta.url)
  ),
  'utf8'
)

test('app observability defaults to Trace logs', () => {
  assert.match(source, /observability\/traces\/logs/)
  assert.doesNotMatch(source, /observability\/traces\/dashboard/)
})
