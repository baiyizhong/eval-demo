import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

test('scene page defaults to experiments and exposes both function tabs', () => {
  const source = read('../../modules/scene-experiments/views/scenes.tsx')

  assert.ok(source.includes('normalizeSceneExperimentTab'))
  assert.ok(source.includes("tab === 'management'"))
  assert.ok(source.includes('试验报告'))
  assert.ok(source.includes('场景管理'))
  assert.ok(source.includes('运行试验'))
  assert.ok(source.includes('刷新'))
  assert.ok(source.includes('新增场景'))
  assert.ok(source.includes('ProjectExperimentReports'))
  assert.ok(source.includes('SceneManagementTable'))
  assert.ok(
    !source.includes(
      "leading={<h1 className='text-lg font-semibold'>场景试验</h1>}"
    )
  )
  assert.ok(source.includes('setExperimentDrawerOpen(true)'))
  assert.ok(source.includes('consumeSceneCreateRequest'))
  assert.ok(source.includes('onCreateRequestConsumed'))
  assert.ok(source.includes("can('project:dataset:edit')"))
  assert.ok(source.includes('canEditScenes'))
  assert.ok(!source.includes("datasetId=''"))
})

test('dataset quick experiment entry requires edit permission and keeps tab in URL', () => {
  const source = read('../../modules/app-evaluation/views/dataset-detail.tsx')

  assert.match(source, /canEditDataset[\s\S]*id: 'run-scene-experiment'/)
  assert.ok(source.includes('setSearchParams'))
  assert.ok(source.includes("nextParams.set('tab', value)"))
  assert.ok(source.includes("handleTabChange('reports')"))
  assert.ok(!source.includes('const [activeTab, setActiveTab] = useState'))
})

test('dataset step supports project selection and locked dataset summary', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-dataset-step.tsx'
  )
  assert.ok(source.includes('RadioGroup'))
  assert.ok(source.includes('listProjectDatasets'))
  assert.ok(source.includes('搜索数据集名称或描述'))
  assert.ok(source.includes('数据集类型'))
  assert.ok(source.includes('当前数据集已锁定'))
  assert.ok(source.includes('onValueChange'))
  assert.ok(source.includes('resolveDatasetSelection'))
  assert.ok(source.includes('getProjectDataset'))
  assert.ok(source.includes('onNavigateToDatasetManagement'))
  assert.ok(!source.includes('<Link'))
  assert.ok(!source.includes("from 'react-router'"))
  assert.ok(!source.includes('onKeyDown'))
  assert.ok(!source.includes('onFocus'))
})

test('experiment drawer clears dataset picker params on open and close', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-run-drawer.tsx'
  )

  assert.ok(source.includes('clearExperimentDatasetPickerParams'))
  assert.ok(source.includes('useSearchParams'))
  assert.ok(source.includes('closeDrawer'))
  assert.ok(source.includes('handleOpenDatasetManagement'))
  assert.match(
    source,
    /handleOpenDatasetManagement[\s\S]*createMutation\.isPending[\s\S]*setSearchParams[\s\S]*replace: true[\s\S]*onOpenChange\(false\)[\s\S]*navigate\(buildProjectDatasetsHref\(projectId\)\)/
  )
  assert.ok(source.includes('onNavigateToDatasetManagement'))
  assert.ok(!source.includes('shouldActivateDatasetSelection'))
})

test('execution configuration exposes separate webhook and run parameter steps', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-execution-step.tsx'
  )
  assert.ok(source.includes('ExperimentWebhookStep'))
  assert.ok(source.includes('ExperimentRunParametersStep'))
  assert.ok(source.includes('选择 Webhook 服务'))
  assert.ok(source.includes('运行参数'))
  assert.ok(!source.includes('lg:grid-cols-2'))
  assert.ok(source.includes('执行轮次'))
})

