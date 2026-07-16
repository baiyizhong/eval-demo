import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const reportsSource = readFileSync(
  'src/modules/app-evaluation/views/evaluation-reports.tsx',
  'utf8'
)
const rowActionsSource = readFileSync(
  'src/modules/app-evaluation/components/evaluation-report-row-actions.tsx',
  'utf8'
)

test('evaluation report list exposes refresh action in page navigation', () => {
  assert.match(reportsSource, /const handleRefresh = async \(\) =>/)
  assert.match(reportsSource, /id: 'refresh'[\s\S]*label: '刷新'/)
  assert.match(reportsSource, /icon: RefreshCw/)
  assert.match(reportsSource, /onClick: \(\) => void handleRefresh\(\)/)
})

test('evaluation report row actions keep report-scoped operations only', () => {
  assert.match(rowActionsSource, /导出报告/)
  assert.doesNotMatch(rowActionsSource, /回流数据/)
  assert.doesNotMatch(rowActionsSource, /onFlowback/)
})
