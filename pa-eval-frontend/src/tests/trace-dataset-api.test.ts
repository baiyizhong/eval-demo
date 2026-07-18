import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addProjectTracesToDatasetTarget,
  buildInitialTraceDatasetAddProgress,
} from '../modules/app-observability/api/trace-dataset-api.ts'

type RecordedCall = [string, unknown]

test('trace dataset helper builds an initial progress state immediately', () => {
  assert.deepEqual(buildInitialTraceDatasetAddProgress(1200), {
    datasetId: '',
    totalCount: 1200,
    completedCount: 0,
    batchCount: 0,
    completedBatchCount: 0,
    percent: 0,
    status: 'running',
  })
})

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

test('trace dataset helper batches large trace additions', async () => {
  const calls: RecordedCall[] = []
  const traceIds = Array.from({ length: 405 }, (_, index) => `trace-${index + 1}`)
  const api = {
    async createProjectDataset(options: unknown) {
      calls.push(['create-dataset', options])
      return { id: 'dataset-new' }
    },
    async addProjectTracesToDataset(options: {
      body: { datasetId: string; traceIds: string[] }
    }) {
      calls.push(['add-traces', options])
      return {
        datasetId: options.body.datasetId,
        successCount: options.body.traceIds.length - 1,
        failureCount: 1,
        traceCount: options.body.traceIds.length,
        itemIds: options.body.traceIds.slice(0, -1).map((traceId) => `item-${traceId}`),
        failures: [
          {
            traceId: options.body.traceIds[options.body.traceIds.length - 1] ?? '',
            reason: 'Trace 不存在或无访问权限',
          },
        ],
      }
    },
  }

  const result = await addProjectTracesToDatasetTarget(api as never, 'project-1', {
    mode: 'existing',
    datasetId: 'dataset-1',
    traceIds,
  })

  assert.equal(
    calls.filter(([name]) => name === 'add-traces').length,
    3
  )
  assert.deepEqual(
    calls
      .filter(([name]) => name === 'add-traces')
      .map(
        ([, options]) =>
          (options as { body: { traceIds: string[] } }).body.traceIds.length
      ),
    [200, 200, 5]
  )
  assert.equal(result.datasetId, 'dataset-1')
  assert.equal(result.successCount, 402)
  assert.equal(result.failureCount, 3)
  assert.equal(result.traceCount, 405)
  assert.equal(result.itemIds.length, 402)
  assert.equal(result.failures.length, 3)
})

test('trace dataset helper uses import job and reports progress for one thousand traces', async () => {
  const traceIds = Array.from({ length: 1000 }, (_, index) => `trace-${index + 1}`)
  const calls: RecordedCall[] = []
  const progressValues: number[] = []
  const api = {
    async createProjectDataset() {
      return { id: 'dataset-new' }
    },
    async addProjectTracesToDataset(options: unknown) {
      calls.push(['add-traces', options])
      throw new Error('large imports should use import jobs')
    },
    async createProjectTraceDatasetImportJob(options: unknown) {
      calls.push(['create-import-job', options])
      return {
        id: 'job-1',
        datasetId: 'dataset-1',
        status: 'PENDING',
        totalCount: traceIds.length,
        completedCount: 0,
        successCount: 0,
        failureCount: 0,
        percent: 0,
        itemIds: [],
        failures: [],
      }
    },
    async getProjectTraceDatasetImportJob(options: unknown) {
      calls.push(['get-import-job', options])
      return {
        id: 'job-1',
        datasetId: 'dataset-1',
        status: 'SUCCEEDED',
        totalCount: traceIds.length,
        completedCount: traceIds.length,
        successCount: traceIds.length,
        failureCount: 0,
        percent: 100,
        itemIds: traceIds.map((traceId) => `item-${traceId}`),
        failures: [],
      }
    },
  }

  const result = await addProjectTracesToDatasetTarget(
    api as never,
    'project-1',
    {
      mode: 'existing',
      datasetId: 'dataset-1',
      traceIds,
    },
    {
      onProgress: (progress) => {
        progressValues.push(progress.percent)
      },
      pollIntervalMs: 0,
    }
  )

  assert.deepEqual(
    calls.map(([name]) => name),
    ['create-import-job', 'get-import-job']
  )
  assert.deepEqual(progressValues, [0, 100])
  assert.equal(result.successCount, 1000)
  assert.equal(result.failureCount, 0)
})
