import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { db } from '../../../mock/_data.ts'
import datasetRoutes from '../../../mock/datasets.ts'
import sceneExperimentRoutes from '../../../mock/scene-experiments.ts'

test('mock scenes include reusable dataset evaluator and execution defaults', () => {
  const scenes = db.scenes as Array<{
    enabled: boolean
    supportsScheduledExecution: boolean
    defaultScheduledWebhookIds: string[]
    datasetId: string
    evaluatorIds: string[]
    webhooks: Array<{ id: string }>
    runParameters: {
      concurrency: number
      timeoutSeconds: number
      retryCount: number
      rounds: number
    }
  }>
  assert.ok(scenes.length >= 2)
  assert.ok(scenes.some((scene) => scene.enabled === true))
  for (const scene of scenes) {
    assert.equal(typeof scene.datasetId, 'string')
    assert.equal(typeof scene.supportsScheduledExecution, 'boolean')
    assert.ok(Array.isArray(scene.defaultScheduledWebhookIds))
    assert.ok(scene.datasetId.length > 0)
    assert.ok(
      Array.isArray(scene.evaluatorIds) && scene.evaluatorIds.length > 0
    )
    assert.ok(Array.isArray(scene.webhooks) && scene.webhooks.length > 0)
    if (scene.supportsScheduledExecution) {
      assert.ok(
        scene.defaultScheduledWebhookIds.length > 0 &&
          scene.defaultScheduledWebhookIds.every((id) =>
            scene.webhooks.some((webhook) => webhook.id === id)
          )
      )
    }
    assert.equal(typeof scene.runParameters.concurrency, 'number')
    assert.equal(typeof scene.runParameters.timeoutSeconds, 'number')
    assert.equal(typeof scene.runParameters.retryCount, 'number')
    assert.equal(typeof scene.runParameters.rounds, 'number')
    assert.ok(scene.runParameters.rounds >= 1)
  }
})

test('mock experiment reports preserve scene service and evaluator snapshots', () => {
  const reports = db.experimentReports as Array<{
    status: string
    sceneSnapshot: { name: string }
    webhookSnapshot: { name: string }
    evaluatorSnapshots: unknown[]
    scoreResults: unknown[]
    roundResults: unknown[]
    itemResults: unknown[]
  }>
  assert.ok(reports.length >= 3)
  const report = reports.find((item) => item.status === 'COMPLETED')
  assert.ok(report)
  assert.equal(typeof report.sceneSnapshot.name, 'string')
  assert.equal(typeof report.webhookSnapshot.name, 'string')
  assert.ok(Array.isArray(report.evaluatorSnapshots))
  assert.ok(Array.isArray(report.scoreResults))
  assert.ok(Array.isArray(report.roundResults))
  assert.ok(Array.isArray(report.itemResults))
})

test('API registry and mock routes expose scene experiment endpoints', () => {
  const registry = readFileSync(
    new URL('../../api/registry.ts', import.meta.url),
    'utf8'
  )
  const mockRoutes = readFileSync(
    new URL('../../../mock/scene-experiments.ts', import.meta.url),
    'utf8'
  )

  for (const alias of [
    'getProjectScenes',
    'createProjectScene',
    'getProjectScene',
    'updateProjectScene',
    'deleteProjectScene',
    'createDatasetExperiment',
    'getDatasetExperimentReports',
    'getExperimentReport',
    'aggregateExperimentReports',
    'compareExperimentReports',
    'getExperimentReportBaselines',
    'setExperimentReportBaseline',
  ]) {
    assert.ok(registry.includes(`${alias}:`), alias)
  }

  assert.ok(mockRoutes.includes("url: '/api/projects/:projectId/scenes'"))
  assert.ok(
    mockRoutes.includes(
      "url: '/api/projects/:projectId/datasets/:datasetId/experiments'"
    )
  )
  assert.ok(mockRoutes.includes('item.projectId !== projectId(req)'))
  assert.ok(mockRoutes.includes('所选评估器不属于当前项目'))
  assert.ok(
    mockRoutes.includes(
      "url: '/api/projects/:projectId/datasets/:datasetId/experiment-report-baselines'"
    )
  )
  assert.ok(
    mockRoutes.includes(
      "url: '/api/projects/:projectId/experiment-report-baselines'"
    )
  )
  assert.ok(mockRoutes.includes('evaluatorIds: input.evaluatorIds ?? []'))
  assert.ok(mockRoutes.includes("datasetId: input.datasetId ?? ''"))
  assert.ok(
    /supportsScheduledExecution:\s*input\.supportsScheduledExecution \?\? false/.test(
      mockRoutes
    )
  )
  assert.ok(
    mockRoutes.includes(
      'defaultScheduledWebhookIds: input.defaultScheduledWebhookIds ?? []'
    )
  )
})

