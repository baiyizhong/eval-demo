import type { Table } from '@tanstack/react-table'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DataTableBulkActions } from '@/components/common/data-table'
import { exportProjectDatasetItemsMock } from '../api/mock-dataset-api'
import type { DatasetItemRecord } from '../types'
import { downloadJson } from './format'

type DatasetItemBulkActionsProps = {
  table: Table<DatasetItemRecord>
  projectId: string
  datasetId: string
}

export function DatasetItemBulkActions({
  table,
  projectId,
  datasetId,
}: DatasetItemBulkActionsProps) {
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const itemIds = selectedRows.map((row) => row.original.id)

  const handlePartialExport = async () => {
    const payload = await exportProjectDatasetItemsMock(
      projectId,
      datasetId,
      itemIds
    )
    downloadJson(
      `dataset-items-${datasetId}-${payload.items.length}-${Date.now()}.json`,
      payload
    )
    toast.success(`已部分导出 ${payload.items.length} 条数据项`)
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
