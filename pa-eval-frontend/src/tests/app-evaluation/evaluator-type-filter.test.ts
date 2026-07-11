import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const evaluatorsSource = readFileSync(
  'src/modules/tasks/views/evaluators.tsx',
  'utf8'
)
const evaluatorApiSource = readFileSync(
  'src/modules/tasks/api/evaluator-api.ts',
  'utf8'
)

test('evaluator list exposes evaluator type toolbar filter', () => {
  assert.match(
    evaluatorsSource,
    /const evaluatorUrlFilters[\s\S]*fieldId: 'type'[\s\S]*columnId: 'type'[\s\S]*type: 'array'/
  )
  assert.match(
    evaluatorsSource,
    /const evaluatorToolbarFilters[\s\S]*columnId: 'type'[\s\S]*title: '评估器类型'[\s\S]*selectionMode: 'single'/
  )
  assert.match(evaluatorsSource, /filters: evaluatorToolbarFilters/)
})

test('evaluator list query sends selected evaluator type to backend', () => {
  assert.match(evaluatorApiSource, /query\.filters\.type/)
  assert.match(
    evaluatorApiSource,
    /\.\.\.\(evaluatorType \? \{ type: evaluatorType \} : \{\}\)/
  )
})
