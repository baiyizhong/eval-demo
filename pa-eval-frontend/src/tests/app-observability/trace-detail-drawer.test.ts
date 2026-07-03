import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { TRACE_METADATA_JSON_EDITOR_CONFIG } from '../../modules/app-observability/components/trace-detail-drawer-config.ts'

test('trace metadata json editor keeps search enabled in edit mode', () => {
  assert.equal(TRACE_METADATA_JSON_EDITOR_CONFIG.searchable, true)
})

test('trace markdown editors use uncontrolled edit mode so preview toggle works', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-detail-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(source, /defaultMode='edit'/)
  assert.doesNotMatch(source, /mode='edit'/)
})
