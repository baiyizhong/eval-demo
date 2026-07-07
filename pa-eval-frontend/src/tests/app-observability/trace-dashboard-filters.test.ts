import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const dashboardSource = readFileSync(
  'src/modules/app-observability/views/trace-dashboard.tsx',
  'utf8'
)
const filterSource = readFileSync(
  'src/modules/app-observability/components/trace-dashboard-filters.tsx',
  'utf8'
)
const timeRangeSource = readFileSync(
  'src/modules/app-observability/trace-time-ranges.ts',
  'utf8'
)

test('trace dashboard defaults to supported one day time range', () => {
  assert.match(dashboardSource, /DEFAULT_TRACE_QUICK_TIME_RANGE/)
  assert.doesNotMatch(dashboardSource, /useState\('24h'\)/)
})

test('trace dashboard filter options match supported quick ranges', () => {
  assert.match(filterSource, /TRACE_QUICK_TIME_RANGE_OPTIONS/)
  assert.match(timeRangeSource, /value:\s*'1d'/)
  assert.match(timeRangeSource, /最近 1 天/)
  assert.match(timeRangeSource, /value:\s*'3d'/)
  assert.match(timeRangeSource, /最近 3 天/)
  assert.match(timeRangeSource, /value:\s*'7d'/)
  assert.match(timeRangeSource, /最近 7 天/)
  assert.match(timeRangeSource, /value:\s*'14d'/)
  assert.match(timeRangeSource, /最近 14 天/)
  assert.doesNotMatch(timeRangeSource, /value:\s*'24h'/)
  assert.doesNotMatch(timeRangeSource, /value:\s*'30d'/)
})
