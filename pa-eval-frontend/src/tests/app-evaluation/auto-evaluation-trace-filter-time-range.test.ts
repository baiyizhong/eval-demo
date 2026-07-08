import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)

test('auto evaluation trace filter uses supported quick time ranges', () => {
  assert.match(source, /TRACE_QUICK_TIME_RANGE_OPTIONS/)
  assert.match(source, /AUTO_EVALUATION_DEFAULT_TRACE_TIME_RANGE\s*=\s*'3d'/)
  assert.match(source, /SelectItem/)
  assert.doesNotMatch(source, /timeRange:\s*'24h'/)
  assert.doesNotMatch(source, /:\s*'24h'/)
})
