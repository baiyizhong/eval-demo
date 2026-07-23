import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const evaluatorsSource = readFileSync(
  'src/modules/tasks/views/evaluators.tsx',
  'utf8'
)

test('project evaluation evaluator list requests current project evaluators', () => {
  assert.match(evaluatorsSource, /navigation === 'project-evaluation'/)
  assert.match(
    evaluatorsSource,
    /listTaskEvaluators\(\s*\$api,\s*state,\s*navigation === 'project-evaluation' \? projectId : undefined\s*\)/
  )
})

test('built-in evaluators are visible but not editable or deletable', () => {
  assert.match(
    evaluatorsSource,
    /evaluator\.provider !== 'LANGFUSE' && !evaluator\.isBuiltin/
  )
  assert.match(evaluatorsSource, /内置评估器不可编辑/)
})
