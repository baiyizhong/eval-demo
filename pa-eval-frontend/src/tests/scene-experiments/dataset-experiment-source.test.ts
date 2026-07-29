import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

test('dataset detail exposes data items and experiment reports tabs', () => {
  const source = read('../../modules/app-evaluation/views/dataset-detail.tsx')

  assert.ok(source.includes('运行试验'))
  assert.ok(source.includes('数据项'))
  assert.ok(source.includes('试验报告'))
  assert.ok(source.includes('ExperimentRunDrawer'))
  assert.ok(source.includes('DatasetExperimentReports'))
  assert.ok(source.includes('getDatasetExperimentReportsQueryKey'))
  assert.match(
    source,
    /onCreated=\{async \(\) => \{[\s\S]*queryClient\.invalidateQueries[\s\S]*handleTabChange\('reports'\)/
  )
})

test('experiment run drawer contains the approved six-step workflow', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-run-drawer.tsx'
  )

  for (const label of [
    '选择场景',
    '选择数据集',
    '选择评估器',
    'Webhook 服务配置',
    '运行参数配置',
    '确认执行',
  ]) {
    assert.ok(source.includes(label), label)
  }

  assert.ok(source.includes('lockedDataset'))
  assert.ok(source.includes('ExperimentDatasetStep'))
  assert.ok(source.includes('ExperimentWebhookStep'))
  assert.ok(source.includes('ExperimentRunParametersStep'))
  assert.ok(!source.includes("title: '执行配置'"))
  assert.ok(source.includes("mode='enhanced'"))
  assert.ok(source.includes('预计调用量'))
  assert.ok(source.includes('estimateExperimentCalls'))
  assert.ok(source.includes('selectedWebhookIds'))
  assert.ok(source.includes('selectedEvaluatorIds'))
  assert.ok(source.includes('listActiveProjectEvaluators'))
  assert.ok(source.includes('filterSceneBoundEvaluators'))
  assert.ok(source.includes('selectedDataset!.id'))
  assert.ok(!source.includes('nextScene.evaluatorIds'))
})

test('experiment run drawer places webhook before evaluator without changing step content', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-run-drawer.tsx'
  )

  assert.match(
    source,
    /const experimentSteps = \[[\s\S]*id: 'webhook'[\s\S]*id: 'evaluator'/
  )
  assert.match(
    source,
    /step === 2[\s\S]*<ExperimentWebhookStep[\s\S]*step === 3[\s\S]*title='选择评估器'/
  )
  assert.match(
    source,
    /targetStep > 2[\s\S]*selectedWebhookIds\.length === 0[\s\S]*setStep\(2\)/
  )
  assert.match(
    source,
    /targetStep > 3[\s\S]*validSelectedEvaluatorIds\.length === 0[\s\S]*setStep\(3\)/
  )
})

test('dataset report table supports completed-only selection and analysis actions', () => {
  const source = read(
    '../../modules/scene-experiments/components/dataset-experiment-reports.tsx'
  )
  const columns = read(
    '../../modules/scene-experiments/components/experiment-report-columns.tsx'
  )
  const dialog = read(
    '../../modules/scene-experiments/components/experiment-baseline-dialog.tsx'
  )

  assert.ok(source.includes('聚合报告'))
  assert.ok(source.includes('对比分析'))
  assert.ok(source.includes('canAggregateReports'))
  assert.ok(source.includes('canCompareReports'))
  assert.ok(source.includes('refetchInterval'))
  assert.ok(source.includes('listExperimentReportBaselines'))
  assert.ok(source.includes('setExperimentReportBaseline'))
  assert.ok(source.includes('useMutation'))
  assert.ok(source.includes('ExperimentBaselineDialog'))
  assert.ok(source.includes('基线设置成功'))
  assert.ok(source.includes('基线替换成功'))
  assert.ok(source.includes("queryKey: ['experiment-report-baselines'"))
  assert.ok(source.includes("'dataset-experiment-reports'"))
  assert.ok(source.includes('queryClient.invalidateQueries'))
  assert.ok(source.includes('buildExperimentAnalysisHref'))
  assert.match(
    source,
    /resolveExperimentReportSelection\(\{[\s\S]*selectedReports,[\s\S]*selection,[\s\S]*loadAllMatching/
  )
  assert.ok(source.includes('listAllMatchingDatasetExperimentReports'))
  assert.ok(source.includes('resolveExperimentReportSelection'))
  assert.ok(source.includes("source: 'dataset'"))
  assert.ok(source.includes('datasetId: report.datasetId'))
  assert.ok(source.includes('当前数据集暂无试验报告'))
  assert.ok(columns.includes("status === 'COMPLETED'"))
  assert.ok(columns.includes('buildExperimentReportHref'))
  assert.ok(columns.includes('datasetId: row.original.datasetId'))
  assert.ok(columns.includes('source: options.source'))
  assert.ok(columns.includes('getBaselineUnavailableReason'))
  assert.ok(source.includes('基线加载中'))
  assert.ok(source.includes('基线不可用'))
  assert.ok(columns.includes('评分结果'))
  assert.ok(columns.includes('执行轮次'))
  assert.ok(columns.includes('设为基线'))
  assert.ok(columns.includes('当前基线'))
  assert.ok(columns.includes('对比基线'))
  assert.ok(columns.includes('设为新基线'))
  assert.ok(columns.includes('DropdownMenu'))
  assert.ok(columns.includes('ChevronDown'))
  assert.ok(columns.includes('w-[94px]'))
  assert.equal(columns.match(/h-\[30px\]/g)?.length, 5)
  assert.ok(!columns.includes("className='h-8 w-[94px]'"))
  assert.ok(columns.includes("tdClassName: 'w-[118px]"))
  assert.ok(!columns.includes('ArrowUpRight'))
  assert.ok(dialog.includes('ExperimentBaselineDialog'))
  assert.ok(dialog.includes('FormDialog'))
  assert.ok(dialog.includes('替换当前基线'))
  assert.ok(dialog.includes('确认设为基线'))
  assert.ok(dialog.includes('确认替换'))
  assert.ok(dialog.includes('报告名称'))
  assert.ok(dialog.includes('调用服务'))
  assert.ok(dialog.includes('评分结果'))
  assert.ok(dialog.includes('currentBaselinePending'))
  assert.ok(dialog.includes('currentBaselineError'))
  assert.ok(dialog.includes('当前基线报告加载失败'))
})
