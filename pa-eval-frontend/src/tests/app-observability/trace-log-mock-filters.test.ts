import assert from 'node:assert/strict'
import { test } from 'node:test'
import { db } from '../../../mock/_data.ts'
import observabilityRoutes from '../../../mock/observability.ts'

test('trace log mock list filters by trace createdAt range', () => {
  const route = observabilityRoutes.find(
    (item) =>
      item.url === '/api/projects/:projectId/traces' && item.method === 'get'
  )

  assert.ok(route)

  const response = route.response({
    url: '/api/projects/proj_a/traces',
    query: {
      createdAtRange: ['2000-01-01 00:00', '2000-01-01 03:00'],
    },
  })

  assert.equal(response.data.total, 0)
  assert.deepEqual(response.data.datas, [])
})

test('trace log mock list filters JSON input and output by required key', () => {
  const route = observabilityRoutes.find(
    (item) =>
      item.url === '/api/projects/:projectId/traces' && item.method === 'get'
  )
  const trace = db.traces.find(
    (item: { traceId?: string }) => item.traceId === 'trace_001'
  )

  assert.ok(route)
  assert.ok(trace)

  const originalInput = trace.input
  const originalOutput = trace.output
  try {
    trace.input = JSON.stringify({ question: '如何重置密码？' })
    trace.output = { answer: '请在账户设置中重置密码。' }

    const response = route.response({
      url: '/api/projects/proj_a/traces',
      query: {
        inputFilters: JSON.stringify([
          { key: 'question', operator: 'contains', value: '重置密码' },
        ]),
        outputFilters: JSON.stringify([
          { key: 'answer', operator: 'exists', value: '' },
        ]),
      },
    })

    assert.equal(response.data.total, 1)
    assert.equal(response.data.datas[0].traceId, 'trace_001')

    trace.input = 'plain text'
    const nonJsonResponse = route.response({
      url: '/api/projects/proj_a/traces',
      query: {
        inputFilters: JSON.stringify([
          { key: 'question', operator: 'contains', value: 'plain' },
        ]),
      },
    })
    assert.equal(nonJsonResponse.data.total, 0)
  } finally {
    trace.input = originalInput
    trace.output = originalOutput
  }
})
