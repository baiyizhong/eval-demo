import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  countProjectAutoEvaluationTraces,
  createProjectAutoEvaluationTask,
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
    description: '',
    scoreName: 'quality',
    evaluatorId: 'eval-1',
    sampleRate: 100,
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
      timeRange: '24h',
      environments: ['production'],
      traceName: 'refund',
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
      timeRange: '24h',
      environments: ['production'],
      traceName: 'refund',
      userId: '',
      sessionId: '',
      tags: ['refund'],
      estimatedCount: 0,
    },
  })
})
