import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const alertSource = readFileSync(
  new URL('../../components/ui/alert.tsx', import.meta.url),
  'utf8'
)
const successAlertSource = readFileSync(
  new URL(
    '../../modules/app-observability/components/trace-operation-success-alert.tsx',
    import.meta.url
  ),
  'utf8'
)
const bulkActionsSource = readFileSync(
  new URL(
    '../../modules/app-observability/components/trace-log-bulk-actions.tsx',
    import.meta.url
  ),
  'utf8'
)
const traceLogsSource = readFileSync(
  new URL(
    '../../modules/app-observability/views/trace-logs.tsx',
    import.meta.url
  ),
  'utf8'
)

test('Alert 提供实心绿色背景的 success variant', () => {
  assert.match(alertSource, /success:/)
  assert.match(alertSource, /border-success bg-success/)
  assert.match(alertSource, /text-success-foreground/)
  assert.match(alertSource, /hover:bg-transparent/)
  assert.match(alertSource, /hover:text-success-foreground/)
  assert.doesNotMatch(alertSource, /bg-success\//)
  assert.doesNotMatch(alertSource, /hover:bg-success-foreground/)
})

test('成功 Alert 固定在留有边距的页面右上角并支持手动关闭', () => {
  assert.match(successAlertSource, /fixed inset-x-4 top-20 z-40/)
  assert.match(successAlertSource, /sm:right-6 sm:left-auto/)
  assert.match(successAlertSource, /<Alert variant='success'/)
  assert.match(successAlertSource, /aria-label='关闭成功提示'/)
  assert.match(successAlertSource, /onClick=\{onClose\}/)
  assert.match(successAlertSource, /<Link/)
})

test('Trace 日志页持有成功 Alert 状态且批量选择清除后不会卸载', () => {
  assert.match(
    traceLogsSource,
    /useState<TraceOperationSuccessNotice \| null>\(null\)/
  )
  assert.match(traceLogsSource, /<TraceOperationSuccessAlert/)
  assert.match(traceLogsSource, /onClose=\{\(\) => setSuccessNotice\(null\)\}/)
  assert.match(traceLogsSource, /onOperationSuccess=\{setSuccessNotice\}/)
})

test('数据集与人工标注成功时只上报 Alert，异常继续使用 toast', () => {
  assert.equal(bulkActionsSource.match(/toast\.success/g)?.length, 1)
  assert.match(bulkActionsSource, /toast\.success\(`已导出/)
  assert.match(bulkActionsSource, /toast\.error\(/)
  assert.match(bulkActionsSource, /onOperationSuccess\(\{/)
  assert.match(bulkActionsSource, /linkLabel: '查看数据集'/)
  assert.match(bulkActionsSource, /linkLabel: '查看人工标注任务'/)
  assert.match(bulkActionsSource, /evaluation\/datasets/)
  assert.match(bulkActionsSource, /evaluation\/annotation-queues/)
})
