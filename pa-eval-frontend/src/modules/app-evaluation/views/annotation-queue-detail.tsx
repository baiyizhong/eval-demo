import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, RefreshCw } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
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
  deleteProjectAnnotationQueueItems,
  getProjectAnnotationQueue,
  getProjectAnnotationQueueItemFilterCounts,
  getProjectAnnotationQueueMetricSummary,
  listProjectAnnotationQueueItems,
  listProjectAnnotationUsers,
} from '../api/annotation-api'
import { AnnotationExportDialog } from '../components/annotation-export-dialog'
import { AnnotationQueueItemBulkActions } from '../components/annotation-queue-item-bulk-actions'
import { createAnnotationQueueItemColumns } from '../components/annotation-queue-item-columns'
import { formatDateTime } from '../components/format'
import type { AnnotationQueueItemRecord, ProjectUserRecord } from '../types'

const itemUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'status', type: 'array' },
  { fieldId: 'objectType', type: 'array' },
  { fieldId: 'assigneeIds', columnId: 'assignee', type: 'array' },
]

export function ProjectAnnotationQueueDetail() {
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { projectId = 'project_customer_agent', queueId = '' } = useParams()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditAnnotation = can('project:annotation:edit')
  const [selectedExportDialogOpen, setSelectedExportDialogOpen] =
    useState(false)
  const [selectedExportItemIds, setSelectedExportItemIds] = useState<string[]>(
    []
  )

  const queryState = useMemo<DataTableQueryState>(
    () => ({
      page: Number(searchParams.get('page') ?? 1),
      pageSize: Number(searchParams.get('pageSize') ?? 10),
      keyword: searchParams.get('keyword') ?? '',
      filters: {
        status: searchParams.getAll('status'),
        objectType: searchParams.getAll('objectType'),
        assigneeIds: searchParams.getAll('assigneeIds'),
      },
      sorting: [],
    }),
    [searchParams]
  )
  const queueQuery = useQuery({
    queryKey: ['project-annotation-queue', $api, projectId, queueId],
    queryFn: () => getProjectAnnotationQueue($api, projectId, queueId),
    enabled: Boolean(queueId),
  })
  const metricQuery = useQuery({
    queryKey: ['project-annotation-queue-metrics', $api, projectId, queueId],
    queryFn: () =>
      getProjectAnnotationQueueMetricSummary($api, projectId, queueId),
    enabled: Boolean(queueId),
  })
  const usersQuery = useQuery({
    queryKey: ['project-annotation-users', $api, projectId],
    queryFn: () => listProjectAnnotationUsers($api, projectId),
  })
  const filterCountsQuery = useQuery({
    queryKey: [
      'project-annotation-queue-item-filter-counts',
      $api,
      projectId,
      queueId,
      queryState,
    ],
    queryFn: () =>
      getProjectAnnotationQueueItemFilterCounts(
        $api,
        projectId,
        queueId,
        queryState
      ),
    enabled: Boolean(queueId),
  })

  const invalidateDetail = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-metrics'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-items'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-item-filter-counts'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queues'],
        }),
      ]),
    [queryClient]
  )

  const columns = useMemo(
    () =>
      createAnnotationQueueItemColumns({
        projectId,
        queueId,
        canEdit: canEditAnnotation,
        onDelete: canEditAnnotation
          ? (item) => {
              void handleDeleteItem(
                $api,
                projectId,
                queueId,
                item,
                invalidateDetail
              )
            }
          : undefined,
      }),
    [$api, canEditAnnotation, invalidateDetail, projectId, queueId]
  )
  const toolbarFilters = useMemo(
    () =>
      createItemToolbarFilters({
        users: usersQuery.data ?? [],
        statusCounts: filterCountsQuery.data?.status,
        objectTypeCounts: filterCountsQuery.data?.objectType,
        assigneeCounts: filterCountsQuery.data?.assigneeIds,
      }),
    [
      filterCountsQuery.data?.assigneeIds,
      filterCountsQuery.data?.objectType,
      filterCountsQuery.data?.status,
      usersQuery.data,
    ]
  )

  const queue = queueQuery.data
  const metrics = metricQuery.data

  const handleRefresh = async () => {
    await invalidateDetail()
    toast.success('人工标注任务详情已刷新')
  }

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
                id: 'refresh',
                label: '刷新',
                icon: RefreshCw,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => void handleRefresh(),
              },
              ...(canEditAnnotation
                ? [
                    {
                      id: 'batch-annotate',
                      label: '批量标注',
                      icon: ListChecks,
                      iconPosition: 'start' as const,
                      size: 'sm' as const,
                      onClick: () => {
                        navigate(
                          `/projects/${projectId}/evaluation/annotation-queues/${queueId}/batch-annotate`
                        )
                      },
                    },
                  ]
                : []),
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
                $api,
                projectId,
                queueId,
                state,
              ],
              queryFn: (state) =>
                listProjectAnnotationQueueItems(
                  $api,
                  projectId,
                  queueId,
                  state
                ),
              enabled: Boolean(queueId),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: itemUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '搜索数据 ID / 源数据 ID / JSON 内容',
              filters: toolbarFilters,
              columnLabels: {
                id: '数据 ID',
                objectType: '类型',
                objectId: '源数据 ID',
                status: '状态',
                completedAt: '完成时间',
                assignee: '预设处理人',
                completedBy: '实际处理人',
              },
            }}
            bulkActions={(table) => (
              <AnnotationQueueItemBulkActions
                table={table}
                api={$api}
                projectId={projectId}
                queueId={queueId}
                users={usersQuery.data ?? []}
                canEdit={canEditAnnotation}
                onChanged={invalidateDetail}
                onExportSelected={(ids) => {
                  setSelectedExportItemIds(ids)
                  setSelectedExportDialogOpen(true)
                }}
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
        <AnnotationExportDialog
          open={selectedExportDialogOpen}
          onOpenChange={(open) => {
            setSelectedExportDialogOpen(open)
            if (!open) setSelectedExportItemIds([])
          }}
          api={$api}
          projectId={projectId}
          queueId={queueId}
          scope='selected'
          filters={{ itemIds: selectedExportItemIds }}
          itemIds={selectedExportItemIds}
        />
      </div>
    </Page>
  )
}

