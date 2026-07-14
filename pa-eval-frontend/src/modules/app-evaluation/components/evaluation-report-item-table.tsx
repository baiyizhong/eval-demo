import type { ColumnDef } from '@tanstack/react-table'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  formatTraceScoreValue,
  getTraceScoreColumnNames,
} from '@/modules/app-observability/components/trace-log-columns'
import { formatDateTime } from '@/modules/app-observability/lib/format'
import { listProjectEvaluationReportItems } from '../api/evaluation-report-api'
import type { EvaluationReportItemRecord } from '../types'

function createColumns(
  rows: EvaluationReportItemRecord[]
): ColumnDef<EvaluationReportItemRecord>[] {
  return [
    { accessorKey: 'traceId', header: '来源 ID' },
    ...createReportScoreColumns(rows),
    {
      accessorKey: 'resultType',
      header: '结果',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.resultType === 'badcase' ? 'destructive' : 'secondary'
          }
        >
          {row.original.resultType === 'badcase' ? 'Badcase' : '正常'}
        </Badge>
      ),
    },
    { accessorKey: 'executionStatus', header: '执行状态' },
    {
      accessorKey: 'datasetFlowbackStatus',
      header: '回流',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.datasetFlowbackStatus === 'FLOWED_BACK'
              ? 'secondary'
              : 'outline'
          }
        >
          {row.original.datasetFlowbackStatus === 'FLOWED_BACK'
            ? '已回流'
            : '未回流'}
        </Badge>
      ),
    },
  ]
}

function createReportScoreColumns(
  rows: EvaluationReportItemRecord[]
): ColumnDef<EvaluationReportItemRecord>[] {
  return getTraceScoreColumnNames(rows).flatMap((scoreName) => [
    {
      id: `score:${scoreName}`,
      accessorFn: (row) => formatTraceScoreValue(findScore(row, scoreName)),
      header: scoreName,
      cell: ({ getValue }) => (
        <span className='block max-w-[160px] truncate text-xs tabular-nums'>
          {String(getValue() || '-')}
        </span>
      ),
      meta: {
        label: scoreName,
        className: 'min-w-[140px]',
      },
    },
    {
      id: `score:${scoreName}:created_at`,
      accessorFn: (row) => {
        const score = findScore(row, scoreName)
        return score?.createdAt ? formatDateTime(score.createdAt) : '-'
      },
      header: 'created_at',
      cell: ({ getValue }) => (
        <span className='block min-w-[110px] text-xs tabular-nums'>
          {String(getValue() || '-')}
        </span>
      ),
      meta: {
        label: `${scoreName} created_at`,
        className: 'min-w-[120px]',
      },
    },
  ])
}

function findScore(row: EvaluationReportItemRecord, scoreName: string) {
  return row.scores?.find((score) => score.name === scoreName)
}

export function EvaluationReportItemTable({
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
      <DataTable<EvaluationReportItemRecord>
        className='min-h-0 flex-1'
        columns={createColumns}
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
            'project-evaluation-report-items',
            projectId,
            reportId,
            state,
          ],
          queryFn: (state) =>
            listProjectEvaluationReportItems($api, projectId, reportId, state),
        }}
        urlState={{
          defaultPageSize: 10,
          globalFilterKey: 'itemKeyword',
        }}
        toolbar={{ searchPlaceholder: '搜索 Trace ID / 评分摘要' }}
        loadingText={
          <Loading
            text='加载评测数据中...'
            className='min-h-24 border-0 bg-transparent'
          />
        }
        emptyText='暂无评测数据'
        minTableWidth={1040}
      />
    </section>
  )
}
