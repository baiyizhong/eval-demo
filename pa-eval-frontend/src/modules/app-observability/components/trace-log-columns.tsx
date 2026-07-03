import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { formatDateTime, formatLatency } from '../lib/format'
import type { TraceLogRow } from '../types'
import { CopyableText } from './copyable-text'
import { StatusBadge } from './status-badge'

type CreateTraceLogColumnsOptions = {
  onOpenTrace: (traceId: string) => void
}

export function createTraceLogColumns({
  onOpenTrace,
}: CreateTraceLogColumnsOptions): ColumnDef<TraceLogRow>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='选择全部 Trace'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='选择 Trace'
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'traceId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Trace ID' />
      ),
      cell: ({ row }) => (
        <Button
          type='button'
          variant='link'
          className='h-auto max-w-[220px] justify-start p-0'
          onClick={() => onOpenTrace(row.original.traceId)}
        >
          <span className='truncate font-mono text-xs'>
            {row.original.traceId}
          </span>
        </Button>
      ),
    },
    {
      accessorKey: 'sessionId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Session ID' />
      ),
      cell: ({ row }) => <CopyableText value={row.original.sessionId} />,
    },
    {
      accessorKey: 'environment',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='环境' />
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'latency',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='延迟' />
      ),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {formatLatency(row.original.latency)}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='创建时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}
