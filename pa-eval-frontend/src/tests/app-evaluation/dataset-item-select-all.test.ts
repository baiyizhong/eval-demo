import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const detailSource = readFileSync(
  'src/modules/app-evaluation/views/dataset-detail.tsx',
  'utf8'
)
const bulkActionsSource = readFileSync(
  'src/modules/app-evaluation/components/dataset-item-bulk-actions.tsx',
  'utf8'
)

test('dataset detail passes cross-page selection state to bulk actions', () => {
  assert.match(detailSource, /bulkActions=\{[\s\S]*\(table, selection\) =>/)
  assert.match(detailSource, /selection=\{selection\}/)
  assert.match(bulkActionsSource, /selection: DataTableSelectionState/)
  assert.match(
    bulkActionsSource,
    /<DataTableBulkActions[\s\S]*selection=\{selection\}/
  )
})

test('dataset cross-page export uses the async job with the filter snapshot', () => {
  assert.match(bulkActionsSource, /selection\.isAllMatchingRowsSelected/)
  assert.match(bulkActionsSource, /selection\.queryState/)
  assert.match(bulkActionsSource, /onExportAllMatching/)
  assert.match(bulkActionsSource, /selection\.selectedRowCount/)
  assert.match(bulkActionsSource, /selection\.clearSelection\(\)/)
  assert.match(detailSource, /createProjectDatasetExportJob/)
  assert.match(detailSource, /pollDatasetExportJob/)
  assert.match(detailSource, /downloadProjectDatasetExportJob/)
})

test('ordinary dataset item selection keeps the local selected-item export', () => {
  assert.match(
    bulkActionsSource,
    /buildDatasetItemExportWorkbookBlob\(selectedItems\)/
  )
})
