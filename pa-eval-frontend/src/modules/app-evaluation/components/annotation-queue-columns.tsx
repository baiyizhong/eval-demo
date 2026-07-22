import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { HoverPreviewCell } from '@/components/common/hover-preview-cell'
import { scoreDataTypeLabels, type AnnotationQueueRecord } from '../types'
import { AnnotationQueueRowActions } from './annotation-queue-row-actions'
import { AnnotationScoreConfigBadges } from './annotation-score-config-badge'
import { formatDateTime } from './format'

type CreateAnnotationQueueColumnsOptions = {
  projectId: string
  canEdit?: boolean
  readOnly?: boolean
  onEdit: (queue: AnnotationQueueRecord) => void
  onDelete: (queue: AnnotationQueueRecord) => void
  onExport?: (queue: AnnotationQueueRecord) => void
}

function getCharacterCount(value: string) {
  return Array.from(value).length
}

export function createAnnotationQueueColumns({
  projectId,
  canEdit = false,
  readOnly,
  onEdit,
  onDelete,
  onExport,
}: CreateAnnotationQueueColumnsOptions): ColumnDef<AnnotationQueueRecord>[] {
  const columns: ColumnDef<AnnotationQueueRecord>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='任务名称' />
      ),
      cell: ({ row }) => {
        const name = row.original.name
        const link = (
          <Link
            to={`/projects/${projectId}/evaluation/annotation-queues/${row.original.id}`}
            className='block max-w-56 truncate font-medium underline-offset-4 hover:underline'
          >
            {name}
          </Link>
        )

        return getCharacterCount(name) > 18 ? (
          <HoverCard openDelay={250} closeDelay={100}>
            <HoverCardTrigger asChild>{link}</HoverCardTrigger>
            <HoverCardContent
              align='start'
              className='w-[520px] max-w-[calc(100vw-2rem)] p-3'
            >
              <div className='text-xs font-medium'>任务名称</div>
              <p className='mt-2 max-h-80 overflow-auto text-xs leading-relaxed break-words whitespace-pre-wrap'>
                {name}
              </p>
            </HoverCardContent>
          </HoverCard>
        ) : (
          link
        )
      },
      meta: { className: 'w-56 max-w-56' },
      enableHiding: false,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='任务描述' />
      ),
      cell: ({ row }) => {
        const description = row.original.description?.trim() || '-'

        return getCharacterCount(description) > 18 ? (
          <HoverPreviewCell
            label='任务描述'
            value={description}
            triggerClassName='max-w-72'
            contentClassName='max-w-[calc(100vw-2rem)]'
            preClassName='font-sans'
          />
        ) : (
          <span className='text-muted-foreground block max-w-72 truncate text-xs'>
            {description}
          </span>
        )
      },
      meta: { className: 'w-72 max-w-72' },
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
        <AnnotationScoreConfigBadges
          values={row.original.scoreConfigs.map(
            (config) =>
              `${config.name} · ${scoreDataTypeLabels[config.dataType]}`
          )}
        />
      ),
      meta: { className: 'w-[28rem] max-w-[28rem]' },
      enableSorting: false,
    },
    {
      accessorKey: 'assignees',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='候选处理人' />
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
  ]

  if (canEdit) {
    columns.push({
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
    })
  }

  if (!readOnly || onExport) {
    columns.push({
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <AnnotationQueueRowActions
          row={row}
          onEdit={readOnly ? undefined : onEdit}
          onDelete={readOnly ? undefined : onDelete}
          onExport={onExport}
        />
      ),
    })
  }

  return columns
}
