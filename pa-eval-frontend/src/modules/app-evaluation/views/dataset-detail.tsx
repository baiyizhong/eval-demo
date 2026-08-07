import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DatasetExperimentReports,
  ExperimentRunDrawer,
} from '@/modules/scene-experiments'
import {
  buildProjectDatasetsHref,
  buildProjectTraceLogsHref,
  getDatasetExperimentReportsQueryKey,
} from '@/modules/scene-experiments/lib/experiment-run'
import {
  Download,
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ButtonGroupsProps } from '@/components/common/button-groups'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
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
  checkProjectDatasetNameAvailability,
  createProjectDataset,
  createProjectDatasetExportJob,
  createProjectDatasetItem,
  deleteProjectDataset,
  deleteProjectDatasetItem,
  downloadProjectDatasetExportJob,
  getProjectDataset,
  getProjectDatasetItemStatusCounts,
  getProjectDatasetMetricSummary,
  listProjectDatasetDirectories,
  listProjectDatasetItems,
  listProjectDatasets,
  pollDatasetExportJob,
  updateProjectDataset,
  updateProjectDatasetItem,
} from '../api/dataset-api'
import { DatasetFormDrawer } from '../components/dataset-form-drawer'
import { DatasetItemBulkActions } from '../components/dataset-item-bulk-actions'
import { createDatasetItemColumns } from '../components/dataset-item-columns'
import {
  DatasetItemFormDrawer,
  type DatasetItemDrawerIntent,
} from '../components/dataset-item-form-drawer'
import { DatasetTagsBadges } from '../components/dataset-tags-badges'
import { DatasetTreePanel } from '../components/dataset-tree-panel'
import { downloadBlob, formatDateTime } from '../components/format'
import { getDatasetExportFileName } from '../lib/dataset-item-export'
import { getNextDatasetId } from '../lib/dataset-tree'
import type {
  DatasetExportFormat,
  DatasetFormInput,
  DatasetItemFormInput,
  DatasetItemRecord,
  DatasetRecord,
} from '../types'

const itemUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'status', type: 'array' },
]

