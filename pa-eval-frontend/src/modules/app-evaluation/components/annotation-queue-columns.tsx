import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { LongText } from '@/components/common/long-text'
import { scoreDataTypeLabels, type AnnotationQueueRecord } from '../types'
import { AnnotationQueueRowActions } from './annotation-queue-row-actions'
import { formatDateTime } from './format'

type CreateAnnotationQueueColumnsOptions = {
  projectId: string
  readOnly?: boolean
  onEdit: (queue: AnnotationQueueRecord) => void
  onDelete: (queue: AnnotationQueueRecord) => void
}

export function createAnnotationQueueColumns({
  projectId,
  readOnly,
  onEdit,
  onDelete,
}: CreateAnnotationQueueColumnsOptions): ColumnDef<AnnotationQueueRecord>[] {
  const columns: ColumnDef<AnnotationQueueRecord>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='任务名称' />
      ),
      cell: ({ row }) => (
        <Link
          to={`/projects/${projectId}/evaluation/annotation-queues/${row.original.id}`}
          className='font-medium underline-offset-4 hover:underline'
        >
          {row.original.name}
        </Link>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='任务描述' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-72'>
          {row.original.description || '-'}
        </LongText>
      ),
    },
    {
      accessorKey: 'completedCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='已完成数量' />
      ),
      cell: ({ row }) => row.original.completedCount,
    },
    {
      accessorKey: 'pendingCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='待处理数量' />
      ),
      cell: ({ row }) => row.original.pendingCount,
    },
    {
      accessorKey: 'scoreConfigs',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='评分指标' />
      ),
      cell: ({ row }) => (
        <div className='flex max-w-80 flex-wrap gap-1'>
          {row.original.scoreConfigs.map((config) => (
            <Badge key={config.id} variant='secondary'>
              {config.name} · {scoreDataTypeLabels[config.dataType]}
            </Badge>
          ))}
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'assignees',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='处理人' />
      ),
      cell: ({ row }) =>
        row.original.assignees.length
          ? row.original.assignees.map((user) => user.name).join('、')
          : '-',
      enableSorting: false,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='创建时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: 'process',
      header: '处理',
      cell: ({ row }) => (
        <div className='flex gap-2'>
          <Button asChild size='sm'>
            <Link
              to={`/projects/${projectId}/evaluation/annotation-queues/${row.original.id}`}
            >
              {row.original.completedCount >= 1 ? '继续标注' : '开始标注'}
            </Link>
          </Button>
        </div>
      ),
      enableHiding: false,
    },
  ]

  if (!readOnly) {
    columns.push({
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <AnnotationQueueRowActions
          row={row}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ),
    })
  }

  return columns
}
