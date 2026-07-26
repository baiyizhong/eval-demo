import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('ChartMetricCard provides compact vertical spacing while preserving horizontal padding', () => {
  const chartSource = readFileSync(
    'src/components/common/charts/chart-metric-card.tsx',
    'utf8'
  )

  assert.match(chartSource, /cn\('min-h-\[120px\] gap-2 py-4', className\)/)
  assert.match(chartSource, /gap-2 pb-0/)
  assert.match(chartSource, /text-2xl font-bold tabular-nums/)
  assert.doesNotMatch(chartSource, /px-4/)
})

test('annotation queue detail keeps metric cards mounted while metrics load', () => {
  const detailSource = readFileSync(
    'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
    'utf8'
  )

  assert.match(
    detailSource,
    /<section className='grid min-h-\[120px\] gap-4 md:grid-cols-2 xl:grid-cols-4'>/
  )
  assert.doesNotMatch(detailSource, /\{queue && metrics \? \(/)
  assert.match(
    detailSource,
    /value=\{metrics \? String\(metrics\.total\) : '--'\}/
  )
  assert.match(
    detailSource,
    /description=\{\s*metrics\s*\?\s*`最近更新 \$\{formatDateTime\(metrics\.updatedAt\)\}`\s*:\s*'\\u00A0'\s*\}/
  )
})

test('metric card scenarios reuse ChartMetricCard instead of local MetricCard components', () => {
  const metricCardSources = [
    'src/modules/app-evaluation/views/auto-evaluation-detail.tsx',
    'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
    'src/modules/app-evaluation/views/dataset-detail.tsx',
    'src/modules/system-pages/index.tsx',
  ]

  for (const path of metricCardSources) {
    const source = readFileSync(path, 'utf8')

    assert.match(
      source,
      /import \{ ChartMetricCard \} from '@\/components\/common\/charts'/,
      path
    )
    assert.match(source, /<ChartMetricCard/, path)
    assert.doesNotMatch(source, /function MetricCard/, path)
  }
})
