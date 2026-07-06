import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { LongText } from '@/components/common/long-text'
import type { DatasetRecord } from '../types'
import { DatasetRowActions } from './dataset-row-actions'
import { DatasetTypeBadge } from './dataset-type-badge'
import { formatDateTime } from './format'

type CreateDatasetColumnsOptions = {
  projectId: string
  readOnly?: boolean
  onEdit?: (dataset: DatasetRecord) => void
  onImport?: (dataset: DatasetRecord) => void
  onExport?: (dataset: DatasetRecord) => void
  onDelete?: (dataset: DatasetRecord) => void
}

export function createDatasetColumns({
  projectId,
  readOnly,
  onEdit,
  onImport,
  onExport,
  onDelete,
}: CreateDatasetColumnsOptions): ColumnDef<DatasetRecord>[] {
  const columns: ColumnDef<DatasetRecord>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='名称' />
      ),
      cell: ({ row }) => (
        <Link
          to={`/projects/${projectId}/evaluation/datasets/${row.original.id}`}
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
        <DataTableColumnHeader column={column} title='描述' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-72'>{row.original.description}</LongText>
      ),
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='类型' />
      ),
      cell: ({ row }) => <DatasetTypeBadge type={row.original.type} />,
    },
    {
      accessorKey: 'itemCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='数据量' />
      ),
      cell: ({ row }) => row.original.itemCount,
    },
    {
      accessorKey: 'runCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='运行数' />
      ),
      cell: ({ row }) => row.original.runCount,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='创建时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='更新时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.updatedAt),
    },
  ]

  if (!readOnly && (onEdit || onImport || onExport || onDelete)) {
    columns.push({
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <DatasetRowActions
          row={row}
          onEdit={onEdit}
          onImport={onImport}
          onExport={onExport}
          onDelete={onDelete}
        />
      ),
    })
  }

  return columns
}