function createItemToolbarFilters({
  users,
  statusCounts,
  objectTypeCounts,
  assigneeCounts: rawAssigneeCounts,
}: {
  users: ProjectUserRecord[]
  statusCounts?: Record<string, number>
  objectTypeCounts?: Record<string, number>
  assigneeCounts?: Record<string, number>
}): DataTableToolbarFilter[] {
  const assigneeCounts = Object.fromEntries(
    users.map((user) => [user.id, rawAssigneeCounts?.[user.id] ?? 0])
  )

  return [
    {
      columnId: 'status',
      title: '状态',
      optionCounts: statusCounts,
      options: [
        { label: '待处理', value: 'PENDING' },
        { label: '已完成', value: 'COMPLETED' },
      ],
    },
    {
      columnId: 'objectType',
      title: '类型',
      optionCounts: objectTypeCounts,
      options: [
        { label: '追踪', value: 'TRACE' },
        { label: '观测', value: 'OBSERVATION' },
        { label: '会话', value: 'SESSION' },
      ],
    },
    {
      columnId: 'assignee',
      title: '预设处理人',
      optionCounts: assigneeCounts,
      options: users.map((user) => ({
        label: user.name || user.email,
        value: user.id,
      })),
    },
  ]
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

async function handleDeleteItem(
  $api: Parameters<typeof deleteProjectAnnotationQueueItems>[0],
  projectId: string,
  queueId: string,
  item: AnnotationQueueItemRecord,
  onDeleted: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '删除标注数据',
    desc: `将仅移除 ${item.id} 这条队列数据，不删除源对象、历史评分或数据集项。确定继续吗？`,
    confirmText: '删除',
    destructive: true,
  })

  if (!confirmed) return

  await deleteProjectAnnotationQueueItems($api, projectId, queueId, [item.id])
  await onDeleted()
  toast.success(`已删除标注数据：${item.id}`)
}
