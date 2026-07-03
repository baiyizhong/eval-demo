import { useCallback, useMemo, useState } from 'react'
import { Download, Plus, Upload } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageAction } from '@/components/common/page-action'
import { Page } from '@/components/common/page'
import {
  DataTable,
  type DataTableFilterBinding,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { ImportDialog } from '@/components/common/import-dialog'
import { Loading } from '@/components/common/loading'
import {
  archiveProjectDatasetItemMock,
  createProjectDatasetItemMock,
  exportProjectDatasetMock,
  getProjectDatasetMetricSummaryMock,
  getProjectDatasetMock,
  importProjectDatasetItemsMock,
  listProjectDatasetItemsMock,
  updateProjectDatasetItemMock,
} from '../api/mock-dataset-api'
import { createDatasetItemColumns } from '../components/dataset-item-columns'
import { DatasetItemBulkActions } from '../components/dataset-item-bulk-actions'
import { DatasetItemFormDrawer } from '../components/dataset-item-form-drawer'
import { DatasetTypeBadge } from '../components/dataset-type-badge'
import { downloadJson, formatDateTime } from '../components/format'
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
  const queryClient = useQueryClient()
  const {
    projectId = 'project_customer_agent',
    datasetId = '',
  } = useParams()
  const [importOpen, setImportOpen] = useState(false)
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DatasetItemRecord | null>(null)

  const datasetQuery = useQuery({
    queryKey: ['project-dataset', projectId, datasetId],
    queryFn: () => getProjectDatasetMock(projectId, datasetId),
    enabled: Boolean(datasetId),
  })
  const metricQuery = useQuery({
    queryKey: ['project-dataset-metrics', projectId, datasetId],
    queryFn: () => getProjectDatasetMetricSummaryMock(projectId, datasetId),
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

  const columns = useMemo(
    () =>
      createDatasetItemColumns({
        onEdit: (item) => {
          setEditingItem(item)
          setItemFormOpen(true)
        },
        onArchive: (item) => {
          void handleArchiveItem(projectId, datasetId, item, invalidateDetail)
        },
      }),
    [datasetId, invalidateDetail, projectId]
  )

  const handleSubmitItem = async (input: DatasetItemFormInput) => {
    if (editingItem) {
      await updateProjectDatasetItemMock(
        projectId,
        datasetId,
        editingItem.id,
        input
      )
      toast.success('数据项已更新')
    } else {
      await createProjectDatasetItemMock(projectId, datasetId, input)
      toast.success('数据项已创建')
    }
    await invalidateDetail()
  }

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
                id: 'import',
                label: '导入数据项',
                icon: Upload,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => setImportOpen(true),
              },
              {
                id: 'export',
                label: '全量导出数据集',
                icon: Download,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => {
                  void handleFullExport(projectId, datasetId)
                },
              },
              {
                id: 'create',
                label: '新增数据项',
                icon: Plus,
                iconPosition: 'start',
                size: 'sm',
                onClick: () => {
                  setEditingItem(null)
                  setItemFormOpen(true)
                },
              },
            ],
          }}
        >
          {dataset ? (
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <span className='truncate text-sm font-medium'>{dataset.name}</span>
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
            <section className='rounded-lg border bg-card p-4 text-card-foreground'>
              <div className='flex flex-wrap items-center gap-x-8 gap-y-3 text-sm'>
                <InfoItem label='名称' value={dataset.name} />
                <InfoItem label='描述' value={dataset.description || '-'} wide />
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

        <section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable<DatasetItemRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-dataset-items',
                projectId,
                datasetId,
                state,
              ],
              queryFn: (state) =>
                listProjectDatasetItemsMock(projectId, datasetId, state),
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
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title='导入数据项'
        description='请选择 CSV 或 JSONL 文件导入当前数据集。'
        fileTypes={['text/csv', '.csv', 'application/jsonl', '.jsonl']}
        onImport={(file) => {
          void importProjectDatasetItemsMock(projectId, datasetId, file).then(
            async (result) => {
              await invalidateDetail()
              toast.success(`已导入 ${result.successCount} 条数据项`)
            }
          )
        }}
      />
      <DatasetItemFormDrawer
        open={itemFormOpen}
        item={editingItem}
        onOpenChange={setItemFormOpen}
        onSubmit={handleSubmitItem}
      />
    </Page>
  )
}

function MetricCard({
  title,
  value,
}: {
  title: string
  value: string
}) {
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
    <div className={wide ? 'flex min-w-64 max-w-xl items-center gap-2' : 'flex items-center gap-2'}>
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span className='min-w-0 truncate font-medium'>{value}</span>
    </div>
  )
}

async function handleFullExport(projectId: string, datasetId: string) {
  const payload = await exportProjectDatasetMock(projectId, datasetId)
  downloadJson(`dataset-${datasetId}-${Date.now()}.json`, payload)
  toast.success(`已全量导出 ${payload.items.length} 条数据项`)
}

async function handleArchiveItem(
  projectId: string,
  datasetId: string,
  item: DatasetItemRecord,
  onArchived: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '归档数据项',
    desc: `归档后数据项 ${item.id} 将不再作为 ACTIVE 样本，确定继续吗？`,
    confirmText: '归档',
  })

  if (!confirmed) return

  await archiveProjectDatasetItemMock(projectId, datasetId, item.id)
  await onArchived()
  toast.success(`已归档数据项：${item.id}`)
}
