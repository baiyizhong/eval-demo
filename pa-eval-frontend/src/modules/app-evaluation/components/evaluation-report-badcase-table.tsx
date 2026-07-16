import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, Table } from '@tanstack/react-table'
import {
  createProjectAnnotationQueue,
  createTraceAnnotationTask,
} from '@/modules/app-evaluation/api/annotation-api'
import {
  addProjectTracesToDatasetTarget,
  type TraceDatasetTargetInput,
} from '@/modules/app-observability/api/trace-dataset-api'
import { TraceAnnotationDialog } from '@/modules/app-observability/components/trace-annotation-dialog'
import {
  TraceDatasetDialog,
  type TraceDatasetSubmitValues,
} from '@/modules/app-observability/components/trace-dataset-dialog'
import { Database, Download, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { useSessionStore } from '@/stores/session.store'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DataTable,
  DataTableBulkActions,
  DataTableColumnHeader,
  type DataTableSelectionState,
} from '@/components/common/data-table'
import { HoverPreviewCell } from '@/components/common/hover-preview-cell'
import { Loading } from '@/components/common/loading'
import { listProjectEvaluationReportBadcases } from '../api/evaluation-report-api'
import type {
  AnnotationQueueFormInput,
  EvaluationReportBadcaseRecord,
} from '../types'

const columns: ColumnDef<EvaluationReportBadcaseRecord>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='全选 Badcase'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='选择 Badcase'
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  { accessorKey: 'traceId', header: 'Trace ID' },
  { accessorKey: 'observationId', header: 'Observation ID' },
  {
    accessorKey: 'scoreValue',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='score' />
    ),
  },
  {
    accessorKey: 'reason',
    header: 'reason',
    cell: ({ row }) => (
      <HoverPreviewCell
        label='reason'
        value={row.original.reason?.trim()}
        triggerClassName='max-w-[360px]'
      />
    ),
  },
  {
    accessorKey: 'scoreSummary',
    header: '评分摘要',
    cell: ({ row }) => {
      const summary = row.original.scoreSummary?.trim()

      return (
        <HoverPreviewCell
          label='评分摘要'
          value={summary || '{}'}
          detailValue={formatScoreSummary(summary || '{}')}
          triggerClassName='max-w-80 font-mono'
        />
      )
    },
  },
  { accessorKey: 'comment', header: '备注' },
  {
    accessorKey: 'flowbackStatus',
    header: '回流',
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.flowbackStatus === 'FLOWED_BACK'
            ? 'secondary'
            : 'outline'
        }
      >
        {row.original.flowbackStatus === 'FLOWED_BACK' ? '已回流' : '未回流'}
      </Badge>
    ),
  },
]

function formatScoreSummary(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

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
        toolbar={{ searchPlaceholder: '搜索 Trace / 备注' }}
        loadingText={
          <Loading
            text='加载 Badcase 中...'
            className='min-h-24 border-0 bg-transparent'
          />
        }
        emptyText='暂无 Badcase'
        minTableWidth={1100}
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
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
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
          ? `已创建数据集并加入 ${result.successCount} 条 Badcase`
          : `已加入 ${result.successCount} 条 Badcase`
      toast.success(
        result.failureCount
          ? `${successMessage}，失败 ${result.failureCount} 条`
          : successMessage
      )
      clearBulkSelection()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入数据集失败')
      throw error
    }
  }

  const handleSubmitExistingAnnotation = async (queueId: string) => {
    try {
      const traceIds = await resolveSelectedTraceIds()
      const result = await createTraceAnnotationTask(
        $api,
        projectId,
        traceIds,
        { queueId }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      })
      toast.success(
        `已加入人工标注队列：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
      )
      clearBulkSelection()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '加入人工标注队列失败'
      )
      throw error
    }
  }

  const handleSubmitNewAnnotation = async (input: AnnotationQueueFormInput) => {
    try {
      const queue = await createProjectAnnotationQueue($api, projectId, input)
      const traceIds = await resolveSelectedTraceIds()
      const result = await createTraceAnnotationTask(
        $api,
        projectId,
        traceIds,
        { queueId: queue.id }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      })
      toast.success(
        `已创建人工标注任务：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
      )
      clearBulkSelection()
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
        onOpenChange={setDatasetDialogOpen}
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
        onOpenChange={setAnnotationDialogOpen}
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
