import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/tasks/views/evaluators.tsx',
  'utf8'
)

test('evaluator create and edit forms share the confirmed field limits', () => {
  assert.match(source, /EVALUATOR_NAME_MAX_LENGTH = 30/)
  assert.match(source, /EVALUATOR_DESCRIPTION_MAX_LENGTH = 200/)
  assert.match(source, /EVALUATOR_VARIABLE_NAME_MAX_LENGTH = 30/)
  assert.match(source, /EVALUATOR_INPUT_VARIABLES_MAX_LENGTH = 30/)

  assert.match(source, /max\(EVALUATOR_NAME_MAX_LENGTH/)
  assert.match(source, /max\(EVALUATOR_DESCRIPTION_MAX_LENGTH/)
  assert.match(source, /max\(EVALUATOR_VARIABLE_NAME_MAX_LENGTH/)
  assert.match(source, /max\(EVALUATOR_INPUT_VARIABLES_MAX_LENGTH/)

  assert.match(source, /maxLength=\{EVALUATOR_NAME_MAX_LENGTH\}/)
  assert.match(source, /maxLength=\{EVALUATOR_DESCRIPTION_MAX_LENGTH\}/)
  assert.match(source, /maxLength=\{EVALUATOR_VARIABLE_NAME_MAX_LENGTH\}/)
  assert.match(source, /maxLength=\{EVALUATOR_INPUT_VARIABLES_MAX_LENGTH\}/)
})
