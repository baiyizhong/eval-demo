import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildExperimentAnalysisHref,
  buildExperimentReportHref,
  buildExperimentReturnHref,
  normalizeSceneExperimentTab,
} from '../../modules/scene-experiments/lib/experiment-navigation.ts'

test('scene experiment tab defaults to experiments', () => {
  assert.equal(normalizeSceneExperimentTab(null), 'experiments')
  assert.equal(normalizeSceneExperimentTab('unknown'), 'experiments')
  assert.equal(normalizeSceneExperimentTab('management'), 'management')
})

test('project report links preserve project source', () => {
  assert.equal(
    buildExperimentReportHref({
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      reportId: 'report_a',
      source: 'project',
    }),
    '/projects/proj_a/evaluation/datasets/dataset_a/experiment-reports/report_a?source=project'
  )
})

test('report links encode every dynamic path segment', () => {
  assert.equal(
    buildExperimentReportHref({
      projectId: 'proj/a ?#',
      datasetId: 'dataset/a ?#',
      reportId: 'report/a ?#',
      source: 'project',
    }),
    '/projects/proj%2Fa%20%3F%23/evaluation/datasets/dataset%2Fa%20%3F%23/experiment-reports/report%2Fa%20%3F%23?source=project'
  )
})

test('analysis links preserve report ids and source', () => {
  assert.equal(
    buildExperimentAnalysisHref({
      type: 'compare',
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      reportIds: ['report_a', 'report_b'],
      source: 'dataset',
    }),
    '/projects/proj_a/evaluation/datasets/dataset_a/experiments/compare?reportIds=report_a%2Creport_b&source=dataset'
  )
})

test('analysis links encode path segments while URLSearchParams encodes report ids', () => {
  assert.equal(
    buildExperimentAnalysisHref({
      type: 'aggregate',
      projectId: 'proj/a ?#',
      datasetId: 'dataset/a ?#',
      reportIds: ['report/a', 'report b?#'],
      source: 'project',
    }),
    '/projects/proj%2Fa%20%3F%23/evaluation/datasets/dataset%2Fa%20%3F%23/experiments/aggregate?reportIds=report%2Fa%2Creport+b%3F%23&source=project'
  )
})

test('return href follows source and falls back to dataset reports', () => {
  assert.equal(
    buildExperimentReturnHref({
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      source: 'project',
    }),
    '/projects/proj_a/scenes?tab=experiments'
  )
  assert.equal(
    buildExperimentReturnHref({
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      source: 'dataset',
    }),
    '/projects/proj_a/evaluation/datasets/dataset_a?tab=reports'
  )
  assert.equal(
    buildExperimentReturnHref({
      projectId: 'proj_a',
      datasetId: 'dataset_a',
      source: 'invalid',
    }),
    '/projects/proj_a/evaluation/datasets/dataset_a?tab=reports'
  )
})

test('return links encode project and dataset path segments', () => {
  assert.equal(
    buildExperimentReturnHref({
      projectId: 'proj/a ?#',
      datasetId: 'dataset/a ?#',
      source: 'project',
    }),
    '/projects/proj%2Fa%20%3F%23/scenes?tab=experiments'
  )
  assert.equal(
    buildExperimentReturnHref({
      projectId: 'proj/a ?#',
      datasetId: 'dataset/a ?#',
      source: 'dataset',
    }),
    '/projects/proj%2Fa%20%3F%23/evaluation/datasets/dataset%2Fa%20%3F%23?tab=reports'
  )
})
