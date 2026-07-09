import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ApiMethod } from '@/api/types'
import {
  countProjectAutoEvaluationTraces,
  createProjectAutoEvaluationTask,
  listProjectAutoEvaluationTracePreview,
  pauseProjectAutoEvaluationSchedule,
  startProjectAutoEvaluationSchedule,
} from './auto-evaluation-api.ts'

test('createProjectAutoEvaluationTask sends task variable mapping', async () => {
  const captured: { requestBody?: Record<string, unknown> } = {}
  const api = {
    async createAutoEvaluationTask(input: { body: Record<string, unknown> }) {
      captured.requestBody = input.body
      return { id: 'task-1' }
    },
  }

  await createProjectAutoEvaluationTask(api as never, 'project-1', {
    name: '任务',
    description: '每日质量评测',
    scoreName: 'quality',
    evaluatorId: 'eval-1',
    sampleRate: 100,
    dataSource: { type: 'DATASET', datasetId: 'dataset-1' },
    variableMapping: {
      input: '{{ sample.input }}',
      output: '{{ sample.output }}',
    },
    reportTemplateId: 'default',
  })

  assert.deepEqual(captured.requestBody?.variableMapping, {
    input: '{{ sample.input }}',
    output: '{{ sample.output }}',
  })
})

test('createProjectAutoEvaluationTask sends selected report template', async () => {
  const captured: { requestBody?: Record<string, unknown> } = {}
  const api = {
    async createAutoEvaluationTask(input: { body: Record<string, unknown> }) {
      captured.requestBody = input.body
      return { id: 'task-1' }
    },
  }

  await createProjectAutoEvaluationTask(api as never, 'project-1', {
    name: '任务',
    description: '每日质量评测',
    scoreName: 'quality',
    evaluatorId: 'eval-1',
    sampleRate: 100,
    dataSource: { type: 'DATASET', datasetId: 'dataset-1' },
    variableMapping: {},
    reportTemplateId: 'template-1',
  })

  assert.equal(captured.requestBody?.reportTemplateId, 'template-1')
})

test('createProjectAutoEvaluationTask sends scheduled run configuration', async () => {
  const captured: { requestBody?: Record<string, unknown> } = {}
  const api = {
    async createAutoEvaluationTask(input: { body: Record<string, unknown> }) {
      captured.requestBody = input.body
      return { id: 'task-1' }
    },
  }

  const schedule = {
    frequency: 'DAILY' as const,
    executionHour: 2,
    timezone: 'Asia/Shanghai',
    window: {
      mode: 'previous_day' as const,
      startHour: 0,
      endHour: 0,
    },
    retry: {
      maxAttempts: 3,
      backoffMinutes: [10, 30, 60],
    },
  }

  await createProjectAutoEvaluationTask(api as never, 'project-1', {
    name: '任务',
    description: '每日质量评测',
    scoreName: 'quality',
    evaluatorId: 'eval-1',
    sampleRate: 100,
    dataSource: { type: 'DATASET', datasetId: 'dataset-1' },
    variableMapping: {},
    reportTemplateId: 'template-1',
    runMode: 'SCHEDULED',
    schedule,
  })

  assert.deepEqual(captured.requestBody, {
    name: '任务',
    description: '每日质量评测',
    scoreName: 'quality',
    evaluatorId: 'eval-1',
    sampleRate: 100,
    dataSource: { type: 'DATASET', datasetId: 'dataset-1' },
    variableMapping: {},
    reportTemplateId: 'template-1',
    runMode: 'SCHEDULED',
    schedule,
    input: '用户问：怎么申请退款？',
    output: '您可以在订单详情页提交退款申请。',
    expectedOutput: '退款申请',
    context: '客服场景',
  })
})

