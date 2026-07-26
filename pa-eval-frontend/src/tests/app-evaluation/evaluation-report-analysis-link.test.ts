import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/evaluation-report-analysis.tsx',
  'utf8'
)

test('evaluation report analysis links group analysis to trace logs by score queue id', () => {
  assert.match(source, /<CardTitle>分组分析<\/CardTitle>/)
  assert.match(source, /查看详情/)
  assert.match(source, /getTraceScoreQueueLink\(report\)/)
  assert.match(source, /params\.set\('scoreQueueId', report\.sourceTaskId\)/)
  assert.match(source, /params\.append\('createdAtRange', '1970-01-01 00:00:00'\)/)
  assert.match(source, /params\.append\('createdAtRange', '2999-12-31 23:59:59'\)/)
  assert.match(source, /observability\/traces\/logs\?\$\{params\.toString\(\)\}/)
})
