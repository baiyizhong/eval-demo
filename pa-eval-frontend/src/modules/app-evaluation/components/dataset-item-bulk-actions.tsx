import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import { Copy, Download, MoveRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import {
  DataTableBulkActions,
  type DataTableQueryState,
  type DataTableSelectionState,
} from '@/components/common/data-table'
import { createProjectDatasetItemOperation } from '../api/dataset-api'
import {
  buildDatasetItemExportWorkbookBlob,
  getDatasetExportFileName,
} from '../lib/dataset-item-export'
import type {
  DatasetDirectoryRecord,
  DatasetItemOperationInput,
  DatasetItemOperationType,
  DatasetItemRecord,
  DatasetItemStatus,
  DatasetRecord,
} from '../types'
import { DatasetTargetDialog } from './dataset-target-dialog'
import { downloadBlob } from './format'

type DatasetItemBulkActionsProps = {
  table: Table<DatasetItemRecord>
  selection: DataTableSelectionState<DatasetItemRecord>
  projectId: string
  dataset: DatasetRecord
  directories: DatasetDirectoryRecord[]
  datasets: DatasetRecord[]
  onExportAllMatching: (query: DataTableQueryState) => Promise<void>
}

export function DatasetItemBulkActions({
  table,
  selection,
  projectId,
  dataset,
  directories,
  datasets,
  onExportAllMatching,
}: DatasetItemBulkActionsProps) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [isExporting, setIsExporting] = useState(false)
  const [targetDialogMode, setTargetDialogMode] = useState<Extract<
    DatasetItemOperationType,
    'copy' | 'move'
  > | null>(null)
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedItems = selectedRows.map((row) => row.original)
  const selectedCount = selection.selectedRowCount
  const operationMutation = useMutation({
    mutationFn: (input: DatasetItemOperationInput) =>
      createProjectDatasetItemOperation($api, projectId, dataset.id, input),
    onSuccess: async (result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-dataset-items', $api, projectId, dataset.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-dataset-metrics', $api, projectId, dataset.id],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'project-dataset-item-status-counts',
            $api,
            projectId,
            dataset.id,
          ],
        }),
        input.targetDatasetId
          ? queryClient.invalidateQueries({
              queryKey: [
                'project-dataset-items',
                $api,
                projectId,
                input.targetDatasetId,
              ],
            })
          : Promise.resolve(),
        input.targetDatasetId
          ? queryClient.invalidateQueries({
              queryKey: [
                'project-dataset-metrics',
                $api,
                projectId,
                input.targetDatasetId,
              ],
            })
          : Promise.resolve(),
        queryClient.invalidateQueries({ queryKey: ['project-datasets'] }),
        queryClient.invalidateQueries({ queryKey: ['project-datasets-tree'] }),
      ])
      selection.clearSelection()
      setTargetDialogMode(null)
      toast.success(
        getOperationSuccessMessage(input.type, result.affectedCount)
      )
    },
    onError: (error, input) => {
      toast.error(
        error instanceof Error
          ? error.message
          : getOperationFailureMessage(input.type)
      )
    },
  })

  const buildOperationSelection =
    (): DatasetItemOperationInput['selection'] => {
      if (selection.isAllMatchingRowsSelected) {
        const statuses = selection.queryState.filters.status as
          DatasetItemStatus[] | undefined
        const keyword = selection.queryState.keyword.trim()

        return {
          scope: 'filtered',
          ...(keyword ? { keyword } : {}),
          ...(statuses?.length ? { status: statuses } : {}),
        }
      }

      return {
        scope: 'selected',
        itemIds: selectedItems.map((item) => item.id),
      }
    }

  const handleDelete = async () => {
    if (operationMutation.isPending) return

    if (
      await confirm({
        title: '删除数据项',
        desc: `确定删除已选择的 ${selectedCount} 条数据项吗？此操作不可撤销。`,
        confirmText: '删除',
        destructive: true,
      })
    ) {
      await operationMutation.mutateAsync({
        type: 'delete',
        selection: buildOperationSelection(),
      })
    }
  }

  const handleTransfer = async (
    type: Extract<DatasetItemOperationType, 'copy' | 'move'>,
    targetDatasetId: string
  ) => {
    if (operationMutation.isPending) return

    await operationMutation.mutateAsync({
      type,
      targetDatasetId,
      selection: buildOperationSelection(),
    })
  }

  const handlePartialExport = async () => {
    if (isExporting) return

    setIsExporting(true)
    try {
      if (selection.isAllMatchingRowsSelected) {
        await onExportAllMatching(selection.queryState)
        selection.clearSelection()
        return
      }

      const blob = await buildDatasetItemExportWorkbookBlob(selectedItems)
      downloadBlob(blob, getDatasetExportFileName(dataset, 'xlsx'))
      toast.success(`已导出 ${selectedItems.length} 条数据项`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '数据集导出失败')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DataTableBulkActions
      table={table}
      entityName='数据项'
      selection={selection}
    >
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={isExporting}
        onClick={() => {
          void handlePartialExport()
        }}
      >
        <Download data-icon='inline-start' />
        {isExporting ? '正在导出...' : '导出'}
      </Button>
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={operationMutation.isPending}
        onClick={() => setTargetDialogMode('copy')}
      >
        <Copy data-icon='inline-start' />
        复制
      </Button>
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={operationMutation.isPending}
        onClick={() => setTargetDialogMode('move')}
      >
        <MoveRight data-icon='inline-start' />
        移动
      </Button>
      <Button
        type='button'
        size='sm'
        variant='destructive'
        disabled={operationMutation.isPending}
        onClick={() => {
          void handleDelete()
        }}
      >
        <Trash2 data-icon='inline-start' />
        删除
      </Button>
      <DatasetTargetDialog
        open={Boolean(targetDialogMode)}
        mode={targetDialogMode ?? 'copy'}
        selectedCount={selectedCount}
        currentDatasetId={dataset.id}
        directories={directories}
        datasets={datasets}
        isSubmitting={operationMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setTargetDialogMode(null)
        }}
        onSubmit={(targetDatasetId) =>
          targetDialogMode
            ? handleTransfer(targetDialogMode, targetDatasetId)
            : undefined
        }
      />
    </DataTableBulkActions>
  )
}

function getOperationSuccessMessage(
  type: DatasetItemOperationType,
  affectedCount: number
) {
  if (type === 'delete') return `已删除 ${affectedCount} 条数据项`
  if (type === 'move') return `已移动 ${affectedCount} 条数据项`
  return `已复制 ${affectedCount} 条数据项`
}

function getOperationFailureMessage(type: DatasetItemOperationType) {
  if (type === 'delete') return '批量删除数据项失败'
  if (type === 'move') return '批量移动数据项失败'
  return '批量复制数据项失败'
}
