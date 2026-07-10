import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  DataTable,
  type DataTableQueryState,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import {
  createProjectDataset,
  deleteProjectDataset,
  listProjectDatasets,
  updateProjectDataset,
} from '../api/dataset-api'
import { createDatasetColumns } from '../components/dataset-columns'
import { DatasetFormDrawer } from '../components/dataset-form-drawer'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
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
  const $api = useAPI()
  const queryClient = useQueryClient()
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

  const invalidateDatasets = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['project-datasets', projectId],
      }),
    [projectId, queryClient]
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

  const columns = useMemo(
    () =>
      createDatasetColumns({
        projectId,
        readOnly: !canEditDatasets,
        onEdit: canEditDatasets ? setEditingDataset : undefined,
        onDelete: canEditDatasets ? setDeletingDataset : undefined,
      }),
    [canEditDatasets, projectId]
  )

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

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav
          buttonGroups={{
            buttons: [
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
              {
                id: 'refresh',
                label: '刷新',
                icon: RefreshCw,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => void handleRefresh(),
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
      </div>
    </Page>
  )
}
