import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)

test('auto evaluation trace filter uses supported quick time ranges', () => {
  assert.match(source, /AUTO_EVALUATION_TRACE_QUICK_TIME_RANGE_OPTIONS/)
  assert.match(source, /AUTO_EVALUATION_DEFAULT_TRACE_TIME_RANGE\s*=\s*'1d'/)
  assert.match(source, /value:\s*'1d'/)
  assert.match(source, /value:\s*'3d'/)
  assert.match(source, /value:\s*'7d'/)
  assert.doesNotMatch(source, /value:\s*'14d'/)
  assert.doesNotMatch(source, /timeRange:\s*'24h'/)
  assert.doesNotMatch(source, /:\s*'24h'/)
})

test('auto evaluation trace filter uses custom date-time controls before quick ranges', () => {
  assert.match(source, /<DateTimeRangePicker/)
  assert.match(source, /startPlaceholder='开始时间'/)
  assert.match(source, /endPlaceholder='结束时间'/)
  assert.match(source, /toDateTimePickerValue/)
  assert.match(source, /fromDateTimePickerValue/)
  assert.match(source, /ToggleGroup/)
  assert.match(source, /createTraceDateTimeRange/)
  assert.match(source, /createdAtRange/)
  assert.doesNotMatch(source, /label='Trace Name'/)
  assert.doesNotMatch(source, /traceName/)
})

test('auto evaluation trace filter is the default data source tab before dataset', () => {
  assert.match(source, /dataSource:\s*createDefaultTraceFilter\(\)/)
  assert.match(
    source,
    /<TabsTrigger value='TRACE_FILTER'>Trace 过滤<\/TabsTrigger>\s*<TabsTrigger value='DATASET'>数据集<\/TabsTrigger>/
  )
})

test('auto evaluation trace filter estimates automatically and exposes preview table', () => {
  assert.match(source, /useEffect\(\(\) => \{/)
  assert.match(source, /查看数据/)
  assert.match(source, /countProjectAutoEvaluationTraces/)
  assert.match(source, /listProjectAutoEvaluationTracePreview/)
  assert.match(source, /TracePreviewDialog/)
  assert.doesNotMatch(source, /开始预估/)
  assert.doesNotMatch(source, /environments:\s*\['production'\]/)
})

test('trace preview dialog loads only the current page and exposes pagination controls', () => {
  assert.match(source, /TRACE_PREVIEW_PAGE_SIZE\s*=\s*10/)
  assert.match(
    source,
    /TRACE_PREVIEW_PAGE_SIZE_OPTIONS\s*=\s*\[10,\s*20,\s*30,\s*40,\s*50\]/
  )
  assert.match(source, /tracePreviewPage/)
  assert.match(source, /tracePreviewPageSize/)
  assert.match(source, /setTracePreviewPage/)
  assert.match(source, /setTracePreviewPageSize/)
  assert.match(source, /每页行数/)
  assert.match(source, /getPageNumbers\(currentPage,\s*totalPages\)/)
  assert.match(source, /跳到第一页/)
  assert.match(source, /跳到最后一页/)
  assert.match(source, /Math\.ceil\(total \/ pageSize\)/)
  assert.doesNotMatch(
    source,
    /for \(let page = 2; page <= totalPages; page \+= 1\)/
  )
})

test('trace preview dialog has 50 percent width, 600px min width, and scrolls', () => {
  assert.match(source, /w-\[50vw\]/)
  assert.match(source, /sm:max-w-\[50vw\]/)
  assert.match(source, /min-w-\[600px\]/)
  assert.match(source, /overflow-auto/)
  assert.doesNotMatch(source, /\sresize\s/)
  assert.match(source, /table-fixed/)
  assert.match(source, /whitespace-normal/)
})

test('auto evaluation submit handles backend errors without bubbling server error', () => {
  assert.match(source, /const \[submittingMode, setSubmittingMode\]/)
  assert.match(source, /try \{/)
  assert.match(source, /catch \(submitError\)/)
  assert.match(source, /getSubmitErrorMessage\(submitError\)/)
  assert.match(source, /toast\.error\(message\)/)
})

test('auto evaluation only offers workflow evaluators supported by runner', () => {
  assert.match(source, /AUTO_EVALUATION_SUPPORTED_WORKFLOW_PROVIDERS/)
  assert.match(source, /evaluator\.type === 'WORKFLOW'/)
  assert.match(
    source,
    /AUTO_EVALUATION_SUPPORTED_WORKFLOW_PROVIDERS\.includes\(\s*evaluator\.provider\s*\)/
  )
})
