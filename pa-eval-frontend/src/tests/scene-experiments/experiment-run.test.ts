import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyExperimentDatasetSelection,
  applyExperimentSceneSelection,
  buildProjectDatasetsHref,
  buildProjectScenesHref,
  buildProjectTraceLogsHref,
  clearExperimentDatasetPickerParams,
  getDatasetExperimentReportsQueryKey,
  getDatasetSubmitBlockReason,
  resolveDatasetSelection,
} from '../../modules/scene-experiments/lib/experiment-run.ts'

test('dataset metrics must be ready before an experiment can be submitted', () => {
  assert.equal(
    getDatasetSubmitBlockReason({
      hasSelectedDataset: true,
      metricStatus: 'pending',
    }),
    '所选数据集指标加载中，请稍后再试'
  )
  assert.equal(
    getDatasetSubmitBlockReason({
      hasSelectedDataset: true,
      metricStatus: 'error',
    }),
    '所选数据集指标加载失败，请重试'
  )
})

test('dataset with no active items cannot create an experiment', () => {
  assert.equal(
    getDatasetSubmitBlockReason({
      hasSelectedDataset: true,
      metricStatus: 'ready',
      activeItemCount: 0,
    }),
    '所选数据集暂无有效数据项，无法发起试验'
  )
  assert.equal(
    getDatasetSubmitBlockReason({
      hasSelectedDataset: true,
      metricStatus: 'ready',
      activeItemCount: 8,
    }),
    null
  )
})

test('dataset selection resolves current page records without loading details', async () => {
  const cached = { id: 'dataset-a', name: 'A' }
  let loadCount = 0

  const result = await resolveDatasetSelection({
    datasetId: 'dataset-a',
    currentDatasets: new Map([['dataset-a', cached]]),
    loadDataset: async () => {
      loadCount += 1
      return { id: 'loaded', name: 'Loaded' }
    },
    isLatestSelection: () => true,
  })

  assert.equal(result, cached)
  assert.equal(loadCount, 0)
})

test('dataset selection loads missing records and ignores stale responses', async () => {
  const loaded = { id: 'dataset-b', name: 'B' }

  assert.equal(
    await resolveDatasetSelection({
      datasetId: 'dataset-b',
      currentDatasets: new Map(),
      loadDataset: async () => loaded,
      isLatestSelection: (datasetId) => datasetId === 'dataset-b',
    }),
    loaded
  )
  assert.equal(
    await resolveDatasetSelection({
      datasetId: 'dataset-old',
      currentDatasets: new Map(),
      loadDataset: async () => ({ id: 'dataset-old', name: 'Old' }),
      isLatestSelection: () => false,
    }),
    null
  )
})

test('dataset picker cleanup removes only picker params', () => {
  const params = new URLSearchParams(
    'tab=reports&datasetPickerPage=2&datasetPickerPageSize=5&datasetPickerKeyword=hello&datasetPickerSort=name.asc&datasetPickerType=evaluation&datasetPickerType=golden&reportPage=3'
  )

  const result = clearExperimentDatasetPickerParams(params)

  assert.equal(result.toString(), 'tab=reports&reportPage=3')
  assert.equal(params.get('datasetPickerPage'), '2')
})

test('experiment navigation paths encode every dynamic project segment', () => {
  const projectId = 'proj/a ?#'

  assert.equal(
    buildProjectScenesHref(projectId),
    '/projects/proj%2Fa%20%3F%23/scenes?tab=management'
  )
  assert.equal(
    buildProjectDatasetsHref(projectId),
    '/projects/proj%2Fa%20%3F%23/evaluation/datasets'
  )
  assert.equal(
    buildProjectTraceLogsHref(projectId, 'trace/a ?#'),
    '/projects/proj%2Fa%20%3F%23/observability/traces/logs?traceId=trace%2Fa%20%3F%23'
  )
})

test('scene selection clears evaluator and webhook choices without applying scene defaults', () => {
  const state = {
    sceneId: 'scene-old',
    selectedDatasetId: 'dataset-a',
    selectedWebhookIds: ['webhook-a'],
    selectedEvaluatorIds: ['evaluator-a'],
    runParameters: {
      concurrency: 9,
      timeoutSeconds: 90,
      retryCount: 4,
      rounds: 3,
    },
  }
  const defaults = {
    concurrency: 2,
    timeoutSeconds: 20,
    retryCount: 1,
    rounds: 2,
  }

  assert.deepEqual(
    applyExperimentSceneSelection(state, 'scene-new', {
      datasetId: 'dataset-default',
      runParameters: defaults,
    }),
    {
      sceneId: 'scene-new',
      selectedDatasetId: 'dataset-default',
      selectedWebhookIds: [],
      selectedEvaluatorIds: [],
      runParameters: defaults,
    }
  )
})

test('scene selection keeps the current dataset for dataset detail runs', () => {
  const state = {
    sceneId: 'scene-old',
    selectedDatasetId: 'dataset-locked',
    selectedWebhookIds: [],
    selectedEvaluatorIds: [],
    runParameters: {
      concurrency: 1,
      timeoutSeconds: 10,
      retryCount: 0,
      rounds: 1,
    },
  }

  assert.deepEqual(
    applyExperimentSceneSelection(
      state,
      'scene-new',
      {
        datasetId: 'dataset-scene-default',
        runParameters: {
          concurrency: 8,
          timeoutSeconds: 80,
          retryCount: 2,
          rounds: 3,
        },
      },
      { lockDataset: true }
    ),
    {
      sceneId: 'scene-new',
      selectedDatasetId: 'dataset-locked',
      selectedWebhookIds: [],
      selectedEvaluatorIds: [],
      runParameters: {
        concurrency: 8,
        timeoutSeconds: 80,
        retryCount: 2,
        rounds: 3,
      },
    }
  )
})

test('dataset selection preserves scene evaluator and execution configuration', () => {
  const state = {
    sceneId: 'scene-a',
    selectedDatasetId: 'dataset-old',
    selectedWebhookIds: ['webhook-a'],
    selectedEvaluatorIds: ['evaluator-a'],
    runParameters: {
      concurrency: 6,
      timeoutSeconds: 60,
      retryCount: 2,
      rounds: 4,
    },
  }

  assert.deepEqual(applyExperimentDatasetSelection(state, 'dataset-new'), {
    ...state,
    selectedDatasetId: 'dataset-new',
  })
})

test('dataset experiment report refresh key retains api project and dataset identity', () => {
  const api = { name: 'api' }

  assert.deepEqual(
    getDatasetExperimentReportsQueryKey(api, 'proj/a ?#', 'dataset/a ?#'),
    ['dataset-experiment-reports', api, 'proj/a ?#', 'dataset/a ?#']
  )
})
