import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import {
  buildInitialTraceAnnotationTaskProgress,
  createProjectAnnotationQueue,
  createTraceAnnotationTask,
  type TraceAnnotationTaskProgress,
} from '@/modules/app-evaluation/api/annotation-api'
import type { AnnotationQueueFormInput } from '@/modules/app-evaluation/types'
import { Database, Download, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import {
  DataTableBulkActions,
  type DataTableSelectionState,
} from '@/components/common/data-table'
import {
  addProjectTracesToDatasetTarget,
  buildInitialTraceDatasetAddProgress,
  type TraceDatasetAddProgress,
  type TraceDatasetTargetInput,
} from '../api/trace-dataset-api'
import type { TraceListResponse, TraceLogRow } from '../types'
import { buildTraceListQuery } from '../views/trace-logs-query'
import { TraceAnnotationDialog } from './trace-annotation-dialog'
import {
  TraceDatasetDialog,
  type TraceDatasetSubmitValues,
} from './trace-dataset-dialog'

const TRACE_SELECT_ALL_PAGE_SIZE = 200

type TraceLogBulkActionsProps = {
  table: Table<TraceLogRow>
  selection?: DataTableSelectionState<TraceLogRow>
  projectId: string
}

export function TraceLogBulkActions({
  table,
  selection,
  projectId,
}: TraceLogBulkActionsProps) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditTrace = can('project:trace:edit')
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)
  const [datasetImportProgress, setDatasetImportProgress] =
    useState<TraceDatasetAddProgress | null>(null)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const [annotationTaskProgress, setAnnotationTaskProgress] =
    useState<TraceAnnotationTaskProgress | null>(null)
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedTraces = selectedRows.map((row) => row.original)
  const shouldUseAllMatchingRows = Boolean(
    selection?.isAllMatchingRowsSelected
  )
  const selectedCount = shouldUseAllMatchingRows
    ? (selection?.totalRowCount ?? selectedRows.length)
    : (selection?.selectedRowCount ?? selectedRows.length)
  const projectName = selectedTraces[0]?.projectName || projectId
  const isCrossPageSelection = shouldUseAllMatchingRows

  const fetchAllMatchingTraces = async () => {
    if (!selection || !shouldUseAllMatchingRows) {
      return selectedTraces
    }

    const pageCount = Math.ceil(
      selection.totalRowCount / TRACE_SELECT_ALL_PAGE_SIZE
    )
    const traces: TraceLogRow[] = []

    for (let page = 1; page <= pageCount; page += 1) {
      const response = await $api.listProjectTraces<TraceListResponse>({
        path: { projectId },
        query: buildTraceListQuery(
          {
            ...selection.queryState,
            page,
            pageSize: TRACE_SELECT_ALL_PAGE_SIZE,
          },
          projectId
        ),
      })
      traces.push(...response.datas)
    }

    return traces.slice(0, selection.totalRowCount)
  }

  const resolveSelectedTraces = async () => fetchAllMatchingTraces()

  const resolveSelectedTraceIds = async () => {
    const traces = await resolveSelectedTraces()
    return traces.map((trace) => trace.traceId)
  }

  const clearBulkSelection = () => {
    if (selection) {
      selection.clearSelection()
      return
    }

    table.resetRowSelection()
  }
  const handleDatasetDialogOpenChange = (open: boolean) => {
    if (!open) {
      setDatasetImportProgress(null)
    }
    setDatasetDialogOpen(open)
  }
  const handleAnnotationDialogOpenChange = (open: boolean) => {
    if (!open) {
      setAnnotationTaskProgress(null)
    }
    setAnnotationDialogOpen(open)
  }

  const handleExport = async () => {
    const traces = await resolveSelectedTraces()
    const blob = new Blob([JSON.stringify(traces, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `traces-${projectId}-${Date.now()}-${traces.length}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`已导出 ${traces.length} 条 Trace`)
  }

  const handleCreateAnnotationTask = async (queueId: string) => {
    try {
      setAnnotationTaskProgress(null)
      if (selectedCount >= 1000) {
        setAnnotationTaskProgress(
          buildInitialTraceAnnotationTaskProgress(selectedCount)
        )
      }
      const traceIds = await resolveSelectedTraceIds()
      const result = await createTraceAnnotationTask(
        $api,
        projectId,
        traceIds,
        {
          queueId,
          onProgress: setAnnotationTaskProgress,
        }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      })
      toast.success(
        `已加入人工标注队列：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
      )
      clearBulkSelection()
      setAnnotationTaskProgress(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '创建人工标注任务失败'
      )
    }
  }

  const handleCreateAnnotationQueueAndTask = async (
    input: AnnotationQueueFormInput
  ) => {
    try {
      setAnnotationTaskProgress(null)
      if (selectedCount >= 1000) {
        setAnnotationTaskProgress(
          buildInitialTraceAnnotationTaskProgress(selectedCount)
        )
      }
      const queue = await createProjectAnnotationQueue($api, projectId, input)
      const traceIds = await resolveSelectedTraceIds()
      const result = await createTraceAnnotationTask(
        $api,
        projectId,
        traceIds,
        {
          queueId: queue.id,
          onProgress: setAnnotationTaskProgress,
        }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      })
      toast.success(
        `已创建人工标注任务：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
      )
      clearBulkSelection()
      setAnnotationTaskProgress(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '创建人工标注任务失败'
      )
      throw error
    }
  }

  const handleAddToDataset = async (values: TraceDatasetSubmitValues) => {
    try {
      setDatasetImportProgress(null)
      if (selectedCount >= 1000) {
        setDatasetImportProgress(
          buildInitialTraceDatasetAddProgress(selectedCount)
        )
      }
      const traceIds = await resolveSelectedTraceIds()
      const input: TraceDatasetTargetInput =
        values.mode === 'existing'
          ? {
              mode: 'existing',
              datasetId: values.datasetId,
              traceIds,
            }
          : {
              mode: 'create',
              name: values.name,
              description: values.description,
              datasetType: values.datasetType,
              traceIds,
            }
      const result = await addProjectTracesToDatasetTarget(
        $api,
        projectId,
        input,
        {
          onProgress: setDatasetImportProgress,
        }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-datasets', projectId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['project-datasets'],
      })
      const successMessage =
        values.mode === 'create'
          ? `已创建评测集并加入 ${result.successCount} 条 Trace`
          : `已加入 ${result.successCount} 条 Trace`
      toast.success(
        result.failureCount
          ? `${successMessage}，失败 ${result.failureCount} 条`
          : successMessage
      )
      clearBulkSelection()
      setDatasetImportProgress(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入数据集失败')
      throw error
    }
  }

  return (
    <>
      <DataTableBulkActions
        table={table}
        selection={selection}
        entityName='Trace'
      >
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => {
            void handleExport()
          }}
        >
          <Download data-icon='inline-start' />
          导出 JSON
        </Button>
        {canEditTrace ? (
          <>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => handleDatasetDialogOpenChange(true)}
            >
              <Database data-icon='inline-start' />
              加入数据集
            </Button>
            <Button
              type='button'
              size='sm'
              onClick={() => handleAnnotationDialogOpenChange(true)}
            >
              <Tags data-icon='inline-start' />
              人工标注
            </Button>
          </>
        ) : null}
      </DataTableBulkActions>
      <TraceDatasetDialog
        open={canEditTrace && datasetDialogOpen}
        projectId={projectId}
        projectName={projectName}
        traces={selectedTraces}
        selectedCount={selectedCount}
        isCrossPageSelection={isCrossPageSelection}
        importProgress={datasetImportProgress}
        onOpenChange={handleDatasetDialogOpenChange}
        onSubmit={handleAddToDataset}
      />
      <TraceAnnotationDialog
        open={canEditTrace && annotationDialogOpen}
        projectId={projectId}
        projectName={projectName}
        traces={selectedTraces}
        selectedCount={selectedCount}
        isCrossPageSelection={isCrossPageSelection}
        taskProgress={annotationTaskProgress}
        onOpenChange={handleAnnotationDialogOpenChange}
        onSubmitExisting={handleCreateAnnotationTask}
        onSubmitNew={handleCreateAnnotationQueueAndTask}
      />
    </>
  )
}
