import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-observability/components/trace-log-filters.tsx',
  'utf8'
)
const timeRangeSource = readFileSync(
  'src/modules/app-observability/trace-time-ranges.ts',
  'utf8'
)

test('trace log toolbar exposes quick time range options', () => {
  assert.match(source, /fieldId:\s*'timeRange'/)
  assert.match(source, /title:\s*'时间'/)
  assert.match(source, /TRACE_QUICK_TIME_RANGE_OPTIONS/)
  assert.match(source, /getTraceQuickTimeRangeToolbarDefault/)
  assert.match(timeRangeSource, /最近 1 天/)
  assert.match(timeRangeSource, /最近 3 天/)
  assert.match(timeRangeSource, /最近 7 天/)
  assert.match(timeRangeSource, /最近 14 天/)
})

test('trace log advanced filters keep only manual createdAtRange time control', () => {
  assert.match(source, /fieldId:\s*'createdAtRange'/)
  assert.match(source, /id:\s*'createdAtRange'/)
  assert.match(source, /label:\s*'Trace 创建时间范围'/)
  assert.doesNotMatch(source, /renderTraceTimeRangeFilter/)
  assert.doesNotMatch(source, /id:\s*'timeRange'/)
})

test('trace log advanced filters expose Langfuse score filters', () => {
  assert.match(source, /id:\s*'scoreQueueId'/)
  assert.match(source, /label:\s*'Score Queue ID'/)
  assert.match(source, /id:\s*'categoricalScoreFilters'/)
  assert.match(source, /label:\s*'Categorical Scores'/)
  assert.match(source, /id:\s*'numericScoreFilters'/)
  assert.match(source, /label:\s*'Numeric Scores'/)
})

test('trace log metadata filters use IME-safe text inputs', () => {
  assert.match(source, /function MetadataTextInput/)
  assert.match(source, /onCompositionStart=\{\(\) => setIsComposing\(true\)\}/)
  assert.match(source, /onCompositionEnd=\{\(event\) =>/)
  assert.match(source, /if \(!isComposing\)/)
  assert.match(source, /<MetadataTextInput[\s\S]*value=\{filter\.key\}/)
  assert.match(source, /<MetadataTextInput[\s\S]*value=\{filter\.value \?\? ''\}/)
})
