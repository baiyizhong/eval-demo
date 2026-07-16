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

test('新建自动评测输出变量默认不绑定评分指标', () => {
  assert.match(formSource, /scoreConfigId:\s*''/)
  assert.match(
    formSource,
    /form\.scoreMapping\[variable\]\?\.scoreConfigId\s*\|\|\s*undefined/
  )
  assert.match(formSource, /getBoundScoreMapping\(form\.scoreMapping\)/)
  assert.doesNotMatch(formSource, /暂不绑定评分指标/)
  assert.doesNotMatch(
    formSource,
    /请完成评估器输出变量与评分指标绑定/
  )
  assert.doesNotMatch(
    formSource,
    /scoreConfigs\[index\]\s*\?\?\s*scoreConfigs\[0\]/
  )
})
