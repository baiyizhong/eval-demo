import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countProjectAutoEvaluationTraces,
  createProjectAutoEvaluationTask,
  listProjectAutoEvaluationTracePreview,
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
    description: '',
    scoreName: 'quality',
    scoreMapping: {
      quality_score: {
        scoreConfigId: 'score-config-quality',
        scoreConfigName: '回答质量',
      },
    },
    evaluatorId: 'eval-1',
    sampleRate: 100,
    badcase: {
      enabled: true,
      scoreName: '',
      operator: 'LTE',
      threshold: 0.6,
    },
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
  assert.deepEqual(captured.requestBody?.scoreMapping, {
    quality_score: {
      scoreConfigId: 'score-config-quality',
      scoreConfigName: '回答质量',
    },
  })
  assert.deepEqual(captured.requestBody?.badcase, {
    enabled: true,
    scoreName: '',
    operator: 'LTE',
    threshold: 0.6,
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
    description: '',
    scoreName: 'quality',
    scoreMapping: {},
    evaluatorId: 'eval-1',
    sampleRate: 100,
    badcase: {
      enabled: true,
      scoreName: '',
      operator: 'LTE',
      threshold: 0.6,
    },
    dataSource: { type: 'DATASET', datasetId: 'dataset-1' },
    variableMapping: {},
    reportTemplateId: 'template-1',
  })

  assert.equal(captured.requestBody?.reportTemplateId, 'template-1')
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
      pageSize: 10,
      createdAtRange: ['2026-07-05T00:00', '2026-07-08T00:00'],
      userId: 'user-1',
      sessionId: 'session-1',
      tags: ['vip'],
    },
  })
})

test('listProjectAutoEvaluationTracePreview keeps quick time range when custom range is incomplete', async () => {
  const captured: { request?: Record<string, unknown> } = {}
  const api = {
    async listProjectTraces(input: Record<string, unknown>) {
      captured.request = input
      return { total: 2, datas: [] }
    },
  }

  await listProjectAutoEvaluationTracePreview(
    api as never,
    'project-1',
    {
      type: 'TRACE_FILTER',
      timeRange: '',
      createdAtRange: ['2026-07-05T00:00', ''],
      environments: [],
      userId: '',
      sessionId: '',
      tags: [],
      estimatedCount: 9,
    },
    { page: 3, pageSize: 20 }
  )

  assert.deepEqual(captured.request, {
    path: { projectId: 'project-1' },
    query: {
      page: 3,
      pageSize: 20,
      timeRange: '1d',
    },
  })
})
