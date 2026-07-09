import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableListResponse,
  type DataTableQueryState,
} from '@/components/common/data-table'
import { formatFrequencyLabel } from '../mock-store'
import {
  scheduledJobTaskTypeLabels,
  type ScheduledJobTask,
  type ScheduledJobStatus,
} from '../types'
import { ScheduledJobStatusBadge } from './scheduled-job-status-badge'

type ScheduledJobTableProps = {
  tasks: ScheduledJobTask[]
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

function queryTasks(
  tasks: ScheduledJobTask[],
  state: DataTableQueryState
): DataTableListResponse<ScheduledJobTask> {
  const keyword = state.keyword.trim().toLowerCase()
  const statusFilter = state.filters.status
  const statusValues = Array.isArray(statusFilter)
    ? statusFilter.filter((value): value is ScheduledJobStatus =>
        ['NOT_STARTED', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED'].includes(
          String(value)
        )
      )
    : []
  const filtered = tasks.filter((task) => {
    const matchesKeyword =
      !keyword ||
      task.name.toLowerCase().includes(keyword) ||
      task.description.toLowerCase().includes(keyword)
    const matchesStatus =
      statusValues.length === 0 || statusValues.includes(task.status)

    return matchesKeyword && matchesStatus
  })
  const start = (state.page - 1) * state.pageSize

  return {
    total: filtered.length,
    datas: filtered.slice(start, start + state.pageSize),
  }
}

export function ScheduledJobTable({
  tasks,
  onEdit,
  onPause,
  onResume,
  onRunManually,
  onTriggerJob,
  onDelete,
}: ScheduledJobTableProps) {
  const columns = useMemo<ColumnDef<ScheduledJobTask>[]>(
    () => [
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
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          const task = row.original

          return (
            <div className='flex justify-end'>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type='button' variant='ghost' size='icon'>
                    <MoreHorizontal className='size-4' />
                    <span className='sr-only'>打开操作菜单</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onClick={() => onEdit(task)}>
                    查看/编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={task.status === 'PAUSED'}
                    onClick={() => onPause(task)}
                  >
                    暂停
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={task.status !== 'PAUSED'}
                    onClick={() => onResume(task)}
                  >
                    恢复
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRunManually(task)}>
                    手动执行
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onTriggerJob(task)}>
                    模拟 JOB 触发
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => onDelete(task)}
                  >
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
        meta: {
          className: 'w-20 text-right',
          thClassName: 'text-right',
        },
      },
    ],
    [onDelete, onEdit, onPause, onResume, onRunManually, onTriggerJob]
  )

  return (
    <DataTable<ScheduledJobTask>
      className='min-h-0 flex-1'
      columns={columns}
      request={{
        queryKey: (state) => ['scheduled-job-tasks', tasks, state],
        queryFn: async (state) => queryTasks(tasks, state),
      }}
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
      minTableWidth={900}
      tableClassName='table-fixed'
      enableRowSelection={false}
    />
  )
}