test('project report table loads the project source and polls only active reports', () => {
  const source = read(
    '../../modules/scene-experiments/components/project-experiment-reports.tsx'
  )

  assert.ok(source.includes('loadProjectExperimentSource'))
  assert.ok(source.includes('listAllProjectDatasets'))
  assert.ok(source.includes('listAllDatasetExperimentReports'))
  assert.ok(source.includes('listExperimentReportBaselines'))
  assert.ok(source.includes("queryKey: ['project-experiment-source'"))
  assert.match(
    source,
    /refetchInterval:\s*\(query\)[\s\S]*reports\.some[\s\S]*'QUEUED'[\s\S]*'RUNNING'[\s\S]*'SCORING'[\s\S]*\? 1500[\s\S]*: false/
  )
})

test('project report table distinguishes report failures from baseline failures', () => {
  const source = read(
    '../../modules/scene-experiments/components/project-experiment-reports.tsx'
  )

  assert.ok(source.includes("failure.resource === 'reports'"))
  assert.ok(source.includes('reportFailures.length === source.datasets.length'))
  assert.ok(source.includes('项目试验报告加载失败'))
  assert.ok(source.includes('部分数据集报告加载失败'))
  assert.ok(
    !source.includes('source.datasets.length === source.failedDatasets.length')
  )
})

test('project report table exposes filters, in-memory paging, baseline and analysis contracts', () => {
  const source = read(
    '../../modules/scene-experiments/components/project-experiment-reports.tsx'
  )

  assert.ok(source.includes('queryProjectExperimentReports'))
  assert.ok(source.includes('async (state)'))
  assert.ok(source.includes('source.reports'))
  assert.ok(source.includes("pageKey: 'experimentPage'"))
  assert.ok(source.includes("pageSizeKey: 'experimentPageSize'"))
  assert.ok(source.includes("globalFilterKey: 'experimentKeyword'"))
  assert.ok(source.includes("sortKey: 'experimentSort'"))
  assert.ok(source.includes("fieldId: 'datasetId'"))
  assert.ok(source.includes("fieldId: 'status'"))
  assert.ok(source.includes('datasetName'))
  for (const status of [
    'QUEUED',
    'RUNNING',
    'SCORING',
    'COMPLETED',
    'FAILED',
  ]) {
    assert.ok(source.includes(status), status)
  }

  assert.ok(source.includes('ExperimentBaselineDialog'))
  assert.ok(source.includes('setExperimentReportBaseline'))
  assert.ok(source.includes("queryKey: ['project-experiment-source'"))
  assert.ok(source.includes('findMatchingBaseline'))
  assert.ok(source.includes('canAggregateReports'))
  assert.match(
    source,
    /resolveExperimentReportSelection\(\{[\s\S]*selectedReports,[\s\S]*selection,[\s\S]*loadAllMatching/
  )
  assert.ok(source.includes('resolveExperimentReportSelection'))
  assert.ok(
    source.includes('聚合报告需选择同一数据集、同一次试验的至少两份已完成报告')
  )
  assert.match(
    source,
    /if \(!canAggregateReports\(reports\)\)[\s\S]*buildExperimentAnalysisHref\(\{[\s\S]*datasetId: reports\[0\]\.datasetId/
  )
  assert.ok(source.includes('canCompareReports'))
  assert.ok(source.includes('datasetId: report.datasetId'))
  assert.ok(source.includes("source: 'project'"))
  assert.ok(source.includes('同一数据集、同一场景、同一服务系列'))
  assert.ok(source.includes("failure.resource === 'baselines'"))
  assert.ok(source.includes('getBaselineUnavailableReason'))
  assert.ok(source.includes('基线加载失败'))
  assert.match(
    source,
    /queryKey:[\s\S]*'project-experiment-report-view'[\s\S]*source\.reports[\s\S]*state/
  )
  assert.ok(source.includes('当前项目暂无场景试验报告'))
})

test('shared report columns support project and dataset navigation sources', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-report-columns.tsx'
  )

  assert.ok(source.includes('showDataset'))
  assert.ok(source.includes('getDatasetName'))
  assert.ok(source.includes('datasetName'))
  assert.ok(source.includes('buildExperimentReportHref'))
  assert.ok(source.includes('datasetId: row.original.datasetId'))
  assert.ok(source.includes('source: options.source'))
})