test('createProjectAutoEvaluationTask clears schedule for immediate run', async () => {
  const captured: { requestBody?: Record<string, unknown> } = {}
  const api = {
    async createAutoEvaluationTask(input: { body: Record<string, unknown> }) {
      captured.requestBody = input.body
      return { id: 'task-1' }
    },
  }

  await createProjectAutoEvaluationTask(api as never, 'project-1', {
    name: '任务',
    description: '',
    scoreName: 'quality',
    evaluatorId: 'eval-1',
    sampleRate: 100,
    dataSource: { type: 'DATASET', datasetId: 'dataset-1' },
    variableMapping: {},
    reportTemplateId: 'template-1',
    runMode: 'IMMEDIATE',
    schedule: {
      frequency: 'DAILY',
      executionHour: 2,
      timezone: 'Asia/Shanghai',
      window: {
        mode: 'previous_day',
        startHour: 0,
        endHour: 0,
      },
      retry: {
        maxAttempts: 3,
        backoffMinutes: [10, 30, 60],
      },
    },
  })

  assert.equal(captured.requestBody?.runMode, 'IMMEDIATE')
  assert.equal(captured.requestBody?.schedule, null)
})

test('startProjectAutoEvaluationSchedule calls start schedule api', async () => {
  const captured: { request?: Parameters<ApiMethod>[0] } = {}
  const api = {
    async startAutoEvaluationSchedule<TResponse = unknown>(
      input?: Parameters<ApiMethod>[0]
    ) {
      captured.request = input
      return { id: 'task-1' } as TResponse
    },
  }

  await startProjectAutoEvaluationSchedule(api, 'project-1', 'task-1')

  assert.deepEqual(captured.request, {
    path: { projectId: 'project-1', taskId: 'task-1' },
  })
})

test('pauseProjectAutoEvaluationSchedule calls pause schedule api', async () => {
  const captured: { request?: Parameters<ApiMethod>[0] } = {}
  const api = {
    async pauseAutoEvaluationSchedule<TResponse = unknown>(
      input?: Parameters<ApiMethod>[0]
    ) {
      captured.request = input
      return { id: 'task-1' } as TResponse
    },
  }

  await pauseProjectAutoEvaluationSchedule(api, 'project-1', 'task-1')

  assert.deepEqual(captured.request, {
    path: { projectId: 'project-1', taskId: 'task-1' },
  })
})

test('countProjectAutoEvaluationTraces sends trace filter body', async () => {
  const captured: { requestBody?: Record<string, unknown> } = {}
  const api = {
    async countProjectTraces(input: { body: Record<string, unknown> }) {
      captured.requestBody = input.body
      return { count: 3 }
    },
  }

  const result = await countProjectAutoEvaluationTraces(
    api as never,
    'project-1',
    {
      type: 'TRACE_FILTER',
      timeRange: '3d',
      createdAtRange: ['2026-07-05T00:00', '2026-07-08T00:00'],
      environments: ['production'],
      userId: '',
      sessionId: '',
      tags: ['refund'],
      estimatedCount: 0,
    }
  )

  assert.equal(result.count, 3)
  assert.deepEqual(captured.requestBody, {
    traceFilter: {
      type: 'TRACE_FILTER',
      timeRange: '3d',
      createdAtRange: ['2026-07-05T00:00', '2026-07-08T00:00'],
      environments: ['production'],
      userId: '',
      sessionId: '',
      tags: ['refund'],
      estimatedCount: 0,
    },
  })
})

test('listProjectAutoEvaluationTracePreview maps trace filter to trace list query', async () => {
  const captured: { request?: Record<string, unknown> } = {}
  const api = {
    async listProjectTraces(input: Record<string, unknown>) {
      captured.request = input
      return { total: 2, datas: [] }
    },
  }

  await listProjectAutoEvaluationTracePreview(api as never, 'project-1', {
    type: 'TRACE_FILTER',
    timeRange: '3d',
    createdAtRange: ['2026-07-05T00:00', '2026-07-08T00:00'],
    environments: [],
    userId: 'user-1',
    sessionId: 'session-1',
    tags: ['vip'],
    estimatedCount: 9,
  })

  assert.deepEqual(captured.request, {
    path: { projectId: 'project-1' },
    query: {
      page: 1,
      pageSize: 100,
      createdAtRange: ['2026-07-05T00:00', '2026-07-08T00:00'],
      userId: 'user-1',
      sessionId: 'session-1',
      tags: ['vip'],
    },
  })
})
