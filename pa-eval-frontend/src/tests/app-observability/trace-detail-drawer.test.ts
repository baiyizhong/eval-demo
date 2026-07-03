import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TRACE_METADATA_JSON_EDITOR_CONFIG } from '../../modules/app-observability/components/trace-detail-drawer-config.ts'

test('trace metadata json editor keeps search enabled in edit mode', () => {
  assert.equal(TRACE_METADATA_JSON_EDITOR_CONFIG.searchable, true)
})

