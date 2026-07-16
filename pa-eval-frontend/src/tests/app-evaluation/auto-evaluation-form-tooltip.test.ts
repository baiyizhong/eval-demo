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

test('新建自动评测只展示 Badcase 阈值输入', () => {
  assert.match(formSource, /label='Badcase 阈值'/)
  assert.match(
    formSource,
    /badcase:\s*\{\s*...form\.badcase,\s*enabled:\s*true\s*\}/
  )
  assert.doesNotMatch(formSource, /label='Badcase'\s+tooltip=/)
  assert.doesNotMatch(formSource, /<Switch/)
  assert.doesNotMatch(formSource, /disabled=\{!form\.badcase\.enabled\}/)
})

test('新建自动评测抽屉显示 overlay', () => {
  assert.match(autoEvaluationsSource, /showOverlay=\{true\}/)
})

test('新建自动评测表单不重复展示抽屉标题和说明', () => {
  assert.doesNotMatch(formSource, /<h2[^>]*>\s*新建自动评测\s*<\/h2>/)
  assert.doesNotMatch(formSource, /按步骤配置基础信息、评估器和评测数据来源。/)
})
