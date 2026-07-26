import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getTraceQuickTimeRangeToolbarDefault,
  normalizeTraceTimeFilterValues,
} from '../../modules/app-observability/trace-time-ranges.ts'

test('custom trace time range clears quick time range', () => {
  const filters = normalizeTraceTimeFilterValues(
    {
      timeRange: '7d',
      createdAtRange: ['2026-07-01 00:00:00', '2026-07-02 00:00:00'],
    },
    { fieldId: 'createdAtRange' }
  )

  assert.deepEqual(filters.createdAtRange, [
    '2026-07-01 00:00:00',
    '2026-07-02 00:00:00',
  ])
  assert.equal(filters.timeRange, '')
})

test('quick trace time range clears custom time range', () => {
  const filters = normalizeTraceTimeFilterValues(
    {
      timeRange: '14d',
      createdAtRange: ['2026-07-01 00:00:00', '2026-07-02 00:00:00'],
    },
    { fieldId: 'timeRange' }
  )

  assert.equal(filters.timeRange, '14d')
  assert.deepEqual(filters.createdAtRange, [])
})

test('quick time toolbar default is hidden while custom time range is active', () => {
  assert.equal(
    getTraceQuickTimeRangeToolbarDefault({
      createdAtRange: ['2026-07-01 00:00:00', '2026-07-02 00:00:00'],
    }),
    undefined
  )
  assert.equal(getTraceQuickTimeRangeToolbarDefault({}), '1d')
})

test('quick time toolbar default is hidden while keyword or advanced filters are active', () => {
  assert.equal(
    getTraceQuickTimeRangeToolbarDefault({
      keyword: 'trace_legacy_001',
    }),
    undefined
  )
  assert.equal(
    getTraceQuickTimeRangeToolbarDefault({
      sessionId: 'session_legacy',
    }),
    undefined
  )
  assert.equal(
    getTraceQuickTimeRangeToolbarDefault({
      timeRange: '3d',
      keyword: 'trace_legacy_001',
    }),
    undefined
  )
})
