import assert from 'node:assert/strict'
import { test } from 'node:test'
import { db } from '../../mock/_data.ts'

test('mock trace detail matches observability detail view shape', () => {
  const traces = db.traces as Array<Record<string, unknown>>
  const trace = traces.find((item) => item.traceId === 'trace_001')

  assert.equal(typeof trace?.input, 'string')
  assert.equal(typeof trace?.output, 'string')
  assert.equal(typeof trace?.projectName, 'string')
  assert.equal(typeof trace?.createdAt, 'string')
  assert.equal(typeof trace?.updatedAt, 'string')
  assert.ok(Array.isArray(trace?.callChain))
})
