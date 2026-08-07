import type { ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { HoverPreviewCell } from '@/components/common/hover-preview-cell'
import type { DatasetExportFormat, DatasetRecord } from '../types'
import { DatasetRowActions } from './dataset-row-actions'
import { DatasetTagsBadges } from './dataset-tags-badges'
import { formatDateTime } from './format'

type CreateDatasetColumnsOptions = {
  projectId: string
  readOnly?: boolean
  onEdit?: (dataset: DatasetRecord) => void
  onImport?: (dataset: DatasetRecord) => void
  onExport?: (dataset: DatasetRecord, format: DatasetExportFormat) => void
  onDelete?: (dataset: DatasetRecord) => void
  exportingDatasetId?: string | null
}

function getCharacterCount(value: string) {
  return Array.from(value).length
}

export function createDatasetColumns({
  projectId,
  readOnly,
  onEdit,
  onImport,
  onExport,
  onDelete,
  exportingDatasetId,
}: CreateDatasetColumnsOptions): ColumnDef<DatasetRecord>[] {
  const columns: ColumnDef<DatasetRecord>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='名称' />
      ),
      cell: ({ row }) => {
        const name = row.original.name
        const link = (
          <Link
            to={`/projects/${projectId}/evaluation/datasets/${row.original.id}`}
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
              <div className='text-xs font-medium'>数据集名称</div>
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
        <DataTableColumnHeader column={column} title='描述' />
      ),
      cell: ({ row }) => {
        const description = row.original.description?.trim() || '-'

        return getCharacterCount(description) > 18 ? (
          <HoverPreviewCell
            label='数据集描述'
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
      accessorKey: 'tags',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='标签' />
      ),
      cell: ({ row }) => <DatasetTagsBadges dataset={row.original} />,
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
      header: () => <div className='text-right'>操作</div>,
      enableHiding: false,
      cell: ({ row }) => (
        <DatasetRowActions
          row={row}
          onEdit={onEdit}
          onImport={onImport}
          onExport={onExport}
          onDelete={onDelete}
          exporting={exportingDatasetId === row.original.id}
        />
      ),
      meta: {
        className: 'w-[132px]',
      },
    })
  }

  return columns
}