test('mock scene creation echoes scheduled execution configuration', () => {
  const route = sceneExperimentRoutes.find(
    (item) =>
      item.method === 'post' && item.url === '/api/projects/:projectId/scenes'
  )
  assert.ok(route)

  const originalScenes = structuredClone(db.scenes)
  try {
    const response = route.response({
      url: '/api/projects/proj_a/scenes',
      body: {
        name: '定时执行场景',
        supportsScheduledExecution: true,
        defaultScheduledWebhookIds: [
          'webhook_schedule_default',
          'webhook_schedule_backup',
        ],
        webhooks: [{ id: 'webhook_schedule_default' }],
      },
    })

    assert.equal(response.code, 0)
    assert.equal(response.data.supportsScheduledExecution, true)
    assert.deepEqual(response.data.defaultScheduledWebhookIds, [
      'webhook_schedule_default',
      'webhook_schedule_backup',
    ])
  } finally {
    db.scenes = originalScenes
  }
})

test('mock baseline seeds link a completed report within its exact scope', () => {
  const baselines = db.experimentReportBaselines as Array<{
    projectId: string
    datasetId: string
    sceneId: string
    serviceFamily: string
    reportId: string
  }>
  assert.ok(baselines.length >= 1)

  const baseline = baselines[0]
  const report = db.experimentReports.find(
    (item: { id: string }) => item.id === baseline.reportId
  )
  assert.ok(report)
  assert.equal(report.status, 'COMPLETED')
  assert.equal(report.projectId, baseline.projectId)
  assert.equal(report.datasetId, baseline.datasetId)
  assert.equal(report.sceneId, baseline.sceneId)
  assert.equal(report.webhookSnapshot.serviceFamily, baseline.serviceFamily)
})

test('mock baseline API replaces the same scope and preserves other scopes', () => {
  const getRoute = sceneExperimentRoutes.find(
    (item) =>
      item.method === 'get' &&
      item.url ===
        '/api/projects/:projectId/datasets/:datasetId/experiment-report-baselines'
  )
  const setRoute = sceneExperimentRoutes.find(
    (item) =>
      item.method === 'put' &&
      item.url === '/api/projects/:projectId/experiment-report-baselines'
  )
  assert.ok(getRoute)
  assert.ok(setRoute)

  const originalBaselines = structuredClone(db.experimentReportBaselines)
  const otherScope = {
    id: 'baseline_retrieval_test',
    projectId: 'proj_a',
    datasetId: 'dataset_qa',
    sceneId: 'scene_knowledge_retrieval',
    serviceFamily: 'retrieval-agent',
    reportId: 'experiment_report_running',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
  }
  db.experimentReportBaselines.push(otherScope)

  try {
    const response = setRoute.response({
      url: '/api/projects/proj_a/experiment-report-baselines',
      body: { reportId: 'experiment_report_v23' },
    })
    assert.equal(response.code, 0)
    assert.equal(response.data.reportId, 'experiment_report_v23')
    assert.equal(
      db.experimentReportBaselines.filter(
        (baseline: typeof otherScope) =>
          baseline.datasetId === 'dataset_qa' &&
          baseline.sceneId === 'scene_customer_full_loop' &&
          baseline.serviceFamily === 'support-agent'
      ).length,
      1
    )
    assert.ok(
      db.experimentReportBaselines.some(
        (baseline: typeof otherScope) => baseline.id === otherScope.id
      )
    )

    const listResponse = getRoute.response({
      url: '/api/projects/proj_a/datasets/dataset_qa/experiment-report-baselines',
    })
    assert.equal(listResponse.code, 0)
    assert.ok(
      listResponse.data.some(
        (baseline: typeof otherScope) =>
          baseline.reportId === 'experiment_report_v23'
      )
    )
  } finally {
    db.experimentReportBaselines = originalBaselines
  }
})

test('mock baseline API rejects reports that are not completed', () => {
  const setRoute = sceneExperimentRoutes.find(
    (item) =>
      item.method === 'put' &&
      item.url === '/api/projects/:projectId/experiment-report-baselines'
  )
  assert.ok(setRoute)

  const response = setRoute.response({
    url: '/api/projects/proj_a/experiment-report-baselines',
    body: { reportId: 'experiment_report_running' },
  })

  assert.equal(response.code, 2010)
  assert.equal(response.message, '仅已完成报告可设为基线')
})

