import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const evaluatorsSource = readFileSync(
  'src/modules/tasks/views/evaluators.tsx',
  'utf8'
)

test('evaluator create drawer uses a compact output variable score mapping', () => {
  assert.match(evaluatorsSource, /outputVariableMappings/)
  assert.match(evaluatorsSource, /OutputVariableMappingsField/)
  assert.match(evaluatorsSource, /<FormLabel>输出变量<\/FormLabel>/)
  assert.doesNotMatch(evaluatorsSource, /@\/components\/ui\/card/)
  assert.doesNotMatch(evaluatorsSource, /<Card\b/)
  assert.match(evaluatorsSource, /添加输出变量/)
  assert.match(evaluatorsSource, /变量名/)
  assert.match(evaluatorsSource, /评分指标/)
})

test('evaluator output variable names do not use score examples as defaults', () => {
  assert.match(evaluatorsSource, /outputVariables:\s*''/)
  assert.match(evaluatorsSource, /variableName:\s*''/)
  assert.match(evaluatorsSource, /scoreConfigName:\s*''/)
  assert.doesNotMatch(evaluatorsSource, /placeholder='quality_score'/)
  assert.doesNotMatch(evaluatorsSource, /variableName:\s*'score'/)
  assert.doesNotMatch(evaluatorsSource, /scoreConfigNames\[0\]/)
})

test('evaluator output variable score mapping loads project score config names only', () => {
  assert.match(evaluatorsSource, /listProjectScoreConfigs/)
  assert.match(evaluatorsSource, /scoreConfigNames/)
  assert.match(
    evaluatorsSource,
    /scoreConfigsQuery\.data[\s\S]*\?\.filter\(\(item\) => !item\.archived\)[\s\S]*\.map\(\(item\) => item\.name\)/
  )
  assert.match(
    evaluatorsSource,
    /<SelectItem[\s\S]{0,80}key=\{scoreConfigName\}[\s\S]{0,80}value=\{scoreConfigName\}/
  )
})

test('workflow evaluator mapping uses field binding UI before advanced JSON', () => {
  assert.match(evaluatorsSource, /WorkflowMappingFields/)
  assert.match(evaluatorsSource, /输入变量绑定/)
  assert.match(evaluatorsSource, /样本字段/)
  assert.match(evaluatorsSource, /保存为标准模板/)
  assert.match(evaluatorsSource, /高级 JSON/)
  assert.match(evaluatorsSource, /映射预览/)
  assert.doesNotMatch(evaluatorsSource, /<FormLabel>输入映射 JSON<\/FormLabel>/)
})
