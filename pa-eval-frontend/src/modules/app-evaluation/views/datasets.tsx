import { useCallback, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Page } from '@/components/common/page'
import {
  DataTable,
  type DataTableQueryState,
} from '@/components/common/data-table'
import { ImportDialog } from '@/components/common/import-dialog'
import { Loading } from '@/components/common/loading'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  createProjectDatasetMock,
  deleteProjectDatasetMock,
  exportProjectDatasetMock,
  importProjectDatasetItemsMock,
  listProjectDatasetsMock,
  updateProjectDatasetMock,
} from '../api/mock-dataset-api'
import { createDatasetColumns } from '../components/dataset-columns'
import { DatasetFormDrawer } from '../components/dataset-form-drawer'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import { downloadJson } from '../components/format'
import {
  datasetTypeLabels,
  type DatasetFormInput,
  type DatasetRecord,
  type DatasetTypeFilter,
} from '../types'

const datasetTabs: { label: string; value: DatasetTypeFilter }[] = [
  { label: '全部', value: 'all' },
  { label: datasetTypeLabels.evaluation, value: 'evaluation' },
  { label: datasetTypeLabels.badcase, value: 'badcase' },
  { label: datasetTypeLabels.golden, value: 'golden' },
  { label: datasetTypeLabels.anomaly, value: 'anomaly' },
]

export function ProjectDatasets() {
  const { projectId = 'project_customer_agent' } = useParams()
  const queryClient = useQueryClient()
  const [activeType, setActiveType] = useState<DatasetTypeFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingDataset, setEditingDataset] = useState<DatasetRecord | null>(
    null
  )
  const [importDataset, setImportDataset] = useState<DatasetRecord | null>(null)

  const invalidateDatasets = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['project-datasets', projectId],
      }),
    [projectId, queryClient]
  )

  const columns = useMemo(
    () =>
      createDatasetColumns({
        projectId,
        onEdit: (dataset) => {
          setEditingDataset(dataset)
          setFormOpen(true)
        },
        onImport: setImportDataset,
        onExport: (dataset) => {
          void handleExportDataset(projectId, dataset)
        },
        onDelete: (dataset) => {
          void handleDeleteDataset(projectId, dataset, invalidateDatasets)
        },
      }),
    [invalidateDatasets, projectId]
  )

  const handleSubmitDataset = async (input: DatasetFormInput) => {
    if (editingDataset) {
      await updateProjectDatasetMock(projectId, editingDataset.id, input)
      toast.success('数据集已更新')
    } else {
      await createProjectDatasetMock(projectId, input)
      toast.success('数据集已创建')
    }
    await invalidateDatasets()
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav
          buttonGroups={{
            buttons: [
              {
                id: 'create',
                label: '新建数据集',
                icon: Plus,
                iconPosition: 'start',
                size: 'sm',
                onClick: () => {
                  setEditingDataset(null)
                  setFormOpen(true)
                },
              },
            ],
          }}
        />
        <Tabs
          value={activeType}
          onValueChange={(value) => setActiveType(value as DatasetTypeFilter)}
          className='min-h-0 flex-1'
        >
          <TabsList className='shrink-0'>
            {datasetTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
            <DataTable<DatasetRecord>
              className='min-h-0 flex-1'
              columns={columns}
              request={{
                queryKey: (state: DataTableQueryState) => [
                  'project-datasets',
                  projectId,
                  activeType,
                  state,
                ],
                queryFn: (state) =>
                  listProjectDatasetsMock(projectId, state, activeType),
              }}
              urlState={{
                defaultPageSize: 10,
                globalFilterKey: 'keyword',
              }}
              toolbar={{
                searchPlaceholder: '按数据集名称搜索',
                columnLabels: {
                  name: '名称',
                  description: '描述',
                  type: '类型',
                  itemCount: '数据量',
                  runCount: '运行数',
                  createdAt: '创建时间',
                  updatedAt: '更新时间',
                },
              }}
              loadingText={
                <Loading
                  text='加载数据集中...'
                  className='min-h-24 border-0 bg-transparent'
                />
              }
              emptyText='当前项目下暂无匹配的数据集'
              minTableWidth={1080}
            />
          </section>
        </Tabs>
      </div>
      <DatasetFormDrawer
        open={formOpen}
        dataset={editingDataset}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmitDataset}
      />
      <ImportDialog
        open={Boolean(importDataset)}
        onOpenChange={(open) => {
          if (!open) setImportDataset(null)
        }}
        title='导入数据项'
        description={`导入到数据集：${importDataset?.name ?? ''}`}
        fileTypes={['text/csv', '.csv', 'application/jsonl', '.jsonl']}
        onImport={(file) => {
          if (!importDataset) return
          void importProjectDatasetItemsMock(projectId, importDataset.id, file).then(
            async (result) => {
              await invalidateDatasets()
              toast.success(`已导入 ${result.successCount} 条数据项`)
            }
          )
        }}
      />
    </Page>
  )
}

async function handleExportDataset(projectId: string, dataset: DatasetRecord) {
  const payload = await exportProjectDatasetMock(projectId, dataset.id)
  downloadJson(`dataset-${dataset.id}-${Date.now()}.json`, payload)
  toast.success(`已导出数据集：${dataset.name}`)
}

async function handleDeleteDataset(
  projectId: string,
  dataset: DatasetRecord,
  onDeleted: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '删除数据集',
    desc: `删除后将移除「${dataset.name}」及其 mock 数据项，确定继续吗？`,
    confirmText: '删除',
    destructive: true,
  })

  if (!confirmed) return

  await deleteProjectDatasetMock(projectId, dataset.id)
  await onDeleted()
  toast.success(`已删除数据集：${dataset.name}`)
}
