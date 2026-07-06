import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  queueToolbarFilters,
  queueUrlFilters,
} from '../../modules/app-evaluation/views/annotation-queue-filters.ts'
import {
  reportToolbarFilters,
  reportUrlFilters,
} from '../../modules/app-evaluation/views/evaluation-report-filters.ts'

test('人工标注列表筛选绑定到真实表格列', () => {
  assert.deepEqual(
    queueUrlFilters.map((filter) => ({
      fieldId: filter.fieldId,
      columnId: filter.columnId,
    })),
    [
      { fieldId: 'assigneeIds', columnId: 'assignees' },
      { fieldId: 'pendingState', columnId: 'pendingCount' },
    ]
  )
  assert.deepEqual(
    queueToolbarFilters.map((filter) => filter.columnId),
    ['pendingCount', 'assignees']
  )
})

test('评测报告 Badcase 筛选绑定到真实表格列', () => {
  assert.deepEqual(
    reportUrlFilters.map((filter) => ({
      fieldId: filter.fieldId,
      columnId: filter.columnId ?? filter.fieldId,
    })),
    [
      { fieldId: 'sourceType', columnId: 'sourceType' },
      { fieldId: 'status', columnId: 'status' },
      { fieldId: 'hasBadcase', columnId: 'badcaseCount' },
    ]
  )
  assert.deepEqual(
    reportToolbarFilters.map((filter) => filter.columnId),
    ['sourceType', 'status', 'badcaseCount']
  )
})
