import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/project-settings/views/score-configs.tsx',
  'utf8'
)

test('score configs page removes recommended metric preparation action', () => {
  assert.doesNotMatch(source, /准备推荐指标/)
  assert.doesNotMatch(source, /ensureDefaultProjectScoreConfig/)
})

test('boolean score configs use fixed yes and no options', () => {
  assert.match(source, /BOOLEAN_SCORE_OPTIONS/)
  assert.match(source, /value:\s*'1',\s*label:\s*'是'/)
  assert.match(source, /value:\s*'0',\s*label:\s*'否'/)
  assert.match(source, /BooleanScoreOptionRows/)
  assert.doesNotMatch(source, /addLabel='新增布尔值'/)
})

test('boolean score configs show concise yes and no labels to users', () => {
  assert.match(source, /formatBooleanScoreOptions/)
  assert.match(source, /布尔类型固定为“是 \/ 否”，不支持自定义修改。/)
  assert.doesNotMatch(source, /1（是）和 0（否）/)
  assert.doesNotMatch(source, /aria-label=\{`布尔值/)
})
