import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/common/data-table'
import { formatDateTime, formatLatency } from '../lib/format'
import type { TraceLogRow, TraceScore } from '../types'
import { CopyableText } from './copyable-text'
import { StatusBadge } from './status-badge'

type CreateTraceLogColumnsOptions = {
  onOpenTrace: (traceId: string) => void
  rows?: TraceLogRow[]
}

export function createTraceLogColumns({
  onOpenTrace,
  rows = [],
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
      accessorKey: 'input',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Input' />
      ),
      cell: ({ row }) => renderTracePayloadPreview(row.original.input),
      meta: {
        className: 'min-w-[220px] max-w-[280px]',
      },
    },
    {
      accessorKey: 'output',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Output' />
      ),
      cell: ({ row }) => renderTracePayloadPreview(row.original.output),
      meta: {
        className: 'min-w-[220px] max-w-[280px]',
      },
    },
    {
      accessorKey: 'metadata',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Metadata' />
      ),
      cell: ({ row }) => renderTracePayloadPreview(row.original.metadata),
      meta: {
        className: 'min-w-[220px] max-w-[280px]',
      },
    },
    ...createTraceScoreColumns(rows),
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

export function createTraceScoreColumns(
  rows: Pick<TraceLogRow, 'scores'>[]
): ColumnDef<TraceLogRow>[] {
  return getTraceScoreColumnNames(rows).map((scoreName) => ({
    id: getTraceScoreColumnId(scoreName),
    accessorFn: (row) => formatTraceScoreValue(findTraceScore(row, scoreName)),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={scoreName} />
    ),
    cell: ({ getValue }) => (
      <span className='block max-w-[160px] truncate text-xs tabular-nums'>
        {String(getValue() || '-')}
      </span>
    ),
    meta: {
      label: scoreName,
      className: 'min-w-[140px]',
    },
  }))
}

export function getTraceScoreColumnNames(
  rows: Pick<TraceLogRow, 'scores'>[]
): string[] {
  const names = new Set<string>()
  rows.forEach((row) => {
    row.scores?.forEach((score) => {
      const name = score.name.trim()
      if (name) {
        names.add(name)
      }
    })
  })
  return [...names]
}

function getTraceScoreColumnId(scoreName: string) {
  return `score:${scoreName}`
}

function findTraceScore(row: TraceLogRow, scoreName: string) {
  return row.scores?.find((score) => score.name === scoreName)
}

export function formatTraceScoreValue(score: TraceScore | undefined) {
  if (!score) {
    return '-'
  }
  if (score.stringValue) {
    return score.stringValue
  }
  if (score.longStringValue) {
    return score.longStringValue
  }
  if (score.value !== undefined && score.value !== null) {
    return String(score.value)
  }
  return '-'
}

function renderTracePayloadPreview(value: unknown) {
  const text = formatTracePayloadPreview(value)
  if (text === '-') {
    return <span className='text-muted-foreground'>-</span>
  }

  return (
    <span
      title={text}
      className='text-muted-foreground block max-w-[260px] truncate font-mono text-xs'
    >
      {text}
    </span>
  )
}

function formatTracePayloadPreview(value: unknown): string {
  if (value === undefined || value === null) {
    return '-'
  }
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) {
      return '-'
    }
    try {
      return JSON.stringify(JSON.parse(text))
    } catch {
      return text.replace(/\s+/g, ' ')
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
