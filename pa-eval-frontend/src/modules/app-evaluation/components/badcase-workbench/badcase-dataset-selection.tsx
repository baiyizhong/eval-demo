import type { ColumnDef } from '@tanstack/react-table'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  RotateCcw,
  SearchCheck,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableListResponse,
  type DataTableQueryState,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  lifecycleStages,
  type BadcaseDatasetCandidate,
  type BadcaseStage,
} from '../../lib/badcase-workbench-prototype'

type DatasetSelectionProps = {
  datasets: BadcaseDatasetCandidate[]
  selectedDataset: BadcaseDatasetCandidate | undefined
  invalidDatasetId: string | null
  onSelect: (datasetId: string) => void
  onEnter: (datasetId: string) => void
}

export function BadcaseDatasetSelection({
  datasets,
  selectedDataset,
  invalidDatasetId,
  onSelect,
  onEnter,
}: DatasetSelectionProps) {
  const columns = buildDatasetColumns(selectedDataset?.id, onSelect, onEnter)

  return (
    <div className='grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[minmax(620px,1.15fr)_minmax(380px,0.85fr)]'>
      <Card className='min-h-0 gap-4 py-4 shadow-none'>
        <CardHeader className='px-4'>
          <CardTitle>选择 badcase 数据集</CardTitle>
          <CardDescription>
            工作台一次治理一个数据集，选择后在右侧查看治理概况。
          </CardDescription>
        </CardHeader>
        <CardContent className='flex min-h-0 flex-1 flex-col px-4'>
          <DataTable<
            BadcaseDatasetCandidate,
            DataTableListResponse<BadcaseDatasetCandidate>
          >
            className='min-h-0 flex-1'
            columns={columns}
            enableRowSelection={false}
            minTableWidth={760}
            request={{
              queryKey: (state) => [
                'badcase-dataset-selection',
                datasets,
                state,
              ],
              queryFn: (state) => listDatasetCandidates(datasets, state),
            }}
            urlState={{
              pageKey: 'datasetPage',
              pageSizeKey: 'datasetPageSize',
              globalFilterKey: 'datasetKeyword',
              sortKey: 'datasetSort',
              defaultPageSize: 10,
              filters: [
                {
                  fieldId: 'hasOverdue',
                  queryKey: 'datasetHasOverdue',
                  type: 'string',
                },
                {
                  fieldId: 'hasOpen',
                  queryKey: 'datasetHasOpen',
                  type: 'string',
                },
              ],
            }}
            toolbar={{
              searchPlaceholder: '搜索数据集名称、标签或创建人',
              filters: [
                {
                  fieldId: 'hasOverdue',
                  title: '逾期状态',
                  selectionMode: 'single',
                  options: [
                    { label: '存在逾期', value: 'true' },
                    { label: '无逾期', value: 'false' },
                  ],
                },
                {
                  fieldId: 'hasOpen',
                  title: '未关闭状态',
                  selectionMode: 'single',
                  options: [
                    { label: '存在未关闭', value: 'true' },
                    { label: '全部已关闭', value: 'false' },
                  ],
                },
              ],
              columnLabels: {
                name: '数据集名称',
                tags: '标签',
                openCount: '未关闭',
                overdueCount: '逾期',
                highPriorityCount: 'P0/P1',
                owner: '创建人',
                updatedAt: '更新时间',
                actions: '操作',
              },
            }}
            loadingText={
              <Loading
                text='加载 badcase 数据集中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='暂无匹配的 badcase 数据集'
          />
        </CardContent>
      </Card>

      <DatasetPreview
        dataset={selectedDataset}
        invalidDatasetId={invalidDatasetId}
      />
    </div>
  )
}

function DatasetPreview({
  dataset,
  invalidDatasetId,
}: {
  dataset: BadcaseDatasetCandidate | undefined
  invalidDatasetId: string | null
}) {
  if (invalidDatasetId) {
    return (
      <Card className='min-h-0 justify-center shadow-none'>
        <CardContent className='text-center'>
          <AlertCircle className='text-destructive mx-auto size-9' />
          <CardTitle className='mt-4'>
            数据集不存在或不是 badcase 类型
          </CardTitle>
          <CardDescription className='mt-2'>
            URL 中的数据集不可用于当前工作台，请从左侧重新选择。
          </CardDescription>
        </CardContent>
      </Card>
    )
  }

  if (!dataset) {
    return (
      <Card className='min-h-0 justify-center shadow-none'>
        <CardContent className='text-center'>
          <Database className='text-muted-foreground mx-auto size-9' />
          <CardTitle className='mt-4'>请选择一个数据集</CardTitle>
          <CardDescription className='mt-2'>
            选择后可预览阶段分布、逾期数量和高优先级 badcase。
          </CardDescription>
        </CardContent>
      </Card>
    )
  }

  const previewMetrics = [
    { label: '总 badcase', value: dataset.totalCount },
    { label: '未关闭', value: dataset.openCount },
    {
      label: '逾期',
      value: dataset.overdueCount,
      className: dataset.overdueCount > 0 ? 'text-destructive' : '',
    },
    { label: 'P0/P1', value: dataset.highPriorityCount },
    { label: '创建人', value: dataset.owner },
    { label: '最近更新', value: dataset.updatedAt },
  ]
  const maxStageCount = Math.max(
    1,
    ...lifecycleStages.map((stage) => dataset.stageCounts[stage.value])
  )
  const stageBarRows = lifecycleStages.map((stage) => ({
    ...stage,
    count: dataset.stageCounts[stage.value],
    percent: Math.round((dataset.stageCounts[stage.value] / maxStageCount) * 100),
  }))

  return (
    <Card className='min-h-0 gap-4 py-4 shadow-none'>
      <CardHeader className='border-b px-4 pb-4'>
        <CardTitle>数据集治理预览</CardTitle>
        <CardDescription>{dataset.name}</CardDescription>
        <CardAction>
          <Badge variant='outline'>badcase</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className='min-h-0 space-y-4 overflow-auto px-4'>
        <section className='space-y-3'>
          <p className='text-muted-foreground line-clamp-2 text-sm'>
            {dataset.description}
          </p>
          <div className='flex flex-wrap gap-1.5'>
            {dataset.tags.map((tag) => (
              <Badge key={tag} variant='secondary'>
                {tag}
              </Badge>
            ))}
          </div>
        </section>

        <section className='grid grid-cols-3 gap-2'>
          {previewMetrics.map((metric) => (
            <div key={metric.label} className='bg-muted/30 rounded-md border p-3'>
              <div className='text-muted-foreground text-xs'>{metric.label}</div>
              <div
                className={cn(
                  'mt-1 truncate text-base font-semibold tabular-nums',
                  metric.className
                )}
              >
                {metric.value}
              </div>
            </div>
          ))}
        </section>

        <div className='rounded-md border'>
          <div className='border-b px-4 py-3 text-sm font-medium'>阶段分布</div>
          <div className='space-y-3 p-3'>
            {stageBarRows.map((row) => {
              const StageIcon = stageIconMap[row.value]

              return (
                <div
                  key={row.value}
                  className='grid grid-cols-[92px_minmax(0,1fr)_32px] items-center gap-3'
                >
                  <span className='text-muted-foreground flex min-w-0 items-center gap-2 text-xs'>
                    <StageIcon className='text-primary size-3.5 shrink-0' />
                    <span className='truncate'>{row.label}</span>
                  </span>
                  <span className='bg-muted block h-2.5 overflow-hidden rounded-full'>
                    <span
                      className='bg-primary block h-full rounded-full'
                      style={{ width: `${row.percent}%` }}
                      aria-label={`${row.label} 数量 ${row.count}`}
                    />
                  </span>
                  <span className='text-right text-sm font-semibold tabular-nums'>
                    {row.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const stageIconMap: Record<BadcaseStage, LucideIcon> = {
  PENDING_CONFIRM: ClipboardCheck,
  PENDING_ROOT_CAUSE: SearchCheck,
  FIXING: Wrench,
  PENDING_RETEST: RotateCcw,
  PENDING_VERIFY: ShieldCheck,
  CLOSED: CheckCircle2,
}

function buildDatasetColumns(
  selectedDatasetId: string | undefined,
  onSelect: (datasetId: string) => void,
  onEnter: (datasetId: string) => void
): ColumnDef<BadcaseDatasetCandidate>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='数据集名称' />
      ),
      cell: ({ row }) => (
        <Button
          variant='link'
          className={cn(
            'h-auto max-w-72 justify-start px-0 text-left',
            selectedDatasetId === row.original.id && 'font-semibold'
          )}
          onClick={() => onEnter(row.original.id)}
        >
          <span className='truncate'>{row.original.name}</span>
        </Button>
      ),
    },
    {
      id: 'tags',
      header: '标签',
      cell: ({ row }) => (
        <div className='flex max-w-52 flex-wrap gap-1'>
          {row.original.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant='outline'>
              {tag}
            </Badge>
          ))}
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'openCount',
      header: '未关闭',
      meta: { className: 'text-right' },
    },
    {
      accessorKey: 'overdueCount',
      header: '逾期',
      cell: ({ row }) => (
        <span
          className={cn(
            row.original.overdueCount > 0 && 'text-destructive font-medium'
          )}
        >
          {row.original.overdueCount}
        </span>
      ),
      meta: { className: 'text-right' },
    },
    {
      accessorKey: 'highPriorityCount',
      header: 'P0/P1',
      meta: { className: 'text-right' },
    },
    {
      accessorKey: 'owner',
      header: '创建人',
    },
    {
      accessorKey: 'updatedAt',
      header: '更新时间',
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant='outline'
          size='sm'
          onClick={() => onSelect(row.original.id)}
        >
          数据集详情
        </Button>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ]
}

async function listDatasetCandidates(
  datasets: BadcaseDatasetCandidate[],
  state: DataTableQueryState
): Promise<DataTableListResponse<BadcaseDatasetCandidate>> {
  const keyword = state.keyword.trim().toLowerCase()
  const hasOverdue = normalizeSingleFilter(state.filters.hasOverdue)
  const hasOpen = normalizeSingleFilter(state.filters.hasOpen)

  const filtered = datasets.filter((dataset) => {
    const searchable = [
      dataset.name,
      dataset.description,
      dataset.owner,
      ...dataset.tags,
    ]
      .join(' ')
      .toLowerCase()

    return (
      (!keyword || searchable.includes(keyword)) &&
      (!hasOverdue || String(dataset.overdueCount > 0) === hasOverdue) &&
      (!hasOpen || String(dataset.openCount > 0) === hasOpen)
    )
  })
  const start = (state.page - 1) * state.pageSize

  return {
    total: filtered.length,
    datas: filtered.slice(start, start + state.pageSize),
  }
}

function normalizeSingleFilter(value: unknown) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return String(value[0] ?? '')
  return ''
}