test('mock experiment creation rejects evaluators outside current project', () => {
  const route = sceneExperimentRoutes.find(
    (item) =>
      item.method === 'post' &&
      item.url === '/api/projects/:projectId/datasets/:datasetId/experiments'
  )
  assert.ok(route)

  const baseEvaluator = db.evaluators[0]
  const temporaryEvaluators = [
    { ...baseEvaluator, id: 'eval_global_test', projectId: null },
    { ...baseEvaluator, id: 'eval_other_test', projectId: 'proj_b' },
  ]
  db.evaluators.push(...temporaryEvaluators)

  try {
    for (const evaluatorId of temporaryEvaluators.map((item) => item.id)) {
      const response = route.response({
        url: '/api/projects/proj_a/datasets/dataset_qa/experiments',
        body: {
          name: '项目归属校验',
          sceneId: 'scene_customer_full_loop',
          webhookIds: ['webhook_support_v23'],
          evaluatorIds: [evaluatorId],
          runParameters: {
            concurrency: 1,
            timeoutSeconds: 30,
            retryCount: 0,
            rounds: 1,
          },
        },
      })

      assert.equal(response.code, 2008)
      assert.equal(response.message, '所选评估器不属于当前项目')
    }
  } finally {
    db.evaluators = db.evaluators.filter(
      (item: { id: string }) =>
        !temporaryEvaluators.some((temporary) => temporary.id === item.id)
    )
  }
})

test('mock dataset list honors lowercase dataset type filters', () => {
  const route = datasetRoutes.find(
    (item) =>
      item.method === 'get' && item.url === '/api/projects/:projectId/datasets'
  )
  assert.ok(route)
  assert.ok(
    db.datasets.every((dataset: { type: string }) =>
      ['evaluation', 'badcase', 'golden', 'anomaly'].includes(dataset.type)
    )
  )

  const originalDatasets = structuredClone(db.datasets)
  db.datasets.push({
    ...db.datasets[0],
    id: 'dataset_badcase_filter_test',
    type: 'badcase',
  })

  try {
    const response = route.response({
      url: '/api/projects/proj_a/datasets',
      query: { page: 1, pageSize: 20, type: 'badcase' },
    })
    assert.equal(response.code, 0)
    assert.deepEqual(
      response.data.datas.map((dataset: { id: string }) => dataset.id),
      ['dataset_badcase_filter_test']
    )
  } finally {
    db.datasets = originalDatasets
  }
})

test('mock report endpoints enforce project and dataset analysis scope', () => {
  const detailRoute = sceneExperimentRoutes.find(
    (item) =>
      item.method === 'get' &&
      item.url === '/api/projects/:projectId/experiment-reports/:reportId'
  )
  const aggregateRoute = sceneExperimentRoutes.find(
    (item) =>
      item.method === 'post' &&
      item.url === '/api/projects/:projectId/experiment-reports/aggregate'
  )
  const compareRoute = sceneExperimentRoutes.find(
    (item) =>
      item.method === 'post' &&
      item.url === '/api/projects/:projectId/experiment-reports/compare'
  )
  assert.ok(detailRoute)
  assert.ok(aggregateRoute)
  assert.ok(compareRoute)

  const completed = db.experimentReports.find(
    (report: { status: string }) => report.status === 'COMPLETED'
  )
  assert.ok(completed)
  const originalReports = structuredClone(db.experimentReports)
  const crossDatasetReport = {
    ...structuredClone(completed),
    id: 'experiment_report_cross_dataset_test',
    datasetId: 'dataset_other',
  }
  db.experimentReports.push(crossDatasetReport)

  try {
    const wrongProjectDetail = detailRoute.response({
      url: `/api/projects/proj_other/experiment-reports/${completed.id}`,
    })
    assert.equal(wrongProjectDetail.code, 2003)

    for (const route of [aggregateRoute, compareRoute]) {
      const wrongProject = route.response({
        url: '/api/projects/proj_other/experiment-reports/analysis',
        body: { reportIds: [completed.id, crossDatasetReport.id] },
      })
      assert.notEqual(wrongProject.code, 0)

      const crossDataset = route.response({
        url: '/api/projects/proj_a/experiment-reports/analysis',
        body: { reportIds: [completed.id, crossDatasetReport.id] },
      })
      assert.notEqual(crossDataset.code, 0)
    }
  } finally {
    db.experimentReports = originalReports
  }
})
