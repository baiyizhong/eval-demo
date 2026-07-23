import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const scenarioSource = readFileSync(
  'src/modules/app-evaluation/lib/evaluation-scenarios.ts',
  'utf8'
)

const scenarioViewSource = readFileSync(
  'src/modules/app-evaluation/views/scenario-evaluations.tsx',
  'utf8'
)

const taskFormSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)

test('场景评测入口展示推荐数据形态、指标和默认字段', () => {
  assert.match(scenarioSource, /recommendedDataShape/)
  assert.match(scenarioSource, /defaultMetrics/)
  assert.match(scenarioSource, /fieldAliases/)
  assert.match(scenarioSource, /conversation|history|messages/)
  assert.match(scenarioSource, /trajectory|tool_calls/)
  assert.match(scenarioSource, /skill|artifact|instruction/)
  assert.match(scenarioViewSource, /推荐数据/)
  assert.match(scenarioViewSource, /推荐指标/)
  assert.match(scenarioViewSource, /默认字段/)
})

test('新建自动评测按场景突出推荐评估器和自动映射说明', () => {
  assert.match(taskFormSource, /activeScenario/)
  assert.match(taskFormSource, /场景推荐评估器/)
  assert.match(taskFormSource, /其他评估器/)
  assert.match(taskFormSource, /自动识别字段/)
  assert.match(taskFormSource, /getScenarioMatchedEvaluators/)
  assert.match(taskFormSource, /getScenarioOtherEvaluators/)
  assert.match(taskFormSource, /NoScenarioEvaluatorHint/)
})
