import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const formSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)

const autoEvaluationsSource = readFileSync(
  'src/modules/app-evaluation/views/auto-evaluations.tsx',
  'utf8'
)

test('Score Name 说明通过 Tooltip 图标展示', () => {
  assert.match(formSource, /TooltipContent/)
  assert.match(formSource, /Info/)
  assert.match(formSource, /仅支持英文、数字、下划线和短横线。/)
  assert.doesNotMatch(
    formSource,
    /description='仅支持英文、数字、下划线和短横线。'/
  )
})

test('Badcase 说明通过 Tooltip 图标展示', () => {
  assert.match(
    formSource,
    /label='Badcase'\s+tooltip='关闭后不再生成 Badcase。'/
  )
  assert.doesNotMatch(
    formSource,
    /label='Badcase'\s+description='关闭后不再生成 Badcase。'/
  )
})

test('新建自动评测抽屉显示 overlay', () => {
  assert.match(autoEvaluationsSource, /showOverlay=\{true\}/)
})

test('新建自动评测表单不重复展示抽屉标题和说明', () => {
  assert.doesNotMatch(formSource, /<h2[^>]*>\s*新建自动评测\s*<\/h2>/)
  assert.doesNotMatch(formSource, /按步骤配置基础信息、评估器和评测数据来源。/)
})
