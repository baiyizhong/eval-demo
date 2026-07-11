import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DataTable,
  type DataTableFilterBinding,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import {
  archiveProjectDatasetItem,
  createProjectDatasetItem,
  deleteProjectDatasetItem,
  getProjectDataset,
  getProjectDatasetItemStatusCounts,
  getProjectDatasetMetricSummary,
  listProjectDatasetItems,
  updateProjectDatasetItem,
} from '../api/dataset-api'
import { DatasetItemBulkActions } from '../components/dataset-item-bulk-actions'
import { createDatasetItemColumns } from '../components/dataset-item-columns'
import {
  DatasetItemFormDrawer,
  type DatasetItemDrawerIntent,
} from '../components/dataset-item-form-drawer'
import { DatasetTypeBadge } from '../components/dataset-type-badge'
import { formatDateTime } from '../components/format'
import type { DatasetItemFormInput, DatasetItemRecord } from '../types'

const itemUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'status', type: 'array' },
]

export function ProjectDatasetDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { projectId = 'project_customer_agent', datasetId = '' } = useParams()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditDataset = can('project:dataset:edit')
  const [itemDrawerIntent, setItemDrawerIntent] =
    useState<DatasetItemDrawerIntent | null>(null)
  const [selectedItem, setSelectedItem] = useState<DatasetItemRecord | null>(
    null
  )
  const itemKeyword = searchParams.get('keyword') ?? ''

  const datasetQuery = useQuery({
    queryKey: ['project-dataset', $api, projectId, datasetId],
    queryFn: () => getProjectDataset($api, projectId, datasetId),
    enabled: Boolean(datasetId),
  })
  const metricQuery = useQuery({
    queryKey: ['project-dataset-metrics', $api, projectId, datasetId],
    queryFn: () => getProjectDatasetMetricSummary($api, projectId, datasetId),
    enabled: Boolean(datasetId),
  })
  const statusCountsQuery = useQuery({
    queryKey: [
      'project-dataset-item-status-counts',
      $api,
      projectId,
      datasetId,
      itemKeyword,
    ],
    queryFn: () =>
      getProjectDatasetItemStatusCounts($api, projectId, datasetId, {
        keyword: itemKeyword,
      }),
    enabled: Boolean(datasetId),
  })

  const invalidateDetail = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-dataset', $api, projectId, datasetId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-dataset-metrics', $api, projectId, datasetId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-dataset-items', $api, projectId, datasetId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'project-dataset-item-status-counts',
            $api,
            projectId,
            datasetId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-datasets', projectId],
        }),
      ]),
    [$api, datasetId, projectId, queryClient]
  )

  const saveItemMutation = useMutation({
    mutationFn: (input: DatasetItemFormInput) =>
      itemDrawerIntent === 'edit' && selectedItem
        ? updateProjectDatasetItem(
            $api,
            projectId,
            datasetId,
            selectedItem.id,
            input
          )
        : createProjectDatasetItem($api, projectId, datasetId, input),
    onSuccess: async () => {
      await invalidateDetail()
      const message =
        itemDrawerIntent === 'edit' ? '数据项已更新' : '数据项已新增'
      setSelectedItem(null)
      setItemDrawerIntent(null)
      toast.success(message)
    },
  })

  const archiveItemMutation = useMutation({
    mutationFn: (item: DatasetItemRecord) =>
      archiveProjectDatasetItem($api, projectId, datasetId, item.id),
    onSuccess: async () => {
      await invalidateDetail()
      toast.success('数据项已归档')
    },
  })
  const archiveItem = archiveItemMutation.mutateAsync

  const deleteItemMutation = useMutation({
    mutationFn: (item: DatasetItemRecord) =>
      deleteProjectDatasetItem($api, projectId, datasetId, item.id),
    onSuccess: async () => {
      await invalidateDetail()
      toast.success('数据项已删除')
    },
  })
  const deleteItem = deleteItemMutation.mutateAsync

  const handleCreateItem = useCallback(() => {
    if (!canEditDataset) return
    setSelectedItem(null)
    setItemDrawerIntent('create')
  }, [canEditDataset])

  const handleViewItem = useCallback((item: DatasetItemRecord) => {
    setSelectedItem(item)
    setItemDrawerIntent('view')
  }, [])

  const handleEditItem = useCallback(
    (item: DatasetItemRecord) => {
      if (!canEditDataset) return
      setSelectedItem(item)
      setItemDrawerIntent('edit')
    },
    [canEditDataset]
  )

  const handleArchiveItem = useCallback(
    async (item: DatasetItemRecord) => {
      if (!canEditDataset) return

      if (
        await confirm({
          title: '归档数据项',
          desc: `确定归档数据项「${item.id}」吗？归档后仍可通过状态筛选查看。`,
          confirmText: '归档',
          destructive: true,
        })
      ) {
        await archiveItem(item)
      }
    },
    [archiveItem, canEditDataset]
  )

  const handleDeleteItem = useCallback(
    async (item: DatasetItemRecord) => {
      if (!canEditDataset) return

      if (
        await confirm({
          title: '删除数据项',
          desc: `确定删除数据项「${item.id}」吗？此操作不可撤销。`,
          confirmText: '删除',
          destructive: true,
        })
      ) {
        await deleteItem(item)
      }
    },
    [canEditDataset, deleteItem]
  )

  const handleOpenSourceTrace = useCallback(
    async (traceId: string) => {
      const normalizedTraceId = traceId.trim()

      if (!normalizedTraceId) {
        toast.info('该数据项没有关联 Trace ID')
        return
      }

      try {
        await $api.getProjectTrace({
          path: { projectId, traceId: normalizedTraceId },
        })
        navigate(
          `/projects/${projectId}/observability/traces/logs?traceId=${encodeURIComponent(normalizedTraceId)}`
        )
      } catch {
        toast.error('Trace 不存在或已删除')
      }
    },
    [$api, navigate, projectId]
  )

  const dataset = datasetQuery.data
  const metrics = metricQuery.data

  const columns = useMemo(
    () =>
      createDatasetItemColumns({
        readOnly: !canEditDataset,
        onView: handleViewItem,
        onOpenTrace: handleOpenSourceTrace,
        onEdit: handleEditItem,
        onArchive: (item) => {
          void handleArchiveItem(item)
        },
        onDelete: (item) => {
          void handleDeleteItem(item)
        },
      }),
    [
      canEditDataset,
      handleArchiveItem,
      handleDeleteItem,
      handleEditItem,
      handleOpenSourceTrace,
      handleViewItem,
    ]
  )

  const itemToolbarFilters = useMemo<DataTableToolbarFilter[]>(
    () => [
      {
        columnId: 'status',
        title: '状态',
        optionCounts: statusCountsQuery.data,
        options: [
          { label: 'ACTIVE', value: 'ACTIVE' },
          { label: 'ARCHIVED', value: 'ARCHIVED' },
        ],
      },
    ],
    [statusCountsQuery.data]
  )

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() => navigate(`/projects/${projectId}/evaluation/datasets`)}
          buttonGroups={{
            buttons: canEditDataset
              ? [
                  {
                    id: 'create-dataset-item',
                    label: '新增数据项',
                    icon: Plus,
                    iconPosition: 'start',
                    size: 'sm',
                    onClick: handleCreateItem,
                  },
                ]
              : [],
          }}
        >
          {dataset ? (
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <span className='truncate text-sm font-medium'>
                {dataset.name}
              </span>
              <DatasetTypeBadge type={dataset.type} />
            </div>
          ) : null}
        </PageAction>

        {datasetQuery.isLoading || metricQuery.isLoading ? (
          <Loading text='加载数据集详情中...' className='flex-1' />
        ) : null}

        {dataset && metrics ? (
          <>
            <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
              <MetricCard title='总数据量' value={String(metrics.total)} />
              <MetricCard title='ACTIVE 数量' value={String(metrics.active)} />
              <MetricCard
                title='ARCHIVED 数量'
                value={String(metrics.archived)}
              />
              <MetricCard
                title='最近更新时间'
                value={formatDateTime(metrics.updatedAt)}
              />
            </section>
            <section className='bg-card text-card-foreground rounded-lg border p-4'>
              <div className='flex flex-wrap items-center gap-x-8 gap-y-3 text-sm'>
                <InfoItem label='名称' value={dataset.name} />
                <InfoItem
                  label='描述'
                  value={dataset.description || '-'}
                  wide
                />
                <InfoItem
                  label='类型'
                  value={<DatasetTypeBadge type={dataset.type} />}
                />
                <InfoItem label='运行数' value={String(dataset.runCount)} />
                <InfoItem
                  label='创建时间'
                  value={formatDateTime(dataset.createdAt)}
                />
              </div>
            </section>
          </>
        ) : null}

        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          <DataTable<DatasetItemRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-dataset-items',
                $api,
                projectId,
                datasetId,
                state,
              ],
              queryFn: (state) =>
                listProjectDatasetItems($api, projectId, datasetId, state),
              enabled: Boolean(datasetId),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: itemUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '搜索 item id / JSON 内容',
              filters: itemToolbarFilters,
              columnLabels: {
                id: 'Item ID',
                status: '状态',
                input: 'Input',
                expectedOutput: 'Expected Output',
                metadata: 'Metadata',
                sourceTraceId: 'Source',
                createdAt: '创建时间',
              },
            }}
            bulkActions={
              canEditDataset
                ? (table) => (
                    <DatasetItemBulkActions
                      table={table}
                      projectId={projectId}
                      datasetId={datasetId}
                    />
                  )
                : undefined
            }
            loadingText={
              <Loading
                text='加载数据项中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前筛选条件下暂无数据项'
            minTableWidth={1280}
          />
        </section>
      </div>
      <DatasetItemFormDrawer
        open={Boolean(itemDrawerIntent)}
        intent={itemDrawerIntent ?? 'create'}
        item={selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setItemDrawerIntent(null)
            setSelectedItem(null)
          }
        }}
        onSubmit={async (input) => {
          if (!canEditDataset || itemDrawerIntent === 'view') return
          await saveItemMutation.mutateAsync(input)
        }}
      />
    </Page>
  )
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-muted-foreground text-sm font-normal'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-xl font-semibold'>{value}</div>
      </CardContent>
    </Card>
  )
}

function InfoItem({
  label,
  value,
  wide,
}: {
  label: string
  value: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={
        wide
          ? 'flex max-w-xl min-w-64 items-center gap-2'
          : 'flex items-center gap-2'
      }
    >
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span className='min-w-0 truncate font-medium'>{value}</span>
    </div>
  )
}
