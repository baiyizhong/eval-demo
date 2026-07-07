import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import {
  createProjectAnnotationQueue,
  createTraceAnnotationTask,
} from '@/modules/app-evaluation/api/annotation-api'
import type { AnnotationQueueFormInput } from '@/modules/app-evaluation/types'
import { Database, Download, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { DataTableBulkActions } from '@/components/common/data-table'
import {
  addProjectTracesToDatasetTarget,
  type TraceDatasetTargetInput,
} from '../api/trace-dataset-api'
import type { TraceLogRow } from '../types'
import { TraceAnnotationDialog } from './trace-annotation-dialog'
import {
  TraceDatasetDialog,
  type TraceDatasetSubmitValues,
} from './trace-dataset-dialog'

type TraceLogBulkActionsProps = {
  table: Table<TraceLogRow>
  projectId: string
}

export function TraceLogBulkActions({
  table,
  projectId,
}: TraceLogBulkActionsProps) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedTraces = selectedRows.map((row) => row.original)
  const traceIds = selectedRows.map((row) => row.original.traceId)
  const projectName = selectedTraces[0]?.projectName || projectId

  const handleExport = async () => {
    const traces = selectedTraces
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
      const result = await createTraceAnnotationTask(
        $api,
        projectId,
        traceIds,
        {
          queueId,
        }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      })
      toast.success(
        `已加入人工标注队列：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
      )
      table.resetRowSelection()
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
      const queue = await createProjectAnnotationQueue($api, projectId, input)
      const result = await createTraceAnnotationTask(
        $api,
        projectId,
        traceIds,
        {
          queueId: queue.id,
        }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      })
      toast.success(
        `已创建人工标注任务：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
      )
      table.resetRowSelection()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '创建人工标注任务失败'
      )
      throw error
    }
  }

  const handleAddToDataset = async (values: TraceDatasetSubmitValues) => {
    try {
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
        input
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
      table.resetRowSelection()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入数据集失败')
      throw error
    }
  }

  return (
    <>
      <DataTableBulkActions table={table} entityName='Trace'>
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
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => setDatasetDialogOpen(true)}
        >
          <Database data-icon='inline-start' />
          加入数据集
        </Button>
        <Button
          type='button'
          size='sm'
          onClick={() => setAnnotationDialogOpen(true)}
        >
          <Tags data-icon='inline-start' />
          人工标注
        </Button>
      </DataTableBulkActions>
      <TraceDatasetDialog
        open={datasetDialogOpen}
        projectId={projectId}
        projectName={projectName}
        traces={selectedTraces}
        onOpenChange={setDatasetDialogOpen}
        onSubmit={handleAddToDataset}
      />
      <TraceAnnotationDialog
        open={annotationDialogOpen}
        projectId={projectId}
        projectName={projectName}
        traces={selectedTraces}
        onOpenChange={setAnnotationDialogOpen}
        onSubmitExisting={handleCreateAnnotationTask}
        onSubmitNew={handleCreateAnnotationQueueAndTask}
      />
    </>
  )
}