export function ProjectDatasetDetail() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { projectId = 'project_customer_agent', datasetId = '' } = useParams()
  const routeDatasetId = datasetId
  const { can } = usePermission({ type: 'project', projectId })
  const canEditDataset = can('project:dataset:edit')
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    null
  )
  const [treeVisible, setTreeVisible] = useState(true)
  const [creatingDirectoryId, setCreatingDirectoryId] = useState<string | null>(
    null
  )
  const [createDatasetOpen, setCreateDatasetOpen] = useState(false)
  const [editingDataset, setEditingDataset] = useState<DatasetRecord | null>(
    null
  )
  const [deletingDataset, setDeletingDataset] = useState<DatasetRecord | null>(
    null
  )
  const [itemDrawerIntent, setItemDrawerIntent] =
    useState<DatasetItemDrawerIntent | null>(null)
  const [selectedItem, setSelectedItem] = useState<DatasetItemRecord | null>(
    null
  )
  const [isExportingSelection, setIsExportingSelection] = useState(false)
  const activeTab = searchParams.get('tab') === 'reports' ? 'reports' : 'items'
  const [experimentDrawerOpen, setExperimentDrawerOpen] = useState(false)
  const itemKeyword = searchParams.get('keyword') ?? ''
  const handleTabChange = useCallback(
    (value: string) => {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('tab', value)
      setSearchParams(nextParams)
    },
    [searchParams, setSearchParams]
  )

  const directoriesQuery = useQuery({
    queryKey: ['project-dataset-directories', $api, projectId],
    queryFn: () => listProjectDatasetDirectories($api, projectId),
  })
  const treeDatasetsQuery = useQuery({
    queryKey: ['project-datasets-tree', $api, projectId],
    queryFn: () =>
      listProjectDatasets(
        $api,
        projectId,
        { page: 1, pageSize: 500, keyword: '', filters: {}, sorting: [] },
        'all'
      ),
  })
  const treeDatasets = useMemo(
    () => treeDatasetsQuery.data?.datas ?? [],
    [treeDatasetsQuery.data]
  )
  const effectiveDatasetId = useMemo(
    () =>
      getNextDatasetId(
        directoriesQuery.data ?? [],
        treeDatasets,
        selectedDatasetId ?? routeDatasetId
      ) ?? '',
    [directoriesQuery.data, routeDatasetId, selectedDatasetId, treeDatasets]
  )

  useEffect(() => {
    if (!effectiveDatasetId || effectiveDatasetId === routeDatasetId) return

    navigate(
      `/projects/${projectId}/evaluation/datasets/${effectiveDatasetId}`,
      {
        replace: true,
      }
    )
  }, [effectiveDatasetId, navigate, projectId, routeDatasetId])

  const datasetQuery = useQuery({
    queryKey: ['project-dataset', $api, projectId, effectiveDatasetId],
    queryFn: () => getProjectDataset($api, projectId, effectiveDatasetId),
    enabled: Boolean(effectiveDatasetId),
  })
  const metricQuery = useQuery({
    queryKey: ['project-dataset-metrics', $api, projectId, effectiveDatasetId],
    queryFn: () =>
      getProjectDatasetMetricSummary($api, projectId, effectiveDatasetId),
    enabled: Boolean(effectiveDatasetId),
  })
  const statusCountsQuery = useQuery({
    queryKey: [
      'project-dataset-item-status-counts',
      $api,
      projectId,
      effectiveDatasetId,
      itemKeyword,
    ],
    queryFn: () =>
      getProjectDatasetItemStatusCounts($api, projectId, effectiveDatasetId, {
        keyword: itemKeyword,
      }),
    enabled: Boolean(effectiveDatasetId),
  })

  const invalidateDetail = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-dataset', $api, projectId, effectiveDatasetId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'project-dataset-metrics',
            $api,
            projectId,
            effectiveDatasetId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'project-dataset-items',
            $api,
            projectId,
            effectiveDatasetId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'project-dataset-item-status-counts',
            $api,
            projectId,
            effectiveDatasetId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-datasets', projectId],
        }),
      ]),
    [$api, effectiveDatasetId, projectId, queryClient]
  )

  const checkDatasetNameAvailability = useCallback(
    (name: string) =>
      checkProjectDatasetNameAvailability($api, projectId, name),
    [$api, projectId]
  )

  const saveDatasetMutation = useMutation({
    mutationFn: (input: DatasetFormInput) =>
      editingDataset
        ? updateProjectDataset($api, projectId, editingDataset.id, input)
        : createProjectDataset($api, projectId, {
            ...input,
            directoryId: creatingDirectoryId,
          }),
    onSuccess: async (dataset) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-datasets'] }),
        queryClient.invalidateQueries({ queryKey: ['project-datasets-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['project-dataset'] }),
      ])
      setEditingDataset(null)
      setCreatingDirectoryId(null)
      setCreateDatasetOpen(false)
      setSelectedDatasetId(dataset.id)
      navigate(`/projects/${projectId}/evaluation/datasets/${dataset.id}`)
      toast.success(editingDataset ? '数据集已保存' : '数据集已创建')
    },
  })

  const deleteDatasetMutation = useMutation({
    mutationFn: (dataset: DatasetRecord) =>
      deleteProjectDataset($api, projectId, dataset.id),
    onSuccess: async (_, deletedDataset) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-datasets'] }),
        queryClient.invalidateQueries({ queryKey: ['project-datasets-tree'] }),
      ])
      setDeletingDataset(null)
      const remaining = treeDatasets.filter(
        (dataset) => dataset.id !== deletedDataset.id
      )
      const nextDatasetId = getNextDatasetId(
        directoriesQuery.data ?? [],
        remaining,
        null
      )
      setSelectedDatasetId(nextDatasetId)
      if (nextDatasetId) {
        navigate(`/projects/${projectId}/evaluation/datasets/${nextDatasetId}`)
      }
      toast.success('数据集已删除')
    },
  })

  const saveItemMutation = useMutation({
    mutationFn: (input: DatasetItemFormInput) =>
      itemDrawerIntent === 'edit' && selectedItem
        ? updateProjectDatasetItem(
            $api,
            projectId,
            effectiveDatasetId,
            selectedItem.id,
            input
          )
        : createProjectDatasetItem($api, projectId, effectiveDatasetId, input),
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
      archiveProjectDatasetItem($api, projectId, effectiveDatasetId, item.id),
    onSuccess: async () => {
      await invalidateDetail()
      toast.success('数据项已归档')
    },
  })
  const archiveItem = archiveItemMutation.mutateAsync

  const deleteItemMutation = useMutation({
    mutationFn: (item: DatasetItemRecord) =>
      deleteProjectDatasetItem($api, projectId, effectiveDatasetId, item.id),
    onSuccess: async () => {
      await invalidateDetail()
      toast.success('数据项已删除')
    },
  })
  const deleteItem = deleteItemMutation.mutateAsync

  const handleCreateItem = useCallback(() => {
    if (!canEditDataset || !effectiveDatasetId) return
    setSelectedItem(null)
    setItemDrawerIntent('create')
  }, [canEditDataset, effectiveDatasetId])

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
        navigate(buildProjectTraceLogsHref(projectId, normalizedTraceId))
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
        DatasetItemRecord['status'][] | undefined
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
  const pageActionButtons = useMemo<NonNullable<ButtonGroupsProps['buttons']>>(
    () => [
      ...(canEditDataset
        ? [
            {
              id: 'run-scene-experiment',
              label: '运行试验',
              icon: FlaskConical,
              iconPosition: 'start' as const,
              variant: 'outline' as const,
              size: 'sm' as const,
              disabled: !dataset || !metrics,
              title:
                datasetQuery.isError || metricQuery.isError
                  ? '数据集信息加载失败，暂时无法发起试验'
                  : !dataset || !metrics
                    ? '数据集信息加载中'
                    : '使用当前数据集运行试验',
              onClick: () => setExperimentDrawerOpen(true),
            },
            {
              id: 'create-dataset-item',
              label: '新增数据项',
              icon: Plus,
              iconPosition: 'start' as const,
              size: 'sm' as const,
              onClick: handleCreateItem,
            },
            {
              id: 'export-dataset-xlsx',
              label: '导出数据集 Excel',
              icon: Download,
              iconPosition: 'start' as const,
              variant: 'outline' as const,
              size: 'sm' as const,
              disabled: isExportingSelection || !dataset,
              onClick: () => void handleExportDataset('xlsx'),
            },
            {
              id: 'export-dataset-csv',
              label: '导出数据集 CSV',
              icon: Download,
              iconPosition: 'start' as const,
              variant: 'outline' as const,
              size: 'sm' as const,
              disabled: isExportingSelection || !dataset,
              onClick: () => void handleExportDataset('csv'),
            },
            {
              id: 'export-dataset-txt',
              label: '导出数据集 TXT',
              icon: Download,
              iconPosition: 'start' as const,
              variant: 'outline' as const,
              size: 'sm' as const,
              disabled: isExportingSelection || !dataset,
              onClick: () => void handleExportDataset('txt'),
            },
          ]
        : []),
    ],
    [
      canEditDataset,
      dataset,
      datasetQuery.isError,
      handleCreateItem,
      handleExportDataset,
      isExportingSelection,
      metricQuery.isError,
      metrics,
    ]
  )

  return (
    <Page
      fixed
      fluid
      className='flex min-h-[calc(100svh-3.5rem)] flex-col gap-4'
    >
      <PageAction
        showBackButton
        onBack={() => navigate(buildProjectDatasetsHref(projectId))}
        buttonGroups={{
          buttons: pageActionButtons,
        }}
      >
        {dataset ? (
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <span className='truncate text-sm font-medium' title={dataset.name}>
              {dataset.name}
            </span>
            <DatasetTagsBadges dataset={dataset} maxVisible={2} />
          </div>
        ) : null}
      </PageAction>

      <div className='flex min-h-0 flex-1 gap-4'>
        {treeVisible ? (
          <aside className='bg-card text-card-foreground flex min-h-0 w-[280px] shrink-0 flex-col rounded-lg border p-3'>
            <DatasetTreePanel
              api={$api}
              projectId={projectId}
              selectedDatasetId={effectiveDatasetId || null}
              canEdit={canEditDataset}
              onSelectDataset={(nextDatasetId) => {
                setSelectedDatasetId(nextDatasetId)
                navigate(
                  `/projects/${projectId}/evaluation/datasets/${nextDatasetId}`
                )
              }}
              onCreateDataset={(directoryId) => {
                setCreatingDirectoryId(directoryId)
                setCreateDatasetOpen(true)
              }}
              onEditDataset={setEditingDataset}
              onDeleteDataset={setDeletingDataset}
            />
          </aside>
        ) : null}
        <div className='flex min-w-0 flex-1 flex-col gap-4'>
          {datasetQuery.isLoading || metricQuery.isLoading ? (
            <Loading text='加载数据集详情中...' className='flex-1' />
          ) : null}

          {dataset && metrics ? (
            <section className='bg-card text-card-foreground rounded-lg border p-4'>
              <div className='grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                <InfoItem label='名称' value={dataset.name} />
                <InfoItem label='描述' value={dataset.description || '-'} />
                <InfoItem
                  label='标签'
                  value={
                    <DatasetTagsBadges
                      dataset={dataset}
                      maxVisible={8}
                      tooltip
                    />
                  }
                />
                <InfoItem label='总数据量' value={String(metrics.total)} />
                <InfoItem label='运行数' value={String(dataset.runCount)} />
                <InfoItem label='有效数量' value={String(metrics.active)} />
                <InfoItem label='归档数量' value={String(metrics.archived)} />
                <InfoItem
                  label='最近更新时间'
                  value={formatDateTime(metrics.updatedAt)}
                />
              </div>
            </section>
          ) : null}

        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className='min-h-0 flex-1'
            >
              <div className='flex items-center gap-2 pb-2'>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-7 text-muted-foreground'
                  title={treeVisible ? '隐藏目录树' : '显示目录树'}
                  aria-label={treeVisible ? '隐藏目录树' : '显示目录树'}
                  aria-expanded={treeVisible}
                  onClick={() => setTreeVisible((visible) => !visible)}
                >
                  {treeVisible ? (
                    <PanelLeftClose className='size-5' />
                  ) : (
                    <PanelLeftOpen className='size-5' />
                  )}
                </Button>
                <TabsList className='shrink-0'>
                <TabsTrigger value='items'>数据项</TabsTrigger>
                <TabsTrigger value='reports'>试验报告</TabsTrigger>
              </TabsList>
              </div>
              <TabsContent value='items' className='flex min-h-0 flex-col'>
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
                              projectId={projectId}
                              dataset={dataset}
                              directories={directoriesQuery.data ?? []}
                              datasets={treeDatasets}
                              onExportAllMatching={(query) =>
                                handleExportAllMatching(dataset, query)
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
              </TabsContent>
              <TabsContent value='reports' className='flex min-h-0 flex-col'>
                <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
                  <DatasetExperimentReports
                    projectId={projectId}
                    datasetId={datasetId}
                  />
                </section>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </div>
      <DatasetFormDrawer
        open={createDatasetOpen || Boolean(editingDataset)}
        dataset={editingDataset}
        checkNameAvailability={checkDatasetNameAvailability}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingDirectoryId(null)
            setCreateDatasetOpen(false)
            setEditingDataset(null)
          }
        }}
        onSubmit={async (input) => {
          await saveDatasetMutation.mutateAsync(input)
        }}
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
        isLoading={deleteDatasetMutation.isPending}
        handleConfirm={() => {
          if (deletingDataset) {
            void deleteDatasetMutation.mutateAsync(deletingDataset)
          }
        }}
      />
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
      <ExperimentRunDrawer
        open={canEditDataset && experimentDrawerOpen}
        projectId={projectId}
        lockedDataset={
          dataset && metrics
            ? { dataset, activeItemCount: metrics.active }
            : undefined
        }
        onOpenChange={setExperimentDrawerOpen}
        onCreated={async () => {
          await queryClient.invalidateQueries({
            queryKey: getDatasetExperimentReportsQueryKey(
              $api,
              projectId,
              datasetId
            ),
          })
          handleTabChange('reports')
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
  const title =
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined
  const valueClassName = 'min-w-0 truncate font-medium'

  return (
    <div
      className={
        wide
          ? 'flex min-w-0 items-center gap-2 sm:col-span-2 lg:col-span-2 xl:col-span-2'
          : 'flex items-center gap-2'
      }
    >
      <span className='text-muted-foreground shrink-0'>{label}</span>
      {title ? (
        <span className={valueClassName} title={title}>
          {value}
        </span>
      ) : (
        <div className={valueClassName}>{value}</div>
      )}
    </div>
  )
}
