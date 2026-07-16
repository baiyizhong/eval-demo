import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const formSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)

test('新建自动评测选择评估器时自动匹配输入变量', () => {
  assert.match(formSource, /defaultSampleMappingByVariable/)
  assert.match(formSource, /legacyMappingAliases/)
  assert.match(formSource, /function createDefaultVariableMapping/)
  assert.match(formSource, /function findDefaultMappingField/)
  assert.match(
    formSource,
    /variableMapping:\s*createDefaultVariableMapping\(evaluator\)/
  )
  assert.doesNotMatch(
    formSource,
    /variableMapping:\s*Object\.fromEntries\(\s*evaluator\.variables\.map\(\(item\) => \[item, ''\]\)\s*\)/
  )
})

test('新建自动评测输出变量只读展示评估器已配置的评分指标绑定', () => {
  assert.match(formSource, /outputVariableMappings/)
  assert.match(formSource, /getEvaluatorScoreMapping/)
  assert.match(formSource, /评分指标绑定已在评估器配置中完成/)
  assert.match(formSource, /如需调整，请返回评估器页面编辑/)
  assert.match(formSource, /未绑定评分指标/)
  assert.match(formSource, /getBoundScoreMapping\(form\.scoreMapping\)/)
  assert.doesNotMatch(
    formSource,
    /form\.scoreMapping\[variable\]\?\.scoreConfigId\s*\|\|\s*undefined/
  )
  assert.doesNotMatch(formSource, /选择评分指标/)
  assert.doesNotMatch(formSource, /scoreConfigs\.map/)
  assert.doesNotMatch(formSource, /listProjectScoreConfigs/)
  assert.doesNotMatch(
    formSource,
    /请完成评估器输出变量与评分指标绑定/
  )
  assert.doesNotMatch(
    formSource,
    /scoreConfigs\[index\]\s*\?\?\s*scoreConfigs\[0\]/
  )
})

test('新建自动评测查询评估器时后端先限定工作流类型', () => {
  assert.match(
    formSource,
    /listTaskEvaluators\(\$api,\s*\{[\s\S]*filters:\s*\{\s*type:\s*\['WORKFLOW'\]\s*\}/
  )
})
