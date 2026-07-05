import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { LongText } from '@/components/common/long-text'
import type { DatasetItemRecord } from '../types'
import { DatasetItemRowActions } from './dataset-item-row-actions'
import { formatDateTime } from './format'

type CreateDatasetItemColumnsOptions = {
  readOnly?: boolean
  onEdit?: (item: DatasetItemRecord) => void
  onArchive?: (item: DatasetItemRecord) => void
}

export function createDatasetItemColumns({
  readOnly,
  onEdit,
  onArchive,
}: CreateDatasetItemColumnsOptions): ColumnDef<DatasetItemRecord>[] {
  const columns: ColumnDef<DatasetItemRecord>[] = []

  if (!readOnly) {
    columns.push({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='全选数据项'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='选择数据项'
        />
      ),
      enableSorting: false,
      enableHiding: false,
    })
  }

  columns.push(
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Item ID' />
      ),
      cell: ({ row }) => <span className='font-mono text-xs'>{row.original.id}</span>,
      enableHiding: false,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'ACTIVE' ? 'default' : 'secondary'}>
          {row.original.status}
        </Badge>
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'input',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Input' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-64 font-mono text-xs'>
          {JSON.stringify(row.original.input)}
        </LongText>
      ),
    },
    {
      accessorKey: 'expectedOutput',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Expected Output' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-64 font-mono text-xs'>
          {JSON.stringify(row.original.expectedOutput)}
        </LongText>
      ),
    },
    {
      accessorKey: 'metadata',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Metadata' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-56 font-mono text-xs'>
          {JSON.stringify(row.original.metadata)}
        </LongText>
      ),
    },
    {
      accessorKey: 'sourceTraceId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Source' />
      ),
      cell: ({ row }) => (
        <div className='flex max-w-40 flex-col gap-1 font-mono text-xs'>
          <span className='truncate'>{row.original.sourceTraceId || '-'}</span>
          <span className='text-muted-foreground truncate'>
            {row.original.sourceObservationId || '-'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='创建时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    }
  )

  if (!readOnly && onEdit && onArchive) {
    columns.push({
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <DatasetItemRowActions
          row={row}
          onEdit={onEdit}
          onArchive={onArchive}
        />
      ),
    })
  }

  return columns
}
