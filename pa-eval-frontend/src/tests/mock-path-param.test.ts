import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pathParam } from '../../mock/_utils.ts'

test('pathParam reads projectId from vite-plugin-mock url without params object', () => {
  assert.equal(
    pathParam({
      url: '/api/projects/proj_a/traces?page=1&pageSize=20',
      query: { page: '1', pageSize: '20' },
    }, 'projectId'),
    'proj_a'
  )
})
