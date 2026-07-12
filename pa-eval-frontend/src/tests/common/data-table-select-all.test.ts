import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const dataTableSource = readFileSync(
  new URL('../../components/common/data-table/data-table.tsx', import.meta.url),
  'utf8'
)
const selectAllBannerSource = readFileSync(
  new URL(
    '../../components/common/data-table/select-all-banner.tsx',
    import.meta.url
  ),
  'utf8'
)
const traceBulkActionsSource = readFileSync(
  new URL(
    '../../modules/app-observability/components/trace-log-bulk-actions.tsx',
    import.meta.url
  ),
  'utf8'
)

test('data table select-all banner uses Chinese copy for page and cross-page selection', () => {
  assert.match(selectAllBannerSource, /已选择本页全部/)
  assert.match(selectAllBannerSource, /选择符合当前筛选条件的全部/)
  assert.match(selectAllBannerSource, /已选择符合当前筛选条件的全部/)
  assert.match(selectAllBannerSource, /清除选择/)
})

test('data table passes cross-page selection state to bulk actions', () => {
  assert.match(dataTableSource, /isAllMatchingRowsSelected/)
  assert.match(dataTableSource, /bulkActions\(table, selectionState\)/)
})

test('trace bulk actions fetch all filtered traces with backend max page size when cross-page selection is active', () => {
  assert.match(traceBulkActionsSource, /TRACE_SELECT_ALL_PAGE_SIZE = 200/)
  assert.match(traceBulkActionsSource, /selection\.isAllMatchingRowsSelected/)
  assert.match(traceBulkActionsSource, /pageSize: TRACE_SELECT_ALL_PAGE_SIZE/)
})
