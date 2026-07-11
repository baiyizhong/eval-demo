import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/common/data-table'
import type { AnnotationQueueItemRecord } from '../types'
import { AnnotationObjectTypeBadge } from './annotation-object-type-badge'
import { AnnotationStatusBadge } from './annotation-status-badge'
import { formatDateTime } from './format'

type CreateAnnotationQueueItemColumnsOptions = {
  projectId: string
  queueId: string
  canEdit?: boolean
  onDelete?: (item: AnnotationQueueItemRecord) => void
}

export function createAnnotationQueueItemColumns({
  projectId,
  queueId,
  canEdit,
  onDelete,
}: CreateAnnotationQueueItemColumnsOptions): ColumnDef<AnnotationQueueItemRecord>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='全选标注数据'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='选择标注数据'
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='数据 ID' />
      ),
      cell: ({ row }) =>
        canEdit ? (
          <Link
            to={`/projects/${projectId}/evaluation/annotation-queues/${queueId}/items/${row.original.id}/annotate`}
            className='font-mono text-xs underline-offset-4 hover:underline'
          >
            {row.original.id}
          </Link>
        ) : (
          <span className='font-mono text-xs'>{row.original.id}</span>
        ),
      enableHiding: false,
    },
    {
      accessorKey: 'objectType',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='类型' />
      ),
      cell: ({ row }) => (
        <AnnotationObjectTypeBadge objectType={row.original.objectType} />
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'objectId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='源数据 ID' />
      ),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.objectId}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => <AnnotationStatusBadge status={row.original.status} />,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'completedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='完成时间' />
      ),
      cell: ({ row }) =>
        row.original.completedAt
          ? formatDateTime(row.original.completedAt)
          : '-',
    },
    {
      accessorKey: 'assignee',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='处理人' />
      ),
      cell: ({ row }) => row.original.assignee?.name ?? '-',
      enableSorting: false,
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex items-center justify-end gap-2'>
          {canEdit ? (
            <Button asChild size='sm' variant='outline'>
              <Link
                to={`/projects/${projectId}/evaluation/annotation-queues/${queueId}/items/${row.original.id}/annotate`}
              >
                {row.original.status === 'COMPLETED' ? '查看/编辑' : '标注'}
              </Link>
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => onDelete(row.original)}
            >
              删除
            </Button>
          ) : null}
        </div>
      ),
    },
  ]
}
