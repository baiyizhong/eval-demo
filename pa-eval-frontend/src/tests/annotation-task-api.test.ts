import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildInitialTraceAnnotationTaskProgress,
  createTraceAnnotationTask,
} from '../modules/app-evaluation/api/annotation-api.ts'

type RecordedCall = [string, unknown]

test('trace annotation helper builds an initial progress state immediately', () => {
  assert.deepEqual(buildInitialTraceAnnotationTaskProgress(1200), {
    queueId: '',
    totalCount: 1200,
    completedCount: 0,
    createdCount: 0,
    skippedCount: 0,
    percent: 0,
    status: 'running',
  })
})

test('trace annotation helper uses import job for one thousand traces', async () => {
  const calls: RecordedCall[] = []
  const traceIds = Array.from(
    { length: 1000 },
    (_, index) => `trace-${index + 1}`
  )
  const progressValues: number[] = []
  const api = {
    async createTraceAnnotationTask(options: unknown) {
      calls.push(['create-task', options])
      throw new Error('large annotation task should use jobs')
    },
    async createProjectTraceAnnotationTaskJob(options: unknown) {
      calls.push(['create-job', options])
      return {
        id: 'job-1',
        queueId: 'queue-1',
        status: 'PENDING',
        totalCount: traceIds.length,
        completedCount: 0,
        createdCount: 0,
        skippedCount: 0,
        percent: 0,
      }
    },
    async getProjectTraceAnnotationTaskJob(options: unknown) {
      calls.push(['get-job', options])
      return {
        id: 'job-1',
        queueId: 'queue-1',
        status: 'SUCCEEDED',
        totalCount: traceIds.length,
        completedCount: traceIds.length,
        createdCount: traceIds.length,
        skippedCount: 0,
        percent: 100,
      }
    },
  }

  const result = await createTraceAnnotationTask(
    api as never,
    'project-1',
    traceIds,
    {
      queueId: 'queue-1',
      pollIntervalMs: 0,
      onProgress: (progress) => progressValues.push(progress.percent),
    }
  )

  assert.deepEqual(
    calls.map(([name]) => name),
    ['create-job', 'get-job']
  )
  assert.deepEqual(progressValues, [0, 100])
  assert.equal(result.queueId, 'queue-1')
  assert.equal(result.createdCount, 1000)
  assert.equal(result.skippedCount, 0)
  assert.equal(result.traceCount, 1000)
})

test('trace annotation helper submits a filter snapshot and enforces polling timeout', async () => {
  const calls: RecordedCall[] = []
  const api = {
    async createTraceAnnotationTask() {
      throw new Error('filter selection must use a job')
    },
    async createProjectTraceAnnotationTaskJob(options: unknown) {
      calls.push(['create-job', options])
      return {
        id: 'job-filter',
        queueId: 'queue-1',
        status: 'PENDING',
        totalCount: 53499,
        completedCount: 0,
        createdCount: 0,
        skippedCount: 0,
        percent: 0,
      }
    },
    async getProjectTraceAnnotationTaskJob() {
      throw new Error('timeout should happen before polling')
    },
  }

  await assert.rejects(
    createTraceAnnotationTask(
      api as never,
      'project-1',
      {
        type: 'FILTER',
        filters: { timeRange: '7d', statuses: ['failed'] },
        excludedTraceIds: [],
        totalCount: 53499,
      },
      {
        queueId: 'queue-1',
        pollIntervalMs: 0,
        timeoutMs: 0,
      }
    ),
    /处理时间较长/
  )
  assert.deepEqual(calls[0], [
    'create-job',
    {
      path: { projectId: 'project-1' },
      body: {
        selection: {
          type: 'FILTER',
          filters: { timeRange: '7d', statuses: ['failed'] },
          excludedTraceIds: [],
        },
        queueId: 'queue-1',
      },
    },
  ])
})
