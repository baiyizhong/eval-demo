import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DataTable,
  type DataTableFilterBinding,
  type DataTableQueryState,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import {
  deleteProjectAnnotationQueueItemsMock,
  exportProjectAnnotationQueueMock,
  getProjectAnnotationQueueMetricSummaryMock,
  getProjectAnnotationQueueMock,
  listProjectAnnotationQueueItemsMock,
} from '../api/mock-annotation-api'
import { AnnotationQueueItemBulkActions } from '../components/annotation-queue-item-bulk-actions'
import { createAnnotationQueueItemColumns } from '../components/annotation-queue-item-columns'
import { downloadJson, formatDateTime } from '../components/format'
import type { AnnotationQueueItemRecord } from '../types'

const itemUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'status', type: 'array' },
  { fieldId: 'objectType', type: 'array' },
  { fieldId: 'completedBy', type: 'array' },
]

const itemToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'status',
    title: '状态',
    options: [
      { label: '待处理', value: 'PENDING' },
      { label: '已完成', value: 'COMPLETED' },
    ],
  },
  {
    columnId: 'objectType',
    title: '类型',
    options: [
      { label: '追踪', value: 'TRACE' },
      { label: '观测', value: 'OBSERVATION' },
      { label: '会话', value: 'SESSION' },
    ],
  },
  {
    columnId: 'completedBy',
    title: '完成人',
    options: [
      { label: '张三', value: 'user_annotator_a' },
      { label: '李四', value: 'user_annotator_b' },
    ],
  },
]

export function ProjectAnnotationQueueDetail() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { projectId = 'project_customer_agent', queueId = '' } = useParams()

  const queryState = useMemo<DataTableQueryState>(
    () => ({
      page: Number(searchParams.get('page') ?? 1),
      pageSize: Number(searchParams.get('pageSize') ?? 10),
      keyword: searchParams.get('keyword') ?? '',
      filters: {
        status: searchParams.getAll('status'),
        objectType: searchParams.getAll('objectType'),
        completedBy: searchParams.getAll('completedBy'),
      },
      sorting: [],
    }),
    [searchParams]
  )

  const queueQuery = useQuery({
    queryKey: ['project-annotation-queue', projectId, queueId],
    queryFn: () => getProjectAnnotationQueueMock(projectId, queueId),
    enabled: Boolean(queueId),
  })
  const metricQuery = useQuery({
    queryKey: ['project-annotation-queue-metrics', projectId, queueId],
    queryFn: () =>
      getProjectAnnotationQueueMetricSummaryMock(projectId, queueId),
    enabled: Boolean(queueId),
  })

  const invalidateDetail = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue', projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-metrics', projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-items', projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queues', projectId],
        }),
      ]),
    [projectId, queueId, queryClient]
  )

  const columns = useMemo(
    () =>
      createAnnotationQueueItemColumns({
        projectId,
        queueId,
        onDelete: (item) => {
          void handleDeleteItem(projectId, queueId, item, invalidateDetail)
        },
      }),
    [invalidateDetail, projectId, queueId]
  )

  const queue = queueQuery.data
  const metrics = metricQuery.data

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() =>
            navigate(`/projects/${projectId}/evaluation/annotation-queues`)
          }
          buttonGroups={{
            buttons: [
              {
                id: 'export',
                label: '全量导出',
                icon: Download,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => {
                  void handleFullExport(projectId, queueId, queryState)
                },
              },
            ],
          }}
        >
          {queue ? (
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <span className='truncate text-sm font-medium'>{queue.name}</span>
              <span className='text-muted-foreground text-sm'>
                {queue.assignees.map((user) => user.name).join('、') ||
                  '未分配'}
              </span>
            </div>
          ) : null}
        </PageAction>

        {queueQuery.isLoading || metricQuery.isLoading ? (
          <Loading text='加载人工标注任务详情中...' className='flex-1' />
        ) : null}

        {queue && metrics ? (
          <>
            <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
              <MetricCard title='总量' value={String(metrics.total)} />
              <MetricCard title='待处理' value={String(metrics.pending)} />
              <MetricCard title='已完成' value={String(metrics.completed)} />
              <MetricCard
                title='完成率'
                value={`${metrics.completionRate}%`}
                description={`最近更新 ${formatDateTime(metrics.updatedAt)}`}
              />
            </section>
          </>
        ) : null}

        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          <DataTable<AnnotationQueueItemRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-annotation-queue-items',
                projectId,
                queueId,
                state,
              ],
              queryFn: (state) =>
                listProjectAnnotationQueueItemsMock(projectId, queueId, state),
              enabled: Boolean(queueId),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: itemUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '搜索数据 ID / 源对象 / JSON 内容',
              filters: itemToolbarFilters,
              columnLabels: {
                id: '数据 ID',
                objectType: '类型',
                'source.title': '源对象',
                objectId: '源对象 ID',
                status: '状态',
                completedAt: '完成时间',
                completedBy: '完成人',
              },
            }}
            bulkActions={(table) => (
              <AnnotationQueueItemBulkActions
                table={table}
                projectId={projectId}
                queueId={queueId}
                onChanged={invalidateDetail}
              />
            )}
            loadingText={
              <Loading
                text='加载队列数据中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前筛选条件下暂无标注数据'
            minTableWidth={1320}
          />
        </section>
      </div>
    </Page>
  )
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-muted-foreground text-sm font-medium'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-semibold'>{value}</div>
        {description ? (
          <div className='text-muted-foreground mt-1 text-xs'>
            {description}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

async function handleFullExport(
  projectId: string,
  queueId: string,
  queryState: DataTableQueryState
) {
  const payload = await exportProjectAnnotationQueueMock(
    projectId,
    queueId,
    queryState
  )
  downloadJson(`annotation-queue-${queueId}-${Date.now()}.json`, payload)
  toast.success(`已导出 ${payload.items.length} 条标注数据`)
}

async function handleDeleteItem(
  projectId: string,
  queueId: string,
  item: AnnotationQueueItemRecord,
  onDeleted: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '删除标注数据',
    desc: `将仅移除 ${item.id} 这条 mock 队列数据，不删除源对象、历史评分或数据集项。确定继续吗？`,
    confirmText: '删除',
    destructive: true,
  })

  if (!confirmed) return

  await deleteProjectAnnotationQueueItemsMock(projectId, queueId, [item.id])
  await onDeleted()
  toast.success(`已删除标注数据：${item.id}`)
}
