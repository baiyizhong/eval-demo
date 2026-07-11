import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableProps,
} from '@/components/common/data-table'
import {
  scheduledJobTaskTypeLabels,
  scheduledJobTriggerLabels,
  type ScheduledJobExecutionLog,
} from '../types'
import { ScheduledJobLogStatusBadge } from './scheduled-job-status-badge'

type ScheduledJobLogTableProps = {
  request: DataTableProps<ScheduledJobExecutionLog>['request']
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

function renderLink(path: string | undefined, label: string) {
  if (!path) {
    return '-'
  }

  return (
    <Link className='text-primary hover:underline' to={path}>
      {label}
    </Link>
  )
}

function renderErrorMessage(message: string | undefined) {
  if (!message) {
    return '-'
  }

  return (
    <span
      className='text-muted-foreground block max-w-72 truncate text-sm'
      title={message}
    >
      {message}
    </span>
  )
}

export function ScheduledJobLogTable({ request }: ScheduledJobLogTableProps) {
  const columns = useMemo<ColumnDef<ScheduledJobExecutionLog>[]>(
    () => [
      {
        accessorKey: 'taskName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='任务名称' />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col gap-1'>
            <span className='max-w-56 truncate font-medium'>
              {row.original.taskName}
            </span>
            {row.original.taskDeleted ? (
              <span className='text-muted-foreground text-xs'>任务已删除</span>
            ) : null}
          </div>
        ),
        meta: {
          className: 'min-w-56',
        },
      },
      {
        accessorKey: 'triggerType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='触发方式' />
        ),
        cell: ({ row }) => scheduledJobTriggerLabels[row.original.triggerType],
      },
      {
        accessorKey: 'taskType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='任务类型' />
        ),
        cell: ({ row }) =>
          row.original.taskType
            ? scheduledJobTaskTypeLabels[row.original.taskType]
            : '-',
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='执行状态' />
        ),
        cell: ({ row }) => (
          <ScheduledJobLogStatusBadge status={row.original.status} />
        ),
      },
      {
        accessorKey: 'startedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='开始时间' />
        ),
        cell: ({ row }) => formatDateTime(row.original.startedAt),
      },
      {
        accessorKey: 'endedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='结束时间' />
        ),
        cell: ({ row }) => formatDateTime(row.original.endedAt),
      },
      {
        accessorKey: 'durationText',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='执行时长' />
        ),
      },
      {
        accessorKey: 'sampleCount',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='处理样本数' />
        ),
      },
      {
        accessorKey: 'autoEvaluationTaskName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='关联自动评测任务' />
        ),
        cell: ({ row }) =>
          renderLink(
            row.original.autoEvaluationTaskPath,
            row.original.autoEvaluationTaskName
          ),
        meta: {
          className: 'min-w-72',
        },
      },
      {
        accessorKey: 'evaluationReportPath',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='关联评测报告' />
        ),
        cell: ({ row }) =>
          renderLink(row.original.evaluationReportPath, '查看报告'),
        meta: {
          className: 'min-w-32',
        },
      },
      {
        accessorKey: 'errorMessage',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='错误信息' />
        ),
        cell: ({ row }) => renderErrorMessage(row.original.errorMessage),
        meta: {
          className: 'min-w-72',
        },
      },
    ],
    []
  )

  return (
    <DataTable<ScheduledJobExecutionLog>
      className='min-h-0 flex-1'
      columns={columns}
      request={request}
      urlState={{
        defaultPageSize: 10,
        globalFilterKey: 'logKeyword',
        pageKey: 'logPage',
        pageSizeKey: 'logPageSize',
        sortKey: 'logSort',
        filters: [
          { fieldId: 'status', type: 'array' },
          { fieldId: 'triggerType', type: 'array' },
        ],
      }}
      toolbar={{
        searchPlaceholder: '搜索任务名称或关联评测任务',
        filters: [
          {
            fieldId: 'status',
            title: '执行状态',
            options: [
              { label: '运行中', value: 'RUNNING' },
              { label: '成功', value: 'SUCCEEDED' },
              { label: '失败', value: 'FAILED' },
            ],
          },
          {
            fieldId: 'triggerType',
            title: '触发方式',
            options: [
              { label: '手动执行', value: 'MANUAL' },
              { label: 'JOB触发', value: 'JOB' },
            ],
          },
        ],
        columnLabels: {
          taskName: '任务名称',
          triggerType: '触发方式',
          taskType: '任务类型',
          status: '执行状态',
          startedAt: '开始时间',
          endedAt: '结束时间',
          durationText: '执行时长',
          sampleCount: '处理样本数',
          autoEvaluationTaskName: '关联自动评测任务',
          evaluationReportPath: '关联评测报告',
          errorMessage: '错误信息',
        },
      }}
      emptyText='暂无执行日志'
      minTableWidth={1400}
      enableRowSelection={false}
    />
  )
}
