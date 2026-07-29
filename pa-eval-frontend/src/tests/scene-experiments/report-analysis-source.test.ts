import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

test('routes expose report detail aggregate and compare pages', () => {
  const routes = read('../../routes/sidebar-routes.tsx')
  const lazyPages = read('../../routes/lazy-pages.tsx')

  for (const path of [
    'datasets/:datasetId/experiment-reports/:reportId',
    'datasets/:datasetId/experiments/aggregate',
    'datasets/:datasetId/experiments/compare',
  ]) {
    assert.ok(routes.includes(`path: '${path}'`), path)
  }

  for (const page of [
    'ExperimentReportDetail',
    'ExperimentAggregate',
    'ExperimentCompare',
  ]) {
    assert.ok(lazyPages.includes(page), page)
  }
})

test('service report detail exposes scores rounds samples and failures', () => {
  const source = read(
    '../../modules/scene-experiments/views/experiment-report-detail.tsx'
  )

  for (const label of [
    '评分结果',
    '多轮稳定性',
    '样本结果',
    '失败调用',
    '执行轮次',
  ]) {
    assert.ok(source.includes(label), label)
  }
  assert.ok(source.includes("role='progressbar'"))
  assert.ok(source.includes('aria-valuenow={report.progress}'))
})

test('aggregate and compare pages render insights and score difference threshold', () => {
  const aggregate = read(
    '../../modules/scene-experiments/views/experiment-aggregate.tsx'
  )
  const compare = read(
    '../../modules/scene-experiments/views/experiment-compare.tsx'
  )

  assert.ok(aggregate.includes('智能聚合结论'))
  assert.ok(aggregate.includes('差异样本'))
  assert.ok(aggregate.includes('aggregateExperimentReports'))
  assert.ok(compare.includes('0.03'))
  assert.ok(compare.includes('高亮差异'))
  assert.ok(compare.includes('compareExperimentReports'))
})

test('report detail aggregate and compare pages return to their navigation source', () => {
  for (const path of [
    '../../modules/scene-experiments/views/experiment-report-detail.tsx',
    '../../modules/scene-experiments/views/experiment-aggregate.tsx',
    '../../modules/scene-experiments/views/experiment-compare.tsx',
  ]) {
    const source = read(path)

    assert.ok(source.includes('useParams'), path)
    assert.ok(source.includes('useSearchParams'), path)
    assert.ok(source.includes('buildExperimentReturnHref'), path)
    assert.ok(source.includes("source: searchParams.get('source')"), path)
    assert.ok(source.includes('navigate(returnHref)'), path)
    assert.ok(!source.includes('?tab=reports'), path)
  }
})
