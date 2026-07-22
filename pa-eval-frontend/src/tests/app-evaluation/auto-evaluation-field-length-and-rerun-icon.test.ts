import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const formSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)
const rowActionsSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-row-actions.tsx',
  'utf8'
)
const detailSource = readFileSync(
  'src/modules/app-evaluation/views/auto-evaluation-detail.tsx',
  'utf8'
)

test('auto evaluation form limits task name and description lengths', () => {
  assert.match(formSource, /AUTO_EVALUATION_NAME_MAX_LENGTH = 40/)
  assert.match(formSource, /AUTO_EVALUATION_DESCRIPTION_MAX_LENGTH = 200/)
  assert.match(formSource, /maxLength=\{AUTO_EVALUATION_NAME_MAX_LENGTH\}/)
  assert.match(
    formSource,
    /maxLength=\{AUTO_EVALUATION_DESCRIPTION_MAX_LENGTH\}/
  )
  assert.match(formSource, /任务名称不能超过40个字/)
  assert.match(formSource, /任务描述不能超过200个字/)
})

test('auto evaluation rerun actions use RefreshCw consistently', () => {
  assert.match(rowActionsSource, /<RefreshCw data-icon='inline-start' \/>/)
  assert.doesNotMatch(rowActionsSource, /\bPlay\b/)
  assert.match(detailSource, /id: 'rerun',[\s\S]*?icon: RefreshCw/)
  assert.doesNotMatch(detailSource, /\bRotateCcw\b/)
})
