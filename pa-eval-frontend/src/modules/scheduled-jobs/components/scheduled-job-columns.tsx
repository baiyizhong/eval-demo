import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableProps,
} from '@/components/common/data-table'
import { formatFrequencyLabel } from '../mock-store'
import { scheduledJobTaskTypeLabels, type ScheduledJobTask } from '../types'
import { ScheduledJobStatusBadge } from './scheduled-job-status-badge'

type ScheduledJobTableProps = {
  request: DataTableProps<ScheduledJobTask>['request']
  readOnly?: boolean
  onEdit: (task: ScheduledJobTask) => void
  onPause: (task: ScheduledJobTask) => void
  onResume: (task: ScheduledJobTask) => void
  onRunManually: (task: ScheduledJobTask) => void
  onTriggerJob: (task: ScheduledJobTask) => void
  onDelete: (task: ScheduledJobTask) => void
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function ScheduledJobTable({
  request,
  readOnly,
  onEdit,
  onPause,
  onResume,
  onRunManually,
  onTriggerJob,
  onDelete,
}: ScheduledJobTableProps) {
  const columns = useMemo<ColumnDef<ScheduledJobTask>[]>(() => {
    const baseColumns: ColumnDef<ScheduledJobTask>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='任务名称' />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col gap-1'>
            <span className='max-w-56 truncate font-medium'>
              {row.original.name}
            </span>
            <span className='text-muted-foreground text-xs'>
              Score Name：{row.original.scoreName}
            </span>
          </div>
        ),
        meta: {
          className: 'min-w-44',
        },
      },
      {
        accessorKey: 'description',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='描述' />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground line-clamp-2 max-w-56'>
            {row.original.description || '暂无描述'}
          </span>
        ),
        meta: {
          className: 'min-w-52',
        },
      },
      {
        accessorKey: 'type',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='任务类型' />
        ),
        cell: ({ row }) => scheduledJobTaskTypeLabels[row.original.type],
      },
      {
        id: 'frequency',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='执行频率' />
        ),
        cell: ({ row }) => formatFrequencyLabel(row.original.frequency),
        meta: {
          className: 'min-w-36',
        },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='任务状态' />
        ),
        cell: ({ row }) => (
          <ScheduledJobStatusBadge status={row.original.status} />
        ),
      },
      {
        accessorKey: 'nextRunAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='下次执行时间' />
        ),
        cell: ({ row }) => formatDateTime(row.original.nextRunAt),
        meta: {
          className: 'min-w-28',
        },
      },
    ]

    if (!readOnly) {
      baseColumns.push({
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          const task = row.original

          return (
            <div className='flex justify-end'>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type='button' variant='ghost' size='icon'>
                    <MoreHorizontal />
                    <span className='sr-only'>打开操作菜单</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => onEdit(task)}>
                      <Pencil data-icon='inline-start' />
                      查看/编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={task.status === 'PAUSED'}
                      onClick={() => onPause(task)}
                    >
                      <Pause data-icon='inline-start' />
                      暂停
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={task.status !== 'PAUSED'}
                      onClick={() => onResume(task)}
                    >
                      <Play data-icon='inline-start' />
                      恢复
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRunManually(task)}>
                      <RefreshCw data-icon='inline-start' />
                      手动执行
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onTriggerJob(task)}>
                      <Zap data-icon='inline-start' />
                      模拟 JOB 触发
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant='destructive'
                      onClick={() => onDelete(task)}
                    >
                      <Trash2 data-icon='inline-start' />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
        meta: {
          className: 'w-20 text-right',
          thClassName: 'text-right',
        },
      })
    }

    return baseColumns
  }, [
    onDelete,
    onEdit,
    onPause,
    onResume,
    onRunManually,
    onTriggerJob,
    readOnly,
  ])

  return (
    <DataTable<ScheduledJobTask>
      className='min-h-0 flex-1'
      columns={columns}
      request={request}
      urlState={{
        defaultPageSize: 10,
        globalFilterKey: 'taskKeyword',
        pageKey: 'taskPage',
        pageSizeKey: 'taskPageSize',
        sortKey: 'taskSort',
        filters: [{ fieldId: 'status', type: 'array' }],
      }}
      toolbar={{
        searchPlaceholder: '搜索任务名称或描述',
        filters: [
          {
            fieldId: 'status',
            title: '任务状态',
            options: [
              { label: '未启动', value: 'NOT_STARTED' },
              { label: '运行中', value: 'RUNNING' },
              { label: '已暂停', value: 'PAUSED' },
              { label: '执行成功', value: 'SUCCEEDED' },
              { label: '执行失败', value: 'FAILED' },
            ],
          },
        ],
        columnLabels: {
          name: '任务名称',
          description: '描述',
          type: '任务类型',
          frequency: '执行频率',
          status: '任务状态',
          nextRunAt: '下次执行时间',
          actions: '操作',
        },
      }}
      emptyText='暂无定时任务'
      tableClassName='table-fixed'
      enableRowSelection={false}
    />
  )
}
