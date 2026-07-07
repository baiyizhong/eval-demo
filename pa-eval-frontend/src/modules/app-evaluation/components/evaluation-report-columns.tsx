import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { LongText } from '@/components/common/long-text'
import type { EvaluationReportRecord } from '../types'
import { EvaluationReportRowActions } from './evaluation-report-row-actions'
import { EvaluationReportSourceBadge } from './evaluation-report-source-badge'
import { EvaluationReportStatusBadge } from './evaluation-report-status-badge'
import { formatDateTime } from './format'

type Options = {
  projectId: string
  onExport: (report: EvaluationReportRecord) => void
  onRegenerate: (report: EvaluationReportRecord) => void
  onFlowback: (report: EvaluationReportRecord) => void
  onViewUnavailable: (report: EvaluationReportRecord) => void
  onDelete: (report: EvaluationReportRecord) => void
}

export function createEvaluationReportColumns({
  projectId,
  onExport,
  onRegenerate,
  onFlowback,
  onViewUnavailable,
  onDelete,
}: Options): ColumnDef<EvaluationReportRecord>[] {
  return [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='报告标题' />
      ),
      cell: ({ row }) =>
        row.original.status === 'READY' ? (
          <Link
            to={`/projects/${projectId}/evaluation/reports/${row.original.id}`}
            className='font-medium underline-offset-4 hover:underline'
          >
            {row.original.title}
          </Link>
        ) : (
          <LongText className='max-w-72 font-medium'>
            {row.original.title}
          </LongText>
        ),
      enableHiding: false,
    },
    {
      accessorKey: 'sourceType',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='来源' />
      ),
      cell: ({ row }) => (
        <EvaluationReportSourceBadge sourceType={row.original.sourceType} />
      ),
    },
    {
      accessorKey: 'sourceTaskName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='来源任务' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-64'>{row.original.sourceTaskName}</LongText>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => (
        <EvaluationReportStatusBadge status={row.original.status} />
      ),
    },
    { accessorKey: 'sampleCount', header: '样本数' },
    { accessorKey: 'badcaseCount', header: 'Badcase' },
    { accessorKey: 'flowbackCount', header: '已回流' },
    {
      accessorKey: 'generatedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='生成时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.generatedAt),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <EvaluationReportRowActions
          row={row}
          projectId={projectId}
          onExport={onExport}
          onRegenerate={onRegenerate}
          onFlowback={onFlowback}
          onViewUnavailable={onViewUnavailable}
          onDelete={onDelete}
        />
      ),
    },
  ]
}
