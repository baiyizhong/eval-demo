import type { ColumnDef } from '@tanstack/react-table'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { listProjectEvaluationReportItems } from '../api/evaluation-report-api'
import type { EvaluationReportItemRecord } from '../types'

const columns: ColumnDef<EvaluationReportItemRecord>[] = [
  { accessorKey: 'sourceId', header: '来源 ID' },
  { accessorKey: 'scoreSummary', header: '评分摘要' },
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

export function EvaluationReportItemTable({
  projectId,
  reportId,
  onFlowback,
}: {
  projectId: string
  reportId: string
  onFlowback: (ids: string[]) => void
}) {
  const $api = useAPI()

  return (
    <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-lg border p-4'>
      <DataTable<EvaluationReportItemRecord>
        className='min-h-0 flex-1'
        columns={columns}
        bulkActions={(table) => {
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
        }}
        request={{
          queryKey: (state) => [
            'project-evaluation-report-items',
            $api,
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
        toolbar={{ searchPlaceholder: '搜索来源 ID / 评分摘要' }}
        loadingText={
          <Loading
            text='加载评测数据中...'
            className='min-h-24 border-0 bg-transparent'
          />
        }
        emptyText='暂无评测数据'
        minTableWidth={900}
      />
    </section>
  )
}
