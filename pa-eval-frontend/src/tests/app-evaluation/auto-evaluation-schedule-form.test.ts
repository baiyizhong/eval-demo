import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)

test('auto evaluation form defines default schedule configuration', () => {
  assert.match(source, /const defaultSchedule/)
  assert.match(source, /frequency:\s*'DAILY'/)
  assert.match(source, /executionHour:\s*1/)
  assert.match(source, /timezone:\s*'Asia\/Shanghai'/)
  assert.match(source, /mode:\s*'previous_day'/)
  assert.match(source, /startHour:\s*0/)
  assert.match(source, /endHour:\s*0/)
  assert.match(source, /maxAttempts:\s*3/)
  assert.match(source, /backoffMinutes:\s*\[10,\s*30,\s*60\]/)
})

test('auto evaluation initial form starts as immediate with default schedule', () => {
  assert.match(source, /runMode:\s*'IMMEDIATE'/)
  assert.match(source, /schedule:\s*defaultSchedule/)
})

test('auto evaluation base step does not expose run mode controls', () => {
  const baseStepMatch = source.match(
    /\{step === 0 \? \(\s*<section[\s\S]*?\{step === 1 \?/
  )
  assert.ok(baseStepMatch)
  assert.doesNotMatch(baseStepMatch[0], /运行方式/)
  assert.doesNotMatch(baseStepMatch[0], /定时执行配置/)
})

test('auto evaluation execution step exposes run mode and schedule controls', () => {
  const executionStepMatch = source.match(
    /\{step === 2 \? \(\s*<section[\s\S]*?<div className='bg-background\/95/
  )
  assert.ok(executionStepMatch)
  assert.match(executionStepMatch[0], /运行方式/)
  assert.match(executionStepMatch[0], /立即执行/)
  assert.match(executionStepMatch[0], /定时执行/)
  assert.match(executionStepMatch[0], /定时执行配置/)
  assert.match(executionStepMatch[0], /执行频率/)
  assert.match(executionStepMatch[0], /每 30 分钟/)
  assert.match(executionStepMatch[0], /每小时/)
  assert.match(executionStepMatch[0], /每天/)
  assert.match(executionStepMatch[0], /执行时间/)
  assert.match(executionStepMatch[0], /01:00/)
  assert.match(executionStepMatch[0], /时区/)
  assert.match(executionStepMatch[0], /Asia\/Shanghai/)
  assert.match(executionStepMatch[0], /失败重试/)
  assert.match(executionStepMatch[0], /最多 3 次/)
  assert.match(executionStepMatch[0], /10、30、60 分钟/)
  assert.match(executionStepMatch[0], /保存后不会立即执行/)
  assert.match(executionStepMatch[0], /启动后按计划采集 Trace 并执行评测/)
})

test('auto evaluation submit sends run mode and schedule', () => {
  assert.match(source, /runMode:\s*form\.runMode/)
  assert.match(source, /const effectiveSchedule = form\.schedule \?\? defaultSchedule/)
  assert.match(source, /schedule:\s*runMode === 'SCHEDULED'\s*\?\s*effectiveSchedule\s*:\s*null/)
  assert.match(source, /dataSource: getSubmissionDataSource\(form, runMode\)/)
  assert.doesNotMatch(source, /schedule:\s*form\.runMode === 'SCHEDULED'\s*\?\s*form\.schedule\s*:\s*null/)
})

test('auto evaluation scheduled footer saves without run action', () => {
  assert.match(source, /保存定时任务/)
  assert.match(
    source,
    /form\.runMode === 'SCHEDULED'\s*\?\s*\(\s*<Button[\s\S]*onClick=\{\(\) => void handleSubmit\('create'\)\}[\s\S]*保存定时任务[\s\S]*<\/Button>\s*\)/
  )

  const scheduledFooterMatch = source.match(
    /form\.runMode === 'SCHEDULED'\s*\?\s*\(([\s\S]*?)\)\s*:\s*\(/
  )
  assert.ok(scheduledFooterMatch)
  assert.doesNotMatch(scheduledFooterMatch[1], /handleSubmit\('run'\)/)
  assert.doesNotMatch(scheduledFooterMatch[1], /创建并运行/)
})

test('auto evaluation schedule updates use functional state updates', () => {
  assert.match(source, /const updateSchedule = \(/)
  assert.match(
    source,
    /const updateSchedule = \([\s\S]*?setForm\(\(current\) => \{[\s\S]*?const nextSchedule = updater\(current\.schedule \?\? defaultSchedule\)[\s\S]*?return \{ \.\.\.current, schedule: nextSchedule \}/
  )
  assert.match(source, /updateSchedule\(\(currentSchedule\) => \(/)
  assert.doesNotMatch(
    source,
    /updateForm\(\{\s*\.\.\.form,\s*schedule:\s*nextSchedule\s*\}\)/
  )
  assert.doesNotMatch(
    source,
    /updateForm\(\{\s*\.\.\.form,\s*schedule:\s*\{\s*\.\.\.schedule/
  )
})

test('auto evaluation scheduled mode switch preserves current form state', () => {
  assert.match(source, /const updateFormWith = \(/)
  assert.match(
    source,
    /updateFormWith\(\(current\) => \(\{[\s\S]*?\.\.\.current,[\s\S]*?runMode:[\s\S]*?value as NonNullable<AutoEvaluationTaskFormInput\['runMode'\]>,[\s\S]*?schedule: current\.schedule \?\? defaultSchedule,[\s\S]*?\}\)\)/
  )
  assert.doesNotMatch(
    source,
    /updateForm\(\{\s*\.\.\.form,[\s\S]*?runMode:[\s\S]*?schedule:\s*form\.schedule \?\? defaultSchedule/
  )
})

test('auto evaluation scheduled trace rule derives window from frequency', () => {
  assert.match(source, /function getEffectiveTraceFilter/)
  assert.match(source, /function createSchedulePreviewTraceDateTimeRange/)
  assert.match(source, /function getScheduleTraceWindowSummary/)
  assert.match(source, /function createScheduleWindowForFrequency/)
  assert.match(source, /function getSubmissionDataSource/)
  assert.match(source, /动态评测数据规则/)
  assert.match(source, /保存 Trace 筛选规则，每次定时触发时按执行频率动态查询增量样本/)
  assert.match(source, /Trace 数据范围/)
  assert.match(source, /rolling_interval/)
  assert.match(source, /intervalMinutes:\s*30/)
  assert.match(source, /intervalMinutes:\s*60/)
  assert.match(source, /createdAtRange: createSchedulePreviewTraceDateTimeRange\(schedule\)/)
  assert.match(source, /createdAtRange: \[\]/)
  assert.match(source, /按当前时间窗口预估每次定时运行的 Trace 数量/)
  assert.doesNotMatch(source, /function parseScheduleTimeInput/)
  assert.doesNotMatch(source, /type='time'/)
  assert.doesNotMatch(source, /step=\{3600\}/)
})

test('auto evaluation scheduled trace rule can be saved when preview count is zero', () => {
  assert.match(
    source,
    /form\.dataSource\.type === 'TRACE_FILTER' &&\s*form\.runMode !== 'SCHEDULED' &&\s*form\.dataSource\.estimatedCount === 0/
  )
  assert.match(source, /Trace 命中数量为 0，请调整过滤条件/)
})

test('auto evaluation scheduled success toast does not say it started running', () => {
  assert.match(source, /定时评测任务已保存，启动后按计划执行/)
  assert.doesNotMatch(source, /mode === 'run' \? '自动评测任务已创建并开始运行' : '自动评测任务已创建'/)
})
