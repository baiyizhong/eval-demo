import assert from 'node:assert/strict'
import { test } from 'node:test'
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
