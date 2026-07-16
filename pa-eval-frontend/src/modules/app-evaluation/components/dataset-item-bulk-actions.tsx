import type { Table } from '@tanstack/react-table'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DataTableBulkActions } from '@/components/common/data-table'
import type { DatasetItemRecord, DatasetRecord } from '../types'
import {
  buildDatasetItemExportWorkbookBlob,
  getDatasetExportFileName,
} from '../lib/dataset-item-export'
import { downloadBlob } from './format'

type DatasetItemBulkActionsProps = {
  table: Table<DatasetItemRecord>
  dataset: DatasetRecord
}

export function DatasetItemBulkActions({
  table,
  dataset,
}: DatasetItemBulkActionsProps) {
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedItems = selectedRows.map((row) => row.original)

  const handlePartialExport = async () => {
    downloadBlob(
      buildDatasetItemExportWorkbookBlob(selectedItems),
      getDatasetExportFileName(dataset, 'xlsx')
    )
    toast.success(`已部分导出 ${selectedItems.length} 条数据项`)
  }

  return (
    <DataTableBulkActions table={table} entityName='数据项'>
      <Button
        type='button'
        size='sm'
        variant='outline'
        onClick={() => {
          void handlePartialExport()
        }}
      >
        <Download data-icon='inline-start' />
        部分导出数据集
      </Button>
    </DataTableBulkActions>
  )
}
