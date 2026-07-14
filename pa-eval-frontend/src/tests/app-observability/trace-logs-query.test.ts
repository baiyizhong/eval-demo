import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DataTableQueryState } from '../../components/common/data-table/data-table.tsx'
import { buildTraceListQuery } from '../../modules/app-observability/views/trace-logs-query.ts'

const baseState: DataTableQueryState = {
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
}

test('trace logs query defaults to the last 1 day when no time filter is selected', () => {
  const query = buildTraceListQuery(baseState, 'project-1')

  assert.equal(query.timeRange, '1d')
  assert.equal(query.createdAtRange, undefined)
})

test('trace logs query does not apply default time range when keyword is active', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      keyword: 'trace_legacy_001',
    },
    'project-1'
  )

  assert.equal(query.timeRange, undefined)
})

test('trace logs query does not apply default time range when advanced filters are active', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      filters: {
        sessionId: 'session_legacy',
      },
    },
    'project-1'
  )

  assert.equal(query.timeRange, undefined)
  assert.equal(query.sessionId, 'session_legacy')
})

test('trace logs query uses quick time range when selected', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      filters: {
        timeRange: '14d',
      },
    },
    'project-1'
  )

  assert.equal(query.timeRange, '14d')
  assert.equal(query.createdAtRange, undefined)
})

test('trace logs query keeps an explicit quick time range with keyword search', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      keyword: 'trace_legacy_001',
      filters: {
        timeRange: '3d',
      },
    },
    'project-1'
  )

  assert.equal(query.timeRange, '3d')
})

test('trace logs query keeps an explicit createdAtRange instead of defaulting to quick time range', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      filters: {
        createdAtRange: ['2026-07-05 00:00:00', '2026-07-05 23:59:59'],
        timeRange: '7d',
      },
    },
    'project-1'
  )

  assert.deepEqual(query.createdAtRange, [
    '2026-07-05 00:00:00',
    '2026-07-05 23:59:59',
  ])
  assert.equal(query.timeRange, undefined)
})

test('trace logs query serializes multiple metadata filters as API JSON', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      filters: {
        metadataFilters: [
          { key: 'businessId', operator: 'contains', value: 'ticket' },
          { key: 'priority', operator: 'equals', value: 'high' },
        ],
      },
    },
    'project-1'
  )

  assert.ok(query.metadataFilters)
  assert.deepEqual(JSON.parse(query.metadataFilters), [
    { key: 'businessId', operator: 'contains', value: 'ticket' },
    { key: 'priority', operator: 'equals', value: 'high' },
  ])
})

test('trace logs query serializes score filters as API JSON', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      filters: {
        categoricalScoreFilters: [
          { name: 'category', operator: 'equals', value: 'passed' },
          { name: 'reason', operator: 'contains', value: '准确' },
        ],
        numericScoreFilters: [
          { name: 'quality', operator: 'gte', value: '0.8' },
          { name: 'invalid', operator: 'lte', value: 'not-a-number' },
        ],
      },
    },
    'project-1'
  )

  assert.ok(query.categoricalScoreFilters)
  assert.ok(query.numericScoreFilters)
  assert.deepEqual(JSON.parse(query.categoricalScoreFilters), [
    { name: 'category', operator: 'equals', value: 'passed' },
    { name: 'reason', operator: 'contains', value: '准确' },
  ])
  assert.deepEqual(JSON.parse(query.numericScoreFilters), [
    { name: 'quality', operator: 'gte', value: '0.8' },
  ])
})

test('trace logs query serializes score queue id filter', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      filters: {
        scoreQueueId: 'queue-1',
      },
    },
    'project-1'
  )

  assert.equal(query.scoreQueueId, 'queue-1')
  assert.equal(query.timeRange, undefined)
})

test('trace logs query forwards selected response fields', () => {
  const query = buildTraceListQuery(
    {
      ...baseState,
      filters: {
        fields: 'core,io',
      },
    },
    'project-1'
  )

  assert.equal(query.fields, 'core,io')
})
