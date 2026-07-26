import assert from 'node:assert/strict'
import { test } from 'node:test'
import annotationMockRoutes from '../../../mock/annotations.ts'

function findRoute(url: string, method: string) {
  const route = annotationMockRoutes.find(
    (item) => item.url === url && item.method === method
  )

  assert.ok(route, `${method.toUpperCase()} ${url} mock route should exist`)
  return route
}

test('annotation queue item list mock returns table-ready source snapshots', () => {
  const route = findRoute(
    '/api/projects/:projectId/annotation-queues/:queueId/items',
    'get'
  )

  const response = route.response({
    params: { projectId: 'proj_a', queueId: 'queue_support' },
    query: { page: 1, pageSize: 10 },
  })

  assert.equal(response.code, 0)
  assert.ok(response.data.datas.length > 0)
  assert.equal(response.data.datas[0].objectId, 'trace_001')
  assert.equal(response.data.datas[0].objectType, 'TRACE')
  assert.equal(response.data.datas[0].source.title, '客服问答链路')
})
