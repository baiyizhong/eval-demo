import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  downloadProjectDatasetExportJob,
  getProjectDataset,
  getProjectDatasetMetricSummary,
  listProjectDatasetItems,
  pollDatasetExportJob,
  updateProjectDatasetItem,
} from '../api/dataset-api'
import { DatasetItemBulkActions } from '../components/dataset-item-bulk-actions'
import { createDatasetItemColumns } from '../components/dataset-item-columns'
import { DatasetItemFormDrawer } from '../components/dataset-item-form-drawer'
import { DatasetTypeBadge } from '../components/dataset-type-badge'
import { formatDateTime } from '../components/format'
import type {
  DatasetExportFormat,
  DatasetItemFormInput,
  DatasetItemRecord,
} from '../types'

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
  const { can } = usePermission({ type: 'project', projectId })
  const canEditDataset = can('project:dataset:edit')
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DatasetItemRecord | null>(null)
  const [exportingFormat, setExportingFormat] =
    useState<DatasetExportFormat | null>(null)

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
    if (!canEditDataset) return
    setEditingItem(null)
    setItemDrawerOpen(true)
  }, [canEditDataset])

  const handleEditItem = useCallback((item: DatasetItemRecord) => {
    if (!canEditDataset) return
    setEditingItem(item)
    setItemDrawerOpen(true)
  }, [canEditDataset])

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

  const handleExportDataset = useCallback(
    async (format: DatasetExportFormat) => {
      if (!datasetId || exportingFormat) {
        return
      }

      setExportingFormat(format)
      try {
        const job = await createProjectDatasetExportJob(
          $api,
          projectId,
          datasetId,
          format
        )
        toast.info('导出任务已创建，正在生成文件')
        const completedJob = await pollDatasetExportJob(
          $api,
          projectId,
          datasetId,
          job.id
        )

        if (completedJob.status === 'FAILED') {
          throw new Error(completedJob.errorMessage || '数据集导出失败')
        }

        const blob = await downloadProjectDatasetExportJob(
          $api,
          projectId,
          datasetId,
          completedJob.id
        )
        downloadBlob(
          blob,
          completedJob.fileName ||
            `dataset-${datasetId}-${completedJob.id}.${format}`
        )
        toast.success('数据集导出完成')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '数据集导出失败')
      } finally {
        setExportingFormat(null)
      }
    },
    [$api, datasetId, exportingFormat, projectId]
  )

  const columns = useMemo(
    () =>
      createDatasetItemColumns({
        readOnly: !canEditDataset,
        onEdit: handleEditItem,
        onArchive: (item) => {
          void handleArchiveItem(item)
        },
      }),
    [canEditDataset, handleArchiveItem, handleEditItem]
  )

  const dataset = datasetQuery.data
  const metrics = metricQuery.data

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() => navigate(`/projects/${projectId}/evaluation/datasets`)}
          actions={
            <DatasetExportMenu
              exportingFormat={exportingFormat}
              onExport={(format) => {
                void handleExportDataset(format)
              }}
            />
          }
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
        open={canEditDataset && itemDrawerOpen}
        item={editingItem}
        onOpenChange={(open) => {
          setItemDrawerOpen(open)
          if (!open) {
            setEditingItem(null)
          }
        }}
        onSubmit={async (input) => {
          if (!canEditDataset) return
          await saveItemMutation.mutateAsync(input)
        }}
      />
    </Page>
  )
}

const exportFormatOptions: {
  value: DatasetExportFormat
  label: string
}[] = [
  { value: 'xlsx', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
  { value: 'txt', label: 'TXT' },
]

function DatasetExportMenu({
  exportingFormat,
  onExport,
}: {
  exportingFormat: DatasetExportFormat | null
  onExport: (format: DatasetExportFormat) => void
}) {
  const isExporting = Boolean(exportingFormat)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type='button' variant='outline' size='sm' disabled={isExporting}>
          {isExporting ? (
            <Loader2 className='size-4 animate-spin' data-icon='inline-start' />
          ) : (
            <Download className='size-4' data-icon='inline-start' />
          )}
          <span>导出数据集</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {exportFormatOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            disabled={isExporting}
            onSelect={() => onExport(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
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
