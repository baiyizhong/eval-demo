import type { Table } from '@tanstack/react-table'
import { Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { DataTableBulkActions } from '@/components/common/data-table'
import {
  deleteProjectAnnotationQueueItems,
  exportProjectAnnotationQueueItems,
} from '../api/annotation-api'
import type { AnnotationQueueItemRecord } from '../types'
import { downloadJson } from './format'

type AnnotationQueueItemBulkActionsProps = {
  table: Table<AnnotationQueueItemRecord>
  api: Parameters<typeof deleteProjectAnnotationQueueItems>[0]
  projectId: string
  queueId: string
  canEdit?: boolean
  onChanged: () => Promise<unknown>
}

export function AnnotationQueueItemBulkActions({
  table,
  api,
  projectId,
  queueId,
  canEdit,
  onChanged,
}: AnnotationQueueItemBulkActionsProps) {
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const itemIds = selectedRows.map((row) => row.original.id)

  const handleExport = async () => {
    const payload = await exportProjectAnnotationQueueItems(
      api,
      projectId,
      queueId,
      itemIds
    )
    downloadJson(
      `annotation-items-${queueId}-${payload.items.length}-${Date.now()}.json`,
      payload
    )
    toast.success(`已导出 ${payload.items.length} 条标注数据`)
  }

  const handleDelete = async () => {
    if (!canEdit) return

    const confirmed = await confirm({
      title: '删除选中标注数据',
      desc: `将仅移除 ${itemIds.length} 条队列数据，不删除源对象、历史评分或数据集项。确定继续吗？`,
      confirmText: '删除',
      destructive: true,
    })

    if (!confirmed) return

    await deleteProjectAnnotationQueueItems(api, projectId, queueId, itemIds)
    await onChanged()
    table.resetRowSelection()
    toast.success(`已删除 ${itemIds.length} 条标注数据`)
  }

  return (
    <DataTableBulkActions table={table} entityName='标注数据'>
      <Button
        type='button'
        size='sm'
        variant='outline'
        onClick={() => {
          void handleExport()
        }}
      >
        <Download data-icon='inline-start' />
        导出选中
      </Button>
      {canEdit ? (
        <Button
          type='button'
          size='sm'
          variant='destructive'
          onClick={() => {
            void handleDelete()
          }}
        >
          <Trash2 data-icon='inline-start' />
          删除选中
        </Button>
      ) : null}
    </DataTableBulkActions>
  )
}
