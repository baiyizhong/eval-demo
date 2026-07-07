import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addProjectTracesToDatasetTarget } from '../modules/app-observability/api/trace-dataset-api.ts'

test('trace dataset helper adds traces to an existing dataset', async () => {
  const calls: unknown[] = []
  const api = {
    async createProjectDataset(options: unknown) {
      calls.push(['create-dataset', options])
      return { id: 'dataset-new' }
    },
    async addProjectTracesToDataset(options: unknown) {
      calls.push(['add-traces', options])
      return { datasetId: 'dataset-1', successCount: 2, failureCount: 0 }
    },
  }

  await addProjectTracesToDatasetTarget(api as never, 'project-1', {
    mode: 'existing',
    datasetId: 'dataset-1',
    traceIds: ['trace-1', 'trace-2'],
  })

  assert.deepEqual(calls, [
    [
      'add-traces',
      {
        path: { projectId: 'project-1' },
        body: {
          datasetId: 'dataset-1',
          traceIds: ['trace-1', 'trace-2'],
        },
      },
    ],
  ])
})

test('trace dataset helper creates an evaluation dataset before adding traces', async () => {
  const calls: unknown[] = []
  const api = {
    async createProjectDataset(options: unknown) {
      calls.push(['create-dataset', options])
      return { id: 'dataset-new' }
    },
    async addProjectTracesToDataset(options: unknown) {
      calls.push(['add-traces', options])
      return { datasetId: 'dataset-new', successCount: 2, failureCount: 0 }
    },
  }

  await addProjectTracesToDatasetTarget(api as never, 'project-1', {
    mode: 'create',
    name: 'Trace 评测集',
    description: '来自 Trace 日志批量创建',
    datasetType: 'evaluation',
    traceIds: ['trace-1', 'trace-2'],
  })

  assert.deepEqual(calls, [
    [
      'create-dataset',
      {
        path: { projectId: 'project-1' },
        body: {
          name: 'Trace 评测集',
          type: 'evaluation',
          description: '来自 Trace 日志批量创建',
          metadata: {
            type: 'evaluation',
            source: 'trace_log_bulk',
          },
          inputSchema: {},
          expectedOutputSchema: {},
        },
      },
    ],
    [
      'add-traces',
      {
        path: { projectId: 'project-1' },
        body: {
          datasetId: 'dataset-new',
          traceIds: ['trace-1', 'trace-2'],
        },
      },
    ],
  ])
})
