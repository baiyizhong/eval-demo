import type { Table } from '@tanstack/react-table'
import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DataTableBulkActions,
  type DataTableQueryState,
  type DataTableSelectionState,
} from '@/components/common/data-table'
import {
  buildDatasetItemExportWorkbookBlob,
  getDatasetExportFileName,
} from '../lib/dataset-item-export'
import type { DatasetItemRecord, DatasetRecord } from '../types'
import { downloadBlob } from './format'

type DatasetItemBulkActionsProps = {
  table: Table<DatasetItemRecord>
  selection: DataTableSelectionState<DatasetItemRecord>
  dataset: DatasetRecord
  onExportAllMatching: (query: DataTableQueryState) => Promise<void>
}

export function DatasetItemBulkActions({
  table,
  selection,
  dataset,
  onExportAllMatching,
}: DatasetItemBulkActionsProps) {
  const [isExporting, setIsExporting] = useState(false)
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedItems = selectedRows.map((row) => row.original)

  const handlePartialExport = async () => {
    if (isExporting) return

    setIsExporting(true)
    try {
      if (selection.isAllMatchingRowsSelected) {
        await onExportAllMatching(selection.queryState)
        selection.clearSelection()
        return
      }

      const blob = await buildDatasetItemExportWorkbookBlob(selectedItems)
      downloadBlob(blob, getDatasetExportFileName(dataset, 'xlsx'))
      toast.success(`已导出 ${selectedItems.length} 条数据项`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '数据集导出失败')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DataTableBulkActions
      table={table}
      entityName='数据项'
      selection={selection}
    >
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={isExporting}
        onClick={() => {
          void handlePartialExport()
        }}
      >
        <Download data-icon='inline-start' />
        {isExporting ? '正在导出...' : `导出选中（${selection.selectedRowCount}）`}
      </Button>
    </DataTableBulkActions>
  )
}
