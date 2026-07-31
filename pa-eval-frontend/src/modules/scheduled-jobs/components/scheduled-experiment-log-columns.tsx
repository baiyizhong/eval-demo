import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableProps,
} from '@/components/common/data-table'
import {
  scheduledJobTriggerLabels,
  type ScheduledJobExecutionLog,
} from '../types'
import { ScheduledJobLogStatusBadge } from './scheduled-job-status-badge'

type ScheduledExperimentLogTableProps = {
  request: DataTableProps<ScheduledJobExecutionLog>['request']
}

export function ScheduledExperimentLogTable({
  request,
}: ScheduledExperimentLogTableProps) {
  const columns = useMemo<ColumnDef<ScheduledJobExecutionLog>[]>(
    () => [
      {
        accessorKey: 'taskName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='任务名称' />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col gap-1'>
            <span className='max-w-52 truncate font-medium'>
              {row.original.taskName}
            </span>
            {row.original.taskDeleted ? (
              <span className='text-muted-foreground text-xs'>任务已删除</span>
            ) : null}
          </div>
        ),
        meta: { className: 'min-w-48' },
      },
      {
        accessorKey: 'scheduledAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='任务调度时间' />
        ),
        cell: ({ row }) => formatDateTime(row.original.scheduledAt),
        meta: { className: 'min-w-36' },
      },
      {
        accessorKey: 'triggerType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='触发方式' />
        ),
        cell: ({ row }) => scheduledJobTriggerLabels[row.original.triggerType],
      },
      {
        accessorKey: 'sceneName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='运行场景' />
        ),
        cell: ({ row }) => (
          <span className='block max-w-52 truncate'>
            {row.original.sceneName}
          </span>
        ),
        meta: { className: 'min-w-44' },
      },
      {
        accessorKey: 'experimentName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='执行试验' />
        ),
        cell: ({ row }) => (
          <span className='block max-w-64 truncate font-medium'>
            {row.original.experimentName}
          </span>
        ),
        meta: { className: 'min-w-56' },
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
        accessorKey: 'experimentReportPath',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='关联试验报告' />
        ),
        cell: ({ row }) =>
          row.original.experimentReportPath ? (
            <Link
              className='text-primary block max-w-56 truncate hover:underline'
              to={row.original.experimentReportPath}
            >
              {row.original.experimentReportName}
            </Link>
          ) : (
            <span className='text-muted-foreground'>暂无报告</span>
          ),
        meta: { className: 'min-w-56' },
      },
      {
        accessorKey: 'errorMessage',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='错误信息' />
        ),
        cell: ({ row }) => (
          <span
            className='text-muted-foreground block max-w-64 truncate'
            title={row.original.errorMessage}
          >
            {row.original.errorMessage || '-'}
          </span>
        ),
        meta: { className: 'min-w-56' },
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
        globalFilterKey: 'experimentLogKeyword',
        pageKey: 'experimentLogPage',
        pageSizeKey: 'experimentLogPageSize',
        sortKey: 'experimentLogSort',
        filters: [
          { fieldId: 'status', type: 'array' },
          { fieldId: 'triggerType', type: 'array' },
        ],
      }}
      toolbar={{
        searchPlaceholder: '搜索任务、场景、试验或报告',
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
          scheduledAt: '任务调度时间',
          triggerType: '触发方式',
          sceneName: '运行场景',
          experimentName: '执行试验',
          status: '执行状态',
          startedAt: '开始时间',
          endedAt: '结束时间',
          durationText: '执行时长',
          experimentReportPath: '关联试验报告',
          errorMessage: '错误信息',
        },
      }}
      emptyText='暂无运行试验执行日志'
      enableRowSelection={false}
    />
  )
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
