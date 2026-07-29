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
  assert.doesNotMatch(formSource, /checked=\{form\.badcase\.enabled\}/)
  assert.doesNotMatch(formSource, /disabled=\{!form\.badcase\.enabled\}/)
})

test('新建自动评测抽屉显示 overlay', () => {
  assert.match(autoEvaluationsSource, /showOverlay=\{true\}/)
})

test('新建自动评测表单不重复展示抽屉标题和说明', () => {
  assert.doesNotMatch(formSource, /<h2[^>]*>\s*新建自动评测\s*<\/h2>/)
  assert.doesNotMatch(formSource, /按步骤配置基础信息、评估器和评测数据来源。/)
})

test('新建自动评测评估器列表不展示说明且布局可收缩', () => {
  assert.match(
    formSource,
    /<h3 className='text-sm font-semibold'>评估器列表<\/h3>/
  )
  assert.doesNotMatch(formSource, /选择一个工作流评估器用于批量打分。/)
  assert.doesNotMatch(formSource, /<Field label='搜索评估器'>/)
  assert.match(formSource, /placeholder='输入评估器名称或描述'/)
  assert.match(
    formSource,
    /className='grid w-full max-w-full min-w-0 gap-4 lg:grid-cols-\[minmax\(0,320px\)_minmax\(0,1fr\)\]'/
  )
  assert.match(
    formSource,
    /className='bg-card text-card-foreground flex min-h-\[420px\] max-w-full min-w-0 flex-col gap-3 rounded-lg border p-4'/
  )
  assert.match(
    formSource,
    /className='flex min-h-0 max-h-\[min\(560px,calc\(100vh-320px\)\)\] flex-1 flex-col gap-2'/
  )
})
