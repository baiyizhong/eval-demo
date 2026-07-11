import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const pageSource = readFileSync(
  'src/modules/app-evaluation/views/auto-evaluations.tsx',
  'utf8'
)
const apiSource = readFileSync(
  'src/modules/app-evaluation/api/auto-evaluation-api.ts',
  'utf8'
)
const mockSource = readFileSync('mock/auto-evaluations.ts', 'utf8')
const backendSource = readFileSync(
  '../pa-eval-backend/app/auto_evaluations.py',
  'utf8'
)

test('auto evaluation list uses status toolbar filter instead of summary cards', () => {
  assert.doesNotMatch(pageSource, /AutoEvaluationSummaryCards/)
  assert.doesNotMatch(pageSource, /getProjectAutoEvaluationTaskSummary/)
  assert.doesNotMatch(pageSource, /activeFilter/)
  assert.match(pageSource, /filters:\s*\[\s*\{ fieldId: 'status', type: 'array' \}/)
  assert.match(pageSource, /fieldId: 'status'[\s\S]*title: '状态'/)
  assert.match(pageSource, /autoEvaluationStatusLabels/)
  assert.match(apiSource, /query\.filters\.status/)
  assert.match(apiSource, /\.\.\.\(status\?\.length \? \{ status \} : \{\}\)/)
  assert.match(mockSource, /req\.query\?\.status/)
  assert.match(backendSource, /status: list\[AutoEvaluationTaskStatus\]/)
  assert.match(backendSource, /status = ANY\(%\(status\)s::text\[\]\)/)
})

