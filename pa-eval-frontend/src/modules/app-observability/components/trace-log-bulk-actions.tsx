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
import type { TraceOperationSuccessNotice } from './trace-operation-success-alert'

const TRACE_SELECT_ALL_PAGE_SIZE = 200

type TraceLogBulkActionsProps = {
  table: Table<TraceLogRow>
  selection?: DataTableSelectionState<TraceLogRow>
  projectId: string
  onOperationSuccess: (notice: TraceOperationSuccessNotice) => void
}

export function TraceLogBulkActions({
  table,
  selection,
  projectId,
  onOperationSuccess,
}: TraceLogBulkActionsProps) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditTrace = can('project:trace:edit')
  const canViewDataset = can('project:dataset:view')
  const canViewAnnotation = can('project:annotation:view')
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)
  const [datasetImportProgress, setDatasetImportProgress] =
    useState<TraceDatasetAddProgress | null>(null)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const [annotationTaskProgress, setAnnotationTaskProgress] =
    useState<TraceAnnotationTaskProgress | null>(null)
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedTraces = selectedRows.map((row) => row.original)
  const shouldUseAllMatchingRows = Boolean(selection?.isAllMatchingRowsSelected)
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

  const buildBulkTraceSelection = () => {
    if (!selection || !shouldUseAllMatchingRows) {
      return selectedTraces.map((trace) => trace.traceId)
    }
    const query = buildTraceListQuery(
      {
        ...selection.queryState,
        page: 1,
        pageSize: 10,
      },
      projectId
    )
    const filters: Record<string, unknown> = { ...query }
    delete filters.projectId
    delete filters.page
    delete filters.pageSize
    delete filters.fields
    return {
      type: 'FILTER' as const,
      filters,
      excludedTraceIds: [],
      totalCount: selectedCount,
    }
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
      const traceSelection = buildBulkTraceSelection()
      const result = await createTraceAnnotationTask(
        $api,
        projectId,
        traceSelection,
        {
          queueId,
          onProgress: setAnnotationTaskProgress,
        }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      })
      const summary = `新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
      onOperationSuccess({
        title:
          result.createdCount === 0 && result.skippedCount > 0
            ? '人工标注任务处理完成'
            : '已成功加入人工标注任务',
        summary,
        linkLabel: '查看人工标注任务',
        to: canViewAnnotation
          ? `/projects/${encodeURIComponent(projectId)}/evaluation/annotation-queues/${encodeURIComponent(result.queueId)}`
          : undefined,
      })
      clearBulkSelection()
      setAnnotationTaskProgress(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '创建人工标注任务失败'
      )
      throw error
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
      const traceSelection = buildBulkTraceSelection()
      const result = await createTraceAnnotationTask(
        $api,
        projectId,
        traceSelection,
        {
          queueId: queue.id,
          onProgress: setAnnotationTaskProgress,
        }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      })
      const summary = `新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
      onOperationSuccess({
        title: '已成功创建人工标注任务',
        summary,
        linkLabel: '查看人工标注任务',
        to: canViewAnnotation
          ? `/projects/${encodeURIComponent(projectId)}/evaluation/annotation-queues/${encodeURIComponent(result.queueId)}`
          : undefined,
      })
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
      const traceSelection = buildBulkTraceSelection()
      const selectionInput = Array.isArray(traceSelection)
        ? { traceIds: traceSelection }
        : {
            selection: {
              type: traceSelection.type,
              filters: traceSelection.filters,
              excludedTraceIds: traceSelection.excludedTraceIds,
            },
            totalCount: traceSelection.totalCount,
          }
      const input: TraceDatasetTargetInput =
        values.mode === 'existing'
          ? {
              mode: 'existing',
              datasetId: values.datasetId,
              ...selectionInput,
            }
          : {
              mode: 'create',
              name: values.name,
              description: values.description,
              datasetType: values.datasetType,
              ...selectionInput,
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
      if (result.successCount === 0 && result.failureCount > 0) {
        throw new Error(`加入数据集失败：失败 ${result.failureCount} 条`)
      }
      onOperationSuccess({
        title:
          values.mode === 'create' ? '已成功创建数据集' : '已成功加入数据集',
        summary:
          `${values.mode === 'create' ? '已加入' : '成功加入'} ${result.successCount} 条 Trace` +
          (result.failureCount ? `，失败 ${result.failureCount} 条` : ''),
        linkLabel: '查看数据集',
        to: canViewDataset
          ? `/projects/${encodeURIComponent(projectId)}/evaluation/datasets/${encodeURIComponent(result.datasetId)}`
          : undefined,
      })
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
