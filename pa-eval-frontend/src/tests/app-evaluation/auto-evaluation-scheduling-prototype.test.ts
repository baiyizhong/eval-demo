import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)

test('自动评测定时执行标识默认关闭并在基础信息中展示', () => {
  assert.match(
    source,
    /const \[supportsScheduledExecution, setSupportsScheduledExecution\] =\s*useState\(false\)/
  )
  assert.match(
    source,
    /<Label htmlFor='supports-scheduled-execution'>\s*支持定时执行\s*<\/Label>/
  )
  assert.match(source, /id='supports-scheduled-execution'/)
  assert.match(source, /checked=\{supportsScheduledExecution\}/)
})

test('开启支持定时执行后展示调度模块提示', () => {
  assert.match(source, /supportsScheduledExecution \? \(/)
  assert.match(source, /可在定时任务模块中配置调度/)
})

test('开启支持定时执行后强制使用 Trace 过滤并隐藏数据集选项', () => {
  assert.match(
    source,
    /onCheckedChange=\{\(checked\) => \{[\s\S]*setSupportsScheduledExecution\(checked\)[\s\S]*checked && form\.dataSource\.type === 'DATASET'[\s\S]*\? createDefaultTraceFilter\(\)/
  )
  assert.match(
    source,
    /\{!supportsScheduledExecution \? \(\s*<TabsTrigger value='DATASET'>数据集<\/TabsTrigger>\s*\) : null\}/
  )
  assert.match(
    source,
    /\{!supportsScheduledExecution \? \(\s*<TabsContent\s+value='DATASET'/
  )
})

test('定时执行标识只保留在前端状态中，不加入创建任务请求', () => {
  const submitPayload = source.match(
    /createProjectAutoEvaluationTask\([\s\S]*?\{([\s\S]*?)\}\s*\)/
  )?.[1]

  assert.ok(submitPayload)
  assert.doesNotMatch(submitPayload, /supportsScheduledExecution/)
})
