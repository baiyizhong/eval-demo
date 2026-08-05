import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildExperimentBaselineScopeKey,
  buildExperimentReportName,
  buildScoreResultKey,
  canAggregateReports,
  canCompareReports,
  findMatchingBaseline,
  isCurrentBaselineReport,
} from '../../modules/scene-experiments/lib/experiment-rules.ts'

test('buildExperimentReportName combines experiment and service names', () => {
  assert.equal(
    buildExperimentReportName('客服 Agent 回归', '客服 Agent v2.3'),
    '客服 Agent 回归 - 客服 Agent v2.3'
  )
})

test('buildScoreResultKey distinguishes duplicate evaluator variables', () => {
  assert.equal(
    buildScoreResultKey('eval_accuracy', 'accuracy'),
    'eval_accuracy:accuracy'
  )
})

test('canAggregateReports requires completed reports from one experiment group', () => {
  assert.equal(
    canAggregateReports([
      {
        status: 'COMPLETED',
        datasetId: 'dataset_a',
        experimentGroupId: 'group_a',
      },
      {
        status: 'COMPLETED',
        datasetId: 'dataset_a',
        experimentGroupId: 'group_a',
      },
    ]),
    true
  )
  assert.equal(
    canAggregateReports([
      {
        status: 'COMPLETED',
        datasetId: 'dataset_a',
        experimentGroupId: 'group_a',
      },
      {
        status: 'COMPLETED',
        datasetId: 'dataset_a',
        experimentGroupId: 'group_b',
      },
    ]),
    false
  )
})

test('canAggregateReports rejects one experiment group across datasets', () => {
  assert.equal(
    canAggregateReports([
      {
        status: 'COMPLETED',
        datasetId: 'dataset_a',
        experimentGroupId: 'group_shared',
      },
      {
        status: 'COMPLETED',
        datasetId: 'dataset_b',
        experimentGroupId: 'group_shared',
      },
    ]),
    false
  )
})

test('canCompareReports requires completed reports from one scene and service family', () => {
  assert.equal(
    canCompareReports([
      {
        status: 'COMPLETED',
        datasetId: 'dataset_qa',
        sceneId: 'scene_support',
        serviceFamily: 'support-agent',
      },
      {
        status: 'COMPLETED',
        datasetId: 'dataset_qa',
        sceneId: 'scene_support',
        serviceFamily: 'support-agent',
      },
    ]),
    true
  )
  assert.equal(
    canCompareReports([
      {
        status: 'COMPLETED',
        datasetId: 'dataset_qa',
        sceneId: 'scene_support',
        serviceFamily: 'support-agent',
      },
      {
        status: 'RUNNING',
        datasetId: 'dataset_qa',
        sceneId: 'scene_support',
        serviceFamily: 'support-agent',
      },
    ]),
    false
  )
  assert.equal(
    canCompareReports([
      {
        status: 'COMPLETED',
        datasetId: 'dataset_a',
        sceneId: 'scene_support',
        serviceFamily: 'support-agent',
      },
      {
        status: 'COMPLETED',
        datasetId: 'dataset_b',
        sceneId: 'scene_support',
        serviceFamily: 'support-agent',
      },
    ]),
    false
  )
})

test('canCompareReports defensively rejects candidates without dataset ids', () => {
  const missingDatasetCandidates = [
    {
      status: 'COMPLETED',
      sceneId: 'scene_support',
      serviceFamily: 'support-agent',
    },
    {
      status: 'COMPLETED',
      sceneId: 'scene_support',
      serviceFamily: 'support-agent',
    },
  ] as unknown as Parameters<typeof canCompareReports>[0]

  assert.equal(canCompareReports(missingDatasetCandidates), false)

  const compareCandidatesWithoutDataset = () =>
    canCompareReports([
      // @ts-expect-error datasetId is required for every compare candidate
      {
        status: 'COMPLETED',
        sceneId: 'scene_support',
        serviceFamily: 'support-agent',
      },
      // @ts-expect-error datasetId is required for every compare candidate
      {
        status: 'COMPLETED',
        sceneId: 'scene_support',
        serviceFamily: 'support-agent',
      },
    ])

  assert.equal(typeof compareCandidatesWithoutDataset, 'function')
})

test('buildExperimentBaselineScopeKey includes dataset scene and service family', () => {
  assert.equal(
    buildExperimentBaselineScopeKey({
      datasetId: 'dataset_qa',
      sceneId: 'scene_support',
      serviceFamily: 'support-agent',
    }),
    'dataset_qa:scene_support:support-agent'
  )
})

test('findMatchingBaseline only matches the same dataset scene and service family', () => {
  const baselines = [
    {
      id: 'baseline_support',
      projectId: 'proj_a',
      datasetId: 'dataset_qa',
      sceneId: 'scene_support',
      serviceFamily: 'support-agent',
      reportId: 'report_v21',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    },
  ]

  const matching = findMatchingBaseline(baselines, {
    datasetId: 'dataset_qa',
    sceneId: 'scene_support',
    webhookSnapshot: { serviceFamily: 'support-agent' },
  })
  const differentScene = findMatchingBaseline(baselines, {
    datasetId: 'dataset_qa',
    sceneId: 'scene_retrieval',
    webhookSnapshot: { serviceFamily: 'support-agent' },
  })
  const differentService = findMatchingBaseline(baselines, {
    datasetId: 'dataset_qa',
    sceneId: 'scene_support',
    webhookSnapshot: { serviceFamily: 'retrieval-agent' },
  })

  assert.equal(matching?.id, 'baseline_support')
  assert.equal(differentScene, undefined)
  assert.equal(differentService, undefined)
})

test('isCurrentBaselineReport checks the linked report id', () => {
  const baseline = {
    id: 'baseline_support',
    projectId: 'proj_a',
    datasetId: 'dataset_qa',
    sceneId: 'scene_support',
    serviceFamily: 'support-agent',
    reportId: 'report_v21',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
  }

  assert.equal(isCurrentBaselineReport('report_v21', baseline), true)
  assert.equal(isCurrentBaselineReport('report_v23', baseline), false)
  assert.equal(isCurrentBaselineReport('report_v23', undefined), false)
})
