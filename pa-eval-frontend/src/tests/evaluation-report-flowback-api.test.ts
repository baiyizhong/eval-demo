import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProjectEvaluationReportFlowback,
  previewProjectEvaluationReportFlowback,
} from '../modules/app-evaluation/api/evaluation-report-api.ts'

test('evaluation report flowback api helpers call real preview and create endpoints', async () => {
  const calls: unknown[] = []
  const input = {
    flowbackType: 'BADCASE' as const,
    range: 'SELECTED' as const,
    selectedItemIds: ['badcase-1'],
    targetDataset: { mode: 'EXISTING' as const, datasetId: 'dataset-1' },
    dedupeStrategy: 'SKIP_DUPLICATE' as const,
  }
  const api = {
    async previewEvaluationReportFlowback(options: unknown) {
      calls.push(['preview', options])
      return { matchedCount: 1, duplicateCount: 0, willCreateCount: 1 }
    },
    async createEvaluationReportFlowback(options: unknown) {
      calls.push(['create', options])
      return { id: 'flowback-1', successCount: 1 }
    },
  }

  await previewProjectEvaluationReportFlowback(
    api as never,
    'project-1',
    'report-1',
    input
  )
  await createProjectEvaluationReportFlowback(
    api as never,
    'project-1',
    'report-1',
    input
  )

  assert.deepEqual(calls, [
    [
      'preview',
      {
        path: { projectId: 'project-1', reportId: 'report-1' },
        body: input,
      },
    ],
    [
      'create',
      {
        path: { projectId: 'project-1', reportId: 'report-1' },
        body: input,
      },
    ],
  ])
})
