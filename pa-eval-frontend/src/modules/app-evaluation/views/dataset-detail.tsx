import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Plus } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
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
  createProjectDatasetExportJob,
  createProjectDatasetItem,
  deleteProjectDatasetItem,
  downloadProjectDatasetExportJob,
  getProjectDataset,
  getProjectDatasetItemStatusCounts,
  getProjectDatasetMetricSummary,
  listProjectDatasetItems,
  pollDatasetExportJob,
  updateProjectDatasetItem,
} from '../api/dataset-api'
import { DatasetItemBulkActions } from '../components/dataset-item-bulk-actions'
import { createDatasetItemColumns } from '../components/dataset-item-columns'
import {
  DatasetItemFormDrawer,
  type DatasetItemDrawerIntent,
} from '../components/dataset-item-form-drawer'
import { DatasetTypeBadge } from '../components/dataset-type-badge'
import { downloadBlob, formatDateTime } from '../components/format'
import { getDatasetExportFileName } from '../lib/dataset-item-export'
import type {
  DatasetExportFormat,
  DatasetItemFormInput,
  DatasetItemRecord,
  DatasetRecord,
} from '../types'

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
  const [isExportingSelection, setIsExportingSelection] = useState(false)
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

  const handleExportAllMatching = useCallback(
    async (
      dataset: DatasetRecord,
      query: Parameters<typeof listProjectDatasetItems>[3],
      format: DatasetExportFormat = 'xlsx'
    ) => {
      if (isExportingSelection) {
        throw new Error('已有数据集导出任务正在处理中')
      }

      const statuses = query.filters.status as
        | DatasetItemRecord['status'][]
        | undefined
      setIsExportingSelection(true)
      try {
        const job = await createProjectDatasetExportJob(
          $api,
          projectId,
          dataset.id,
          format,
          { keyword: query.keyword, status: statuses }
        )
        toast.info('导出任务已创建，正在生成文件')
        const completedJob = await pollDatasetExportJob(
          $api,
          projectId,
          dataset.id,
          job.id
        )

        if (completedJob.status === 'FAILED') {
          throw new Error(completedJob.errorMessage || '数据集导出失败')
        }

        const blob = await downloadProjectDatasetExportJob(
          $api,
          projectId,
          dataset.id,
          completedJob.id
        )
        downloadBlob(
          blob,
          completedJob.fileName || getDatasetExportFileName(dataset, format)
        )
        toast.success(`已导出 ${completedJob.exportedCount} 条数据项`)
      } finally {
        setIsExportingSelection(false)
      }
    },
    [$api, isExportingSelection, projectId]
  )

  const dataset = datasetQuery.data
  const metrics = metricQuery.data

  const handleExportDataset = useCallback(
    async (format: DatasetExportFormat) => {
      if (!dataset) return

      try {
        await handleExportAllMatching(
          dataset,
          {
            page: 1,
            pageSize: 10,
            keyword: itemKeyword,
            filters: {},
            sorting: [],
          },
          format
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '数据集导出失败')
      }
    },
    [dataset, handleExportAllMatching, itemKeyword]
  )

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
                  {
                    id: 'export-dataset-xlsx',
                    label: '导出数据集 Excel',
                    icon: Download,
                    iconPosition: 'start',
                    variant: 'outline',
                    size: 'sm',
                    disabled: isExportingSelection || !dataset,
                    onClick: () => void handleExportDataset('xlsx'),
                  },
                  {
                    id: 'export-dataset-csv',
                    label: '导出数据集 CSV',
                    icon: Download,
                    iconPosition: 'start',
                    variant: 'outline',
                    size: 'sm',
                    disabled: isExportingSelection || !dataset,
                    onClick: () => void handleExportDataset('csv'),
                  },
                  {
                    id: 'export-dataset-txt',
                    label: '导出数据集 TXT',
                    icon: Download,
                    iconPosition: 'start',
                    variant: 'outline',
                    size: 'sm',
                    disabled: isExportingSelection || !dataset,
                    onClick: () => void handleExportDataset('txt'),
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
          <section className='bg-card text-card-foreground rounded-lg border p-4'>
            <div className='grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              <InfoItem label='名称' value={dataset.name} />
              <InfoItem
                label='描述'
                value={dataset.description || '-'}
              />
              <InfoItem label='类型' value={<DatasetTypeBadge type={dataset.type} />} />
              <InfoItem label='总数据量' value={String(metrics.total)} />
              <InfoItem label='运行数' value={String(dataset.runCount)} />
              <InfoItem label='有效数量' value={String(metrics.active)} />
              <InfoItem
                label='归档数量'
                value={String(metrics.archived)}
              />
              <InfoItem
                label='最近更新时间'
                value={formatDateTime(metrics.updatedAt)}
              />
            </div>
          </section>
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
              canEditDataset && dataset
                ? (table, selection) => (
                    <DatasetItemBulkActions
                      table={table}
                      selection={selection}
                      dataset={dataset}
                      onExportAllMatching={(query) =>
                        handleExportAllMatching(dataset, query, 'xlsx')
                      }
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
          ? 'flex min-w-0 items-center gap-2 sm:col-span-2 lg:col-span-2 xl:col-span-2'
          : 'flex items-center gap-2'
      }
    >
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span className='min-w-0 truncate font-medium'>{value}</span>
    </div>
  )
}
