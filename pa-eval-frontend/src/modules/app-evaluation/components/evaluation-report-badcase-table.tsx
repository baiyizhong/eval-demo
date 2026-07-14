import type { ColumnDef } from '@tanstack/react-table'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { listProjectEvaluationReportBadcases } from '../api/evaluation-report-api'
import type { EvaluationReportBadcaseRecord } from '../types'

const columns: ColumnDef<EvaluationReportBadcaseRecord>[] = [
  { accessorKey: 'traceId', header: 'Trace ID' },
  { accessorKey: 'observationId', header: 'Observation ID' },
  {
    accessorKey: 'scoreValue',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='score' />
    ),
  },
  { accessorKey: 'reason', header: 'reason' },
  {
    accessorKey: 'scoreSummary',
    header: '评分摘要',
    cell: ({ row }) => (
      <ScoreSummaryCell value={row.original.scoreSummary} />
    ),
  },
  { accessorKey: 'comment', header: '备注' },
  {
    accessorKey: 'flowbackStatus',
    header: '回流',
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.flowbackStatus === 'FLOWED_BACK'
            ? 'secondary'
            : 'outline'
        }
      >
        {row.original.flowbackStatus === 'FLOWED_BACK' ? '已回流' : '未回流'}
      </Badge>
    ),
  },
]

function ScoreSummaryCell({ value }: { value?: string }) {
  const summary = value?.trim() || '{}'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='block max-w-80 truncate font-mono text-xs'>
          {summary}
        </span>
      </TooltipTrigger>
      <TooltipContent className='max-w-xl whitespace-pre-wrap break-words font-mono text-xs'>
        {formatScoreSummary(summary)}
      </TooltipContent>
    </Tooltip>
  )
}

function formatScoreSummary(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

export function EvaluationReportBadcaseTable({
  projectId,
  reportId,
  onFlowback,
  canEdit,
}: {
  projectId: string
  reportId: string
  onFlowback: (ids: string[]) => void
  canEdit?: boolean
}) {
  const $api = useAPI()

  return (
    <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-lg border p-4'>
      <DataTable<EvaluationReportBadcaseRecord>
        className='min-h-0 flex-1'
        columns={columns}
        bulkActions={
          canEdit
            ? (table) => {
                const ids = table
                  .getFilteredSelectedRowModel()
                  .rows.map((row) => row.original.id)
                return (
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={!ids.length}
                    onClick={() => onFlowback(ids)}
                  >
                    回流已选择
                  </Button>
                )
              }
            : undefined
        }
        request={{
          queryKey: (state) => [
            'project-evaluation-report-badcases',
            projectId,
            reportId,
            state,
          ],
          queryFn: (state) =>
            listProjectEvaluationReportBadcases(
              $api,
              projectId,
              reportId,
              state
            ),
        }}
        urlState={{
          defaultPageSize: 10,
          globalFilterKey: 'badcaseKeyword',
        }}
        toolbar={{ searchPlaceholder: '搜索 Trace / 备注' }}
        loadingText={
          <Loading
            text='加载 Badcase 中...'
            className='min-h-24 border-0 bg-transparent'
          />
        }
        emptyText='暂无 Badcase'
        minTableWidth={1100}
      />
    </section>
  )
}
