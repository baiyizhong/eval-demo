import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { resolveAnnotationQueueSelectedItems } from '../../modules/app-evaluation/lib/annotation-queue-selection.ts'

const detailSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
  'utf8'
)
const bulkActionsSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx',
  'utf8'
)

test('annotation queue detail passes cross-page selection state to bulk actions', () => {
  assert.match(detailSource, /bulkActions=\{\(table, selection\) =>/)
  assert.match(detailSource, /selection=\{selection\}/)
  assert.match(bulkActionsSource, /selection: DataTableSelectionState/)
  assert.match(
    bulkActionsSource,
    /<DataTableBulkActions[\s\S]*selection=\{selection\}/
  )
})

test('annotation queue bulk actions resolve all matching pages and clear semantic selection', () => {
  assert.match(bulkActionsSource, /resolveAnnotationQueueSelectedItems/)
  assert.match(bulkActionsSource, /selection\.selectedRowCount/)
  assert.match(bulkActionsSource, /selection\.clearSelection\(\)/)
  assert.doesNotMatch(bulkActionsSource, /table\.resetRowSelection\(\)/)
})

test('ordinary selection returns current selected items without fetching', async () => {
  const selectedItems = [{ id: 'item-1' }, { id: 'item-2' }]
  let fetchCount = 0

  const result = await resolveAnnotationQueueSelectedItems({
    selectedItems,
    selection: {
      isAllMatchingRowsSelected: false,
      totalRowCount: 12,
      queryState: {
        page: 1,
        pageSize: 10,
        keyword: '',
        filters: {},
        sorting: [],
      },
    },
    fetchPage: async () => {
      fetchCount += 1
      return { total: 0, datas: [] }
    },
  })

  assert.equal(fetchCount, 0)
  assert.deepEqual(result, selectedItems)
})

test('cross-page selection fetches every matching item with the filter snapshot', async () => {
  const receivedQueries: Array<{ page: number; pageSize: number }> = []
  const allItems = Array.from({ length: 5_001 }, (_, index) => ({
    id: `item-${index + 1}`,
  }))

  const result = await resolveAnnotationQueueSelectedItems({
    selectedItems: allItems.slice(0, 10),
    selection: {
      isAllMatchingRowsSelected: true,
      totalRowCount: allItems.length,
      queryState: {
        page: 3,
        pageSize: 10,
        keyword: '客服',
        filters: { status: ['PENDING'] },
        sorting: [],
      },
    },
    fetchPage: async (query) => {
      receivedQueries.push({ page: query.page, pageSize: query.pageSize })
      const start = (query.page - 1) * query.pageSize
      return {
        total: allItems.length,
        datas: allItems.slice(start, start + query.pageSize),
      }
    },
  })

  assert.deepEqual(receivedQueries, [
    { page: 1, pageSize: 5_000 },
    { page: 2, pageSize: 5_000 },
  ])
  assert.equal(result.length, 5_001)
  assert.equal(result[0]?.id, 'item-1')
  assert.equal(result[result.length - 1]?.id, 'item-5001')
})
