import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileDown, Plus, RefreshCw } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useSessionStore } from '@/stores/session.store'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  DataTable,
  type DataTableQueryState,
} from '@/components/common/data-table'
import { ImportDialog } from '@/components/common/import-dialog'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import {
  createProjectDataset,
  createProjectDatasetExportJob,
  createProjectDatasetItem,
  deleteProjectDataset,
  downloadProjectDatasetExportJob,
  listProjectDatasets,
  pollDatasetExportJob,
  updateProjectDataset,
} from '../api/dataset-api'
import { createDatasetColumns } from '../components/dataset-columns'
import { DatasetFormDrawer } from '../components/dataset-form-drawer'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import {
  buildDatasetItemImportTemplateBlob,
  DATASET_ITEM_IMPORT_FILE_TYPES,
  formatDatasetItemImportResultMessage,
  getDatasetItemImportTemplateFileName,
  parseDatasetItemImportFile,
  type DatasetItemImportFailure,
} from '../lib/dataset-item-import'
import {
  datasetTypeLabels,
  type DatasetExportFormat,
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
  const $api = useAPI()
  const queryClient = useQueryClient()
  const orgs = useSessionStore((state) => state.orgs)
  const { can } = usePermission({ type: 'project', projectId })
  const canEditDatasets = can('project:dataset:edit')
  const [activeType, setActiveType] = useState<DatasetTypeFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingDataset, setEditingDataset] = useState<DatasetRecord | null>(
    null
  )
  const [deletingDataset, setDeletingDataset] = useState<DatasetRecord | null>(
    null
  )
  const [importingDataset, setImportingDataset] =
    useState<DatasetRecord | null>(null)
  const [importingDatasetId, setImportingDatasetId] = useState<string | null>(
    null
  )
  const [exportingDatasetId, setExportingDatasetId] = useState<string | null>(
    null
  )
  const projectName = useMemo(
    () =>
      orgs
        .flatMap((org) => org.projects)
        .find((project) => project.id === projectId)?.name ?? projectId,
    [orgs, projectId]
  )

  const invalidateDatasets = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['project-datasets'],
      }),
    [queryClient]
  )

  const invalidateDatasetDetail = useCallback(
    (datasetId: string) =>
      Promise.all([
        invalidateDatasets(),
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
      ]),
    [$api, invalidateDatasets, projectId, queryClient]
  )

  const createMutation = useMutation({
    mutationFn: (input: DatasetFormInput) =>
      createProjectDataset($api, projectId, input),
    onSuccess: async () => {
      await invalidateDatasets()
      toast.success('数据集已创建')
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({
      datasetId,
      input,
    }: {
      datasetId: string
      input: DatasetFormInput
    }) => updateProjectDataset($api, projectId, datasetId, input),
    onSuccess: async () => {
      await invalidateDatasets()
      toast.success('数据集已保存')
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (datasetId: string) =>
      deleteProjectDataset($api, projectId, datasetId),
    onSuccess: async () => {
      await invalidateDatasets()
      setDeletingDataset(null)
      toast.success('数据集已删除')
    },
  })

  const handleRefresh = async () => {
    await invalidateDatasets()
    toast.success('数据集已刷新')
  }

  const handleSubmitDataset = async (input: DatasetFormInput) => {
    if (!canEditDatasets) return

    if (editingDataset) {
      await updateMutation.mutateAsync({
        datasetId: editingDataset.id,
        input,
      })
      setEditingDataset(null)
      return
    }

    await createMutation.mutateAsync(input)
    setCreateOpen(false)
  }

  const handleDeleteDataset = async () => {
    if (!canEditDatasets) return
    if (!deletingDataset) return
    await deleteMutation.mutateAsync(deletingDataset.id)
  }

  const handleDownloadImportTemplate = useCallback(() => {
    downloadBlob(
      buildDatasetItemImportTemplateBlob(importingDataset),
      getDatasetItemImportTemplateFileName(importingDataset, projectName)
    )
  }, [importingDataset, projectName])

  const handleImportDatasetItems = useCallback(
    async (file: File) => {
      if (!canEditDatasets || !importingDataset || importingDatasetId) return

      setImportingDatasetId(importingDataset.id)
      try {
        const parsed = await parseDatasetItemImportFile(file)
        const failures: DatasetItemImportFailure[] = [...parsed.failures]

        if (parsed.items.length === 0) {
          toast.error(formatDatasetItemImportResultMessage(0, failures))
          return
        }

        let successCount = 0

        for (const [index, item] of parsed.items.entries()) {
          try {
            await createProjectDatasetItem(
              $api,
              projectId,
              importingDataset.id,
              item
            )
            successCount += 1
          } catch (error) {
            failures.push({
              row: parsed.itemRows[index] ?? index + 2,
              field: 'row',
              reason: error instanceof Error ? error.message : '数据项创建失败',
            })
          }
        }

        await invalidateDatasetDetail(importingDataset.id)

        const message = formatDatasetItemImportResultMessage(
          successCount,
          failures
        )

        if (failures.length > 0) {
          toast.error(message)
          return
        }

        toast.success(message)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '导入数据集失败')
      } finally {
        setImportingDatasetId(null)
      }
    },
    [
      $api,
      canEditDatasets,
      importingDataset,
      importingDatasetId,
      invalidateDatasetDetail,
      projectId,
    ]
  )

  const handleExportDataset = useCallback(
    async (dataset: DatasetRecord, format: DatasetExportFormat) => {
      if (exportingDatasetId) {
        return
      }

      setExportingDatasetId(dataset.id)
      try {
        const job = await createProjectDatasetExportJob(
          $api,
          projectId,
          dataset.id,
          format
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
          completedJob.fileName ||
            `dataset-${dataset.id}-${completedJob.id}.${format}`
        )
        toast.success('数据集导出完成')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '数据集导出失败')
      } finally {
        setExportingDatasetId(null)
      }
    },
    [$api, exportingDatasetId, projectId]
  )

  const columns = useMemo(
    () =>
      createDatasetColumns({
        projectId,
        readOnly: !canEditDatasets,
        onEdit: canEditDatasets ? setEditingDataset : undefined,
        onImport: canEditDatasets ? setImportingDataset : undefined,
        onExport: canEditDatasets
          ? (dataset, format) => {
              void handleExportDataset(dataset, format)
            }
          : undefined,
        onDelete: canEditDatasets ? setDeletingDataset : undefined,
        exportingDatasetId,
      }),
    [canEditDatasets, exportingDatasetId, handleExportDataset, projectId]
  )

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav
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
              ...(canEditDatasets
                ? [
                    {
                      id: 'create',
                      label: '新建数据集',
                      icon: Plus,
                      iconPosition: 'start' as const,
                      size: 'sm' as const,
                      onClick: () => setCreateOpen(true),
                    },
                  ]
                : []),
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
          <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
            <DataTable<DatasetRecord>
              className='min-h-0 flex-1'
              columns={columns}
              request={{
                queryKey: (state: DataTableQueryState) => [
                  'project-datasets',
                  $api,
                  projectId,
                  activeType,
                  state,
                ],
                queryFn: (state) =>
                  listProjectDatasets($api, projectId, state, activeType),
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
        <DatasetFormDrawer
          open={createOpen || Boolean(editingDataset)}
          dataset={editingDataset}
          onOpenChange={(open) => {
            if (!open) {
              setCreateOpen(false)
              setEditingDataset(null)
            }
          }}
          onSubmit={handleSubmitDataset}
        />
        <ConfirmDialog
          open={Boolean(deletingDataset)}
          onOpenChange={(open) => {
            if (!open) setDeletingDataset(null)
          }}
          title='删除数据集'
          desc={
            <>
              删除后将移除数据集
              {deletingDataset ? `「${deletingDataset.name}」` : ''}
              及其关联数据项，此操作不可撤销。
            </>
          }
          destructive
          confirmText='删除'
          isLoading={deleteMutation.isPending}
          handleConfirm={() => void handleDeleteDataset()}
        />
        <ImportDialog
          open={canEditDatasets && Boolean(importingDataset)}
          onOpenChange={(open) => {
            if (!open) {
              setImportingDataset(null)
            }
          }}
          title='导入数据集'
          description='请选择 Excel、CSV 或 TXT 文件，文件列需与数据项模型一致。'
          fileTypes={DATASET_ITEM_IMPORT_FILE_TYPES}
          helperContent={
            <div className='flex flex-col gap-2'>
              <div>
                模板字段与导出文件保持一致：id、status、input、expectedOutput、metadata、sourceTraceId、sourceObservationId、createdAt、updatedAt。导入时
                input、expectedOutput、metadata 请填写合法 JSON。
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='w-fit'
                onClick={handleDownloadImportTemplate}
              >
                <FileDown data-icon='inline-start' />
                下载模板
              </Button>
            </div>
          }
          onImport={(file) => {
            void handleImportDatasetItems(file)
          }}
        />
      </div>
    </Page>
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
