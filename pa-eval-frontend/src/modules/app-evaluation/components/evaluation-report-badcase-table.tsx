import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import {
  buildInitialTraceAnnotationTaskProgress,
  createProjectAnnotationQueue,
  createTraceAnnotationTask,
  type TraceAnnotationTaskProgress,
} from '@/modules/app-evaluation/api/annotation-api'
import {
  addProjectTracesToDatasetTarget,
  buildInitialTraceDatasetAddProgress,
  type TraceDatasetAddProgress,
  type TraceDatasetTargetInput,
} from '@/modules/app-observability/api/trace-dataset-api'
import { TraceAnnotationDialog } from '@/modules/app-observability/components/trace-annotation-dialog'
import {
  TraceDatasetDialog,
  type TraceDatasetSubmitValues,
} from '@/modules/app-observability/components/trace-dataset-dialog'
import { TraceDetailDrawer } from '@/modules/app-observability/components/trace-detail-drawer'
import { createTraceLogColumns } from '@/modules/app-observability/components/trace-log-columns'
import { Database, Download, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { useSessionStore } from '@/stores/session.store'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import {
  DataTable,
  DataTableBulkActions,
  type DataTableSelectionState,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { listProjectEvaluationReportBadcases } from '../api/evaluation-report-api'
import type {
  AnnotationQueueFormInput,
  EvaluationReportBadcaseRecord,
} from '../types'

export function EvaluationReportBadcaseTable({
  projectId,
  reportId,
  reportTitle,
  canEdit,
}: {
  projectId: string
  reportId: string
  reportTitle?: string
  canEdit?: boolean
}) {
  const $api = useAPI()
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const openTrace = useCallback((traceId: string) => {
    setSelectedTraceId(traceId)
  }, [])
  const columns = useCallback(
    (rows: EvaluationReportBadcaseRecord[]) =>
      createTraceLogColumns({ onOpenTrace: openTrace, rows }),
    [openTrace]
  )

  return (
    <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-lg border p-4'>
      <DataTable<EvaluationReportBadcaseRecord>
        className='min-h-0 flex-1'
        columns={columns}
        bulkActions={(table, selection) => (
          <EvaluationReportBadcaseBulkActions
            table={table}
            selection={selection}
            projectId={projectId}
            reportId={reportId}
            reportTitle={reportTitle}
            canEdit={canEdit}
          />
        )}
        request={{
          queryKey: (state) => [
            'project-evaluation-report-badcases',
            $api,
            projectId,
            reportId,
            state,
          ],
          queryFn: (state) =>
            listProjectEvaluationReportBadcases(
              $api,
              projectId,
              reportId,
              state
            ),
        }}
        urlState={{
          defaultPageSize: 10,
          globalFilterKey: 'badcaseKeyword',
        }}
        toolbar={{
          searchPlaceholder: '搜索 traceId / score',
          columnLabels: {
            traceId: 'Trace ID',
            sessionId: 'Session ID',
            environment: '环境',
            status: '状态',
            input: 'Input',
            output: 'Output',
            metadata: 'Metadata',
            latency: '延迟',
            createdAt: '创建时间',
          },
        }}
        loadingText={
          <Loading
            text='加载 Badcase 中...'
            className='min-h-24 border-0 bg-transparent'
          />
        }
        emptyText='暂无 Badcase'
        minTableWidth={1880}
      />
      <TraceDetailDrawer
        projectId={projectId}
        traceId={selectedTraceId}
        open={Boolean(selectedTraceId)}
        onOpenChange={(open) => {
          if (!open) setSelectedTraceId(null)
        }}
      />
    </section>
  )
}

const BADCASE_SELECT_ALL_PAGE_SIZE = 200

function EvaluationReportBadcaseBulkActions({
  table,
  selection,
  projectId,
  reportId,
  reportTitle,
  canEdit,
}: {
  table: Table<EvaluationReportBadcaseRecord>
  selection: DataTableSelectionState<EvaluationReportBadcaseRecord>
  projectId: string
  reportId: string
  reportTitle?: string
  canEdit?: boolean
}) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)
  const [datasetImportProgress, setDatasetImportProgress] =
    useState<TraceDatasetAddProgress | null>(null)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const [annotationTaskProgress, setAnnotationTaskProgress] =
    useState<TraceAnnotationTaskProgress | null>(null)
  const currentUserEmail = useSessionStore((state) => state.user?.email ?? '')
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedBadcases = selectedRows.map((row) => row.original)
  const shouldUseAllMatchingRows = selection.isAllMatchingRowsSelected
  const selectedCount = shouldUseAllMatchingRows
    ? selection.totalRowCount
    : selection.selectedRowCount
  const annotationDescription = buildBadcaseAnnotationDescription({
    reportName: reportTitle || reportId,
    selectedCount,
    creatorEmail: currentUserEmail,
  })

  const fetchAllMatchingBadcases = async () => {
    if (!shouldUseAllMatchingRows) {
      return selectedBadcases
    }

    const pageCount = Math.ceil(
      selection.totalRowCount / BADCASE_SELECT_ALL_PAGE_SIZE
    )
    const badcases: EvaluationReportBadcaseRecord[] = []

    for (let page = 1; page <= pageCount; page += 1) {
      const response = await listProjectEvaluationReportBadcases(
        $api,
        projectId,
        reportId,
        {
          ...selection.queryState,
          page,
          pageSize: BADCASE_SELECT_ALL_PAGE_SIZE,
        }
      )
      badcases.push(...response.datas)
    }

    return badcases.slice(0, selection.totalRowCount)
  }

  const clearBulkSelection = () => {
    selection.clearSelection()
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

  const resolveSelectedTraceIds = async () => {
    const badcases = await fetchAllMatchingBadcases()
    return Array.from(
      new Set(badcases.map((badcase) => badcase.traceId.trim()).filter(Boolean))
    )
  }

  const handleExport = async () => {
    const badcases = await fetchAllMatchingBadcases()
    const blob = new Blob([JSON.stringify(badcases, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `report-badcases-${reportId}-${Date.now()}-${badcases.length}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`已导出 ${badcases.length} 条 Badcase`)
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
          ? `已创建数据集并加入 ${result.successCount} 条 Badcase`
          : `已加入 ${result.successCount} 条 Badcase`
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

  const handleSubmitExistingAnnotation = async (queueId: string) => {
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
        { queueId, onProgress: setAnnotationTaskProgress }
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
        error instanceof Error ? error.message : '加入人工标注队列失败'
      )
      throw error
    }
  }

  const handleSubmitNewAnnotation = async (input: AnnotationQueueFormInput) => {
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
        { queueId: queue.id, onProgress: setAnnotationTaskProgress }
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

  return (
    <>
      <DataTableBulkActions
        table={table}
        selection={selection}
        entityName='Badcase'
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
        {canEdit ? (
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
        open={Boolean(canEdit && datasetDialogOpen)}
        projectId={projectId}
        projectName={reportTitle || reportId}
        traces={[]}
        selectedCount={selectedCount}
        isCrossPageSelection={shouldUseAllMatchingRows}
        importProgress={datasetImportProgress}
        onOpenChange={handleDatasetDialogOpenChange}
        onSubmit={handleAddToDataset}
      />
      <TraceAnnotationDialog
        open={Boolean(canEdit && annotationDialogOpen)}
        projectId={projectId}
        projectName={reportTitle || reportId}
        defaultDescription={annotationDescription}
        traces={[]}
        selectedCount={selectedCount}
        isCrossPageSelection={shouldUseAllMatchingRows}
        taskProgress={annotationTaskProgress}
        onOpenChange={handleAnnotationDialogOpenChange}
        onSubmitExisting={handleSubmitExistingAnnotation}
        onSubmitNew={handleSubmitNewAnnotation}
      />
    </>
  )
}

function buildBadcaseAnnotationDescription({
  reportName,
  selectedCount,
  creatorEmail,
}: {
  reportName: string
  selectedCount: number
  creatorEmail: string
}) {
  return [
    `数据来源：${reportName}-badcase`,
    `badcase数量：${selectedCount}条`,
    `创建人：${creatorEmail || '-'}`,
  ].join('\n')
}
