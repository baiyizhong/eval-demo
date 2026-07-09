import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const columnsSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-columns.tsx',
  'utf8'
)
const rowActionsSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-row-actions.tsx',
  'utf8'
)
const listViewSource = readFileSync(
  'src/modules/app-evaluation/views/auto-evaluations.tsx',
  'utf8'
)
const detailSource = readFileSync(
  'src/modules/app-evaluation/views/auto-evaluation-detail.tsx',
  'utf8'
)
const runRecordsSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-run-records.tsx',
  'utf8'
)
const registrySource = readFileSync('src/api/registry.ts', 'utf8')

test('auto evaluation list exposes schedule columns and labels', () => {
  assert.match(columnsSource, /title='运行方式'/)
  assert.match(columnsSource, /title='调度状态'/)
  assert.match(columnsSource, /title='下次执行'/)
  assert.match(listViewSource, /runMode:\s*'运行方式'/)
  assert.match(listViewSource, /scheduleStatus:\s*'调度状态'/)
  assert.match(listViewSource, /nextRunAt:\s*'下次执行'/)
})

test('auto evaluation row actions expose schedule start and pause actions', () => {
  assert.match(rowActionsSource, /onStartSchedule/)
  assert.match(rowActionsSource, /onPauseSchedule/)
  assert.match(rowActionsSource, /task\.runMode === 'SCHEDULED'/)
  assert.match(rowActionsSource, /task\.schedule\?\.status === 'ACTIVE'/)
  assert.match(rowActionsSource, /启动调度/)
  assert.match(rowActionsSource, /停止调度/)
  assert.match(rowActionsSource, /重新运行/)
})

test('auto evaluation list view wires schedule start and pause helpers', () => {
  assert.match(
    listViewSource,
    /startProjectAutoEvaluationSchedule[\s\S]*pauseProjectAutoEvaluationSchedule/
  )
  assert.match(listViewSource, /handleStartSchedule/)
  assert.match(listViewSource, /handlePauseSchedule/)
  assert.match(listViewSource, /自动评测调度已启动/)
  assert.match(listViewSource, /自动评测调度已停止/)
})

test('auto evaluation detail displays schedule config and action buttons', () => {
  assert.match(detailSource, /调度配置/)
  assert.match(detailSource, /Cron/)
  assert.match(detailSource, /时区/)
  assert.match(detailSource, /下次执行/)
  assert.match(detailSource, /时间窗口/)
  assert.match(detailSource, /rolling_interval/)
  assert.match(detailSource, /触发前 30 分钟/)
  assert.match(detailSource, /触发前 1 小时/)
  assert.match(detailSource, /上一自然日 00:00 - 当天 00:00/)
  assert.match(detailSource, /重试策略/)
  assert.match(detailSource, /handleStartSchedule/)
  assert.match(detailSource, /handlePauseSchedule/)
})

test('auto evaluation run records display trigger window and attempt metadata', () => {
  assert.match(runRecordsSource, /触发方式/)
  assert.match(runRecordsSource, /时间窗口/)
  assert.match(runRecordsSource, /尝试次数/)
  assert.match(runRecordsSource, /run\.triggerSource/)
  assert.match(runRecordsSource, /run\.windowStart/)
  assert.match(runRecordsSource, /run\.windowEnd/)
  assert.match(runRecordsSource, /run\.attemptNo/)
})

test('auto evaluation schedule api aliases are registered', () => {
  assert.match(
    registrySource,
    /startAutoEvaluationSchedule:\s*\{\s*method:\s*'POST',\s*url:\s*'\/projects\/:projectId\/auto-evaluations\/:taskId\/schedule\/start',\s*\}/
  )
  assert.match(
    registrySource,
    /pauseAutoEvaluationSchedule:\s*\{\s*method:\s*'POST',\s*url:\s*'\/projects\/:projectId\/auto-evaluations\/:taskId\/schedule\/pause',\s*\}/
  )
})
