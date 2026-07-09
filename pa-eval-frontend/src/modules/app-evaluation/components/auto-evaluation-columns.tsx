import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { LongText } from '@/components/common/long-text'
import {
  autoEvaluationDataSourceLabels,
  autoEvaluationEvaluatorTypeLabels,
  type AutoEvaluationTaskRecord,
} from '../types'
import { AutoEvaluationRowActions } from './auto-evaluation-row-actions'
import { AutoEvaluationStatusBadge } from './auto-evaluation-status-badge'
import { formatDateTime } from './format'

type CreateAutoEvaluationColumnsOptions = {
  projectId: string
  onRerun: (task: AutoEvaluationTaskRecord) => void
  onDelete: (task: AutoEvaluationTaskRecord) => void
}

export function createAutoEvaluationColumns({
  projectId,
  onRerun,
  onDelete,
}: CreateAutoEvaluationColumnsOptions): ColumnDef<AutoEvaluationTaskRecord>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='任务名称' />
      ),
      cell: ({ row }) => (
        <div className='flex max-w-72 flex-col gap-1'>
          <Link
            to={`/projects/${projectId}/evaluation/auto-evaluations/${row.original.id}`}
            className='font-medium underline-offset-4 hover:underline'
          >
            {row.original.name}
          </Link>
          <LongText className='text-muted-foreground text-xs'>
            {row.original.description}
          </LongText>
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => (
        <AutoEvaluationStatusBadge status={row.original.status} />
      ),
    },
    {
      accessorKey: 'evaluator',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='评估器' />
      ),
      cell: ({ row }) => (
        <div className='flex flex-col gap-1'>
          <span>{row.original.evaluator.name}</span>
          <span className='text-muted-foreground text-xs'>
            {autoEvaluationEvaluatorTypeLabels[row.original.evaluator.type]} ·{' '}
            {row.original.evaluator.version}
          </span>
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'dataSource',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='数据源' />
      ),
      cell: ({ row }) => (
        <div className='flex flex-col gap-1'>
          <span>{row.original.dataSource.name}</span>
          <span className='text-muted-foreground text-xs'>
            {autoEvaluationDataSourceLabels[row.original.dataSource.type]} ·{' '}
            {row.original.dataSource.sampleCount} 条
          </span>
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'sampleRate',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='采样率' />
      ),
      cell: ({ row }) => `${row.original.sampleRate}%`,
    },
    {
      id: 'executionResult',
      header: '执行结果',
      cell: ({ row }) => {
        const stats = row.original.executionStats
        return (
          <span className='text-sm'>
            {stats.completed} 完成 / {stats.failed} 失败
          </span>
        )
      },
    },
    {
      accessorKey: 'badcaseCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Badcase' />
      ),
      cell: ({ row }) => (
        <Badge
          variant={row.original.badcaseCount > 0 ? 'secondary' : 'outline'}
        >
          {row.original.badcaseCount}
        </Badge>
      ),
    },
    {
      accessorKey: 'lastRunAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='最近运行' />
      ),
      cell: ({ row }) =>
        row.original.lastRunAt ? formatDateTime(row.original.lastRunAt) : '-',
    },
    {
      accessorKey: 'createdBy',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='创建人' />
      ),
      cell: ({ row }) => row.original.createdBy,
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <AutoEvaluationRowActions
          row={row}
          projectId={projectId}
          onRerun={onRerun}
          onDelete={onDelete}
        />
      ),
    },
  ]
}
