import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
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
  getProjectDataset,
  getProjectDatasetMetricSummary,
  listProjectDatasetItems,
  updateProjectDatasetItem,
} from '../api/dataset-api'
import { DatasetItemBulkActions } from '../components/dataset-item-bulk-actions'
import { createDatasetItemColumns } from '../components/dataset-item-columns'
import { DatasetItemFormDrawer } from '../components/dataset-item-form-drawer'
import { DatasetTypeBadge } from '../components/dataset-type-badge'
import { formatDateTime } from '../components/format'
import type { DatasetItemFormInput, DatasetItemRecord } from '../types'

const itemUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'status', type: 'array' },
]

const itemToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'status',
    title: '状态',
    options: [
      { label: 'ACTIVE', value: 'ACTIVE' },
      { label: 'ARCHIVED', value: 'ARCHIVED' },
    ],
  },
]

export function ProjectDatasetDetail() {
  const navigate = useNavigate()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { projectId = 'project_customer_agent', datasetId = '' } = useParams()
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DatasetItemRecord | null>(null)

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

  const invalidateDetail = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-dataset', projectId, datasetId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-dataset-metrics', projectId, datasetId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-dataset-items', projectId, datasetId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-datasets', projectId],
        }),
      ]),
    [datasetId, projectId, queryClient]
  )

  const saveItemMutation = useMutation({
    mutationFn: (input: DatasetItemFormInput) =>
      editingItem
        ? updateProjectDatasetItem(
            $api,
            projectId,
            datasetId,
            editingItem.id,
            input
          )
        : createProjectDatasetItem($api, projectId, datasetId, input),
    onSuccess: async () => {
      await invalidateDetail()
      setEditingItem(null)
      toast.success(editingItem ? '数据项已更新' : '数据项已新增')
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

  const handleCreateItem = useCallback(() => {
    setEditingItem(null)
    setItemDrawerOpen(true)
  }, [])

  const handleEditItem = useCallback((item: DatasetItemRecord) => {
    setEditingItem(item)
    setItemDrawerOpen(true)
  }, [])

  const handleArchiveItem = useCallback(
    async (item: DatasetItemRecord) => {
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
    [archiveItem]
  )

  const columns = useMemo(
    () =>
      createDatasetItemColumns({
        onEdit: handleEditItem,
        onArchive: (item) => {
          void handleArchiveItem(item)
        },
      }),
    [handleArchiveItem, handleEditItem]
  )

  const dataset = datasetQuery.data
  const metrics = metricQuery.data

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() => navigate(`/projects/${projectId}/evaluation/datasets`)}
          buttonGroups={{
            buttons: [
              {
                id: 'create-dataset-item',
                label: '新增数据项',
                icon: Plus,
                iconPosition: 'start',
                size: 'sm',
                onClick: handleCreateItem,
              },
            ],
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
            bulkActions={(table) => (
              <DatasetItemBulkActions
                table={table}
                projectId={projectId}
                datasetId={datasetId}
              />
            )}
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
        open={itemDrawerOpen}
        item={editingItem}
        onOpenChange={(open) => {
          setItemDrawerOpen(open)
          if (!open) {
            setEditingItem(null)
          }
        }}
        onSubmit={async (input) => {
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
