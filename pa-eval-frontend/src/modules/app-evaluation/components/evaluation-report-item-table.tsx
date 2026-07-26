import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, Table } from '@tanstack/react-table'
import {
  buildInitialTraceAnnotationTaskProgress,
  createProjectAnnotationQueue,
  createTraceAnnotationTask,
  type TraceAnnotationTaskProgress,
} from '@/modules/app-evaluation/api/annotation-api'
import { TraceAnnotationDialog } from '@/modules/app-observability/components/trace-annotation-dialog'
import {
  TraceDatasetDialog,
  type TraceDatasetSubmitValues,
} from '@/modules/app-observability/components/trace-dataset-dialog'
import {
  formatTraceScoreValue,
  getTraceScoreColumnNames,
} from '@/modules/app-observability/components/trace-log-columns'
import { formatDateTime } from '@/modules/app-observability/lib/format'
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
  type DataTableSelectionState,
} from '@/components/common/data-table'
import { HoverPreviewCell } from '@/components/common/hover-preview-cell'
import { Loading } from '@/components/common/loading'
import {
  createProjectEvaluationReportFlowback,
  listProjectEvaluationReportItems,
} from '../api/evaluation-report-api'
import type {
  AnnotationQueueFormInput,
  EvaluationReportItemRecord,
} from '../types'

function createColumns(
  rows: EvaluationReportItemRecord[]
): ColumnDef<EvaluationReportItemRecord>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='全选评测数据'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='选择评测数据'
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: 'traceId', header: 'Trace ID' },
    ...createReportScoreColumns(rows),
    {
      accessorKey: 'reason',
      header: '评分原因',
      cell: ({ row }) => {
        const reason = row.original.reason?.trim()

        return (
          <HoverPreviewCell
            label='评分原因'
            value={reason || '-'}
            detailValue={reason || '-'}
            triggerClassName='max-w-80'
          />
        )
      },
      meta: {
        className: 'min-w-[220px] max-w-[320px]',
      },
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
    {
      accessorKey: 'rawResult',
      header: '运行日志',
      cell: ({ row }) => {
        const log = formatOpenJudgeLog(row.original)

        return (
          <HoverPreviewCell
            label='运行日志'
            value={formatLogPreview(log)}
            detailValue={formatLogDetail(log)}
            triggerClassName='max-w-80 font-mono'
          />
        )
      },
      meta: {
        className: 'min-w-[240px] max-w-[360px]',
      },
    },
    {
      accessorKey: 'resultType',
      header: '结果',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.resultType === 'badcase' ? 'destructive' : 'secondary'
          }
        >
          {row.original.resultType === 'badcase' ? 'Badcase' : '正常'}
        </Badge>
      ),
    },
    { accessorKey: 'executionStatus', header: '执行状态' },
    {
      accessorKey: 'datasetFlowbackStatus',
      header: '回流',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.datasetFlowbackStatus === 'FLOWED_BACK'
              ? 'secondary'
              : 'outline'
          }
        >
          {row.original.datasetFlowbackStatus === 'FLOWED_BACK'
            ? '已回流'
            : '未回流'}
        </Badge>
      ),
    },
  ]
}

function createReportScoreColumns(
  rows: EvaluationReportItemRecord[]
): ColumnDef<EvaluationReportItemRecord>[] {
  return getTraceScoreColumnNames(rows).flatMap((scoreName) => [
    {
      id: `score:${scoreName}`,
      accessorFn: (row) => formatTraceScoreValue(findScore(row, scoreName)),
      header: scoreName,
      cell: ({ getValue }) => (
        <span className='block max-w-[160px] truncate text-xs tabular-nums'>
          {String(getValue() || '-')}
        </span>
      ),
      meta: {
        label: scoreName,
        className: 'min-w-[140px]',
      },
    },
    {
      id: `score:${scoreName}:created_at`,
      accessorFn: (row) => {
        const score = findScore(row, scoreName)
        return score?.createdAt ? formatDateTime(score.createdAt) : '-'
      },
      header: 'created_at',
      cell: ({ getValue }) => (
        <span className='block min-w-[110px] text-xs tabular-nums'>
          {String(getValue() || '-')}
        </span>
      ),
      meta: {
        label: `${scoreName} created_at`,
        className: 'min-w-[120px]',
      },
    },
  ])
}

function findScore(row: EvaluationReportItemRecord, scoreName: string) {
  return row.scores?.find((score) => score.name === scoreName)
}

function formatScoreSummary(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function formatOpenJudgeLog(row: EvaluationReportItemRecord) {
  return row.rawResult || row.output || row.scores || row.extra || {}
}

function formatLogPreview(value: unknown) {
  if (value === undefined || value === null) {
    return '-'
  }
  if (typeof value === 'string') {
    return value.trim() || '-'
  }
  if (Array.isArray(value) && !value.length) {
    return '-'
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const provider = String(record.provider || '').trim()
    const runner = String(record.runner || '').trim()
    const grader = String(record.grader || '').trim()
    const model = record.model
    const modelName =
      model && typeof model === 'object'
        ? String((model as Record<string, unknown>).model || '').trim()
        : ''
    const label = [provider, runner, grader, modelName]
      .filter(Boolean)
      .join(' / ')
    if (label) {
      return label
    }
  }
  return formatLogDetail(value)
}

function formatLogDetail(value: unknown) {
  if (value === undefined || value === null) {
    return '-'
  }
  if (typeof value === 'string') {
    return value.trim() || '-'
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function EvaluationReportItemTable({
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
      <DataTable<EvaluationReportItemRecord>
        className='min-h-0 flex-1'
        columns={createColumns}
        bulkActions={(table, selection) => (
          <EvaluationReportItemBulkActions
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
            'project-evaluation-report-items',
            projectId,
            reportId,
            $api,
            state,
          ],
          queryFn: (state) =>
            listProjectEvaluationReportItems($api, projectId, reportId, state),
        }}
        urlState={{
          defaultPageSize: 10,
          globalFilterKey: 'itemKeyword',
        }}
        toolbar={{ searchPlaceholder: '搜索 Trace ID / 评分摘要 / 评分原因' }}
        loadingText={
          <Loading
            text='加载评测数据中...'
            className='min-h-24 border-0 bg-transparent'
          />
        }
        emptyText='暂无评测数据'
        minTableWidth={1100}
      />
    </section>
  )
}

const EVALUATION_ITEM_SELECT_ALL_PAGE_SIZE = 200

function EvaluationReportItemBulkActions({
  table,
  selection,
  projectId,
  reportId,
  reportTitle,
  canEdit,
}: {
  table: Table<EvaluationReportItemRecord>
  selection: DataTableSelectionState<EvaluationReportItemRecord>
  projectId: string
  reportId: string
  reportTitle?: string
  canEdit?: boolean
}) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const [annotationTaskProgress, setAnnotationTaskProgress] =
    useState<TraceAnnotationTaskProgress | null>(null)
  const currentUserEmail = useSessionStore((state) => state.user?.email ?? '')
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedItems = selectedRows.map((row) => row.original)
  const shouldUseAllMatchingRows = selection.isAllMatchingRowsSelected
  const selectedCount = shouldUseAllMatchingRows
    ? selection.totalRowCount
    : selection.selectedRowCount
  const annotationDescription = buildEvaluationItemAnnotationDescription({
    reportName: reportTitle || reportId,
    selectedCount,
    creatorEmail: currentUserEmail,
  })

  const fetchAllMatchingItems = async () => {
    if (!shouldUseAllMatchingRows) {
      return selectedItems
    }

    const pageCount = Math.ceil(
      selection.totalRowCount / EVALUATION_ITEM_SELECT_ALL_PAGE_SIZE
    )
    const items: EvaluationReportItemRecord[] = []

    for (let page = 1; page <= pageCount; page += 1) {
      const response = await listProjectEvaluationReportItems(
        $api,
        projectId,
        reportId,
        {
          ...selection.queryState,
          page,
          pageSize: EVALUATION_ITEM_SELECT_ALL_PAGE_SIZE,
        }
      )
      items.push(...response.datas)
    }

    return items.slice(0, selection.totalRowCount)
  }

  const clearBulkSelection = () => {
    selection.clearSelection()
  }
  const handleAnnotationDialogOpenChange = (open: boolean) => {
    if (!open) {
      setAnnotationTaskProgress(null)
    }
    setAnnotationDialogOpen(open)
  }

  const resolveSelectedItemIds = async () => {
    const items = await fetchAllMatchingItems()
    return items.map((item) => item.id)
  }

  const resolveSelectedTraceIds = async () => {
    const items = await fetchAllMatchingItems()
    return Array.from(
      new Set(
        items
          .map((item) => item.traceId?.trim())
          .filter((traceId): traceId is string => Boolean(traceId))
      )
    )
  }

  const handleExport = async () => {
    const items = await fetchAllMatchingItems()
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `report-items-${reportId}-${Date.now()}-${items.length}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`已导出 ${items.length} 条评测数据`)
  }

  const handleAddToDataset = async (values: TraceDatasetSubmitValues) => {
    try {
      const selectedItemIds = await resolveSelectedItemIds()
      const result = await createProjectEvaluationReportFlowback(
        $api,
        projectId,
        reportId,
        {
          flowbackType: 'EVALUATION_DATA',
          range: 'SELECTED',
          selectedItemIds,
          targetDataset:
            values.mode === 'existing'
              ? { mode: 'EXISTING', datasetId: values.datasetId }
              : {
                  mode: 'CREATE',
                  name: values.name,
                  description: values.description,
                },
          dedupeStrategy: 'SKIP_DUPLICATE',
        }
      )
      await queryClient.invalidateQueries({
        queryKey: ['project-evaluation-report', projectId, reportId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['project-evaluation-report-flowbacks', projectId, reportId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['project-evaluation-report-items', projectId, reportId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['project-datasets', projectId],
      })
      await queryClient.invalidateQueries({ queryKey: ['project-datasets'] })
      toast.success(
        `已加入数据集：成功 ${result.successCount} 条，失败 ${result.failedCount} 条`
      )
      clearBulkSelection()
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
      if (!traceIds.length) {
        throw new Error('所选评测数据没有可用于标注的 Trace ID')
      }
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
      const traceIds = await resolveSelectedTraceIds()
      if (!traceIds.length) {
        throw new Error('所选评测数据没有可用于标注的 Trace ID')
      }
      const queue = await createProjectAnnotationQueue($api, projectId, input)
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
        entityName='评测数据'
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
        description={
          shouldUseAllMatchingRows
            ? `将符合当前筛选条件的 ${selectedCount} 条评测数据加入目标数据集。`
            : `将 ${selectedCount} 条评测数据加入目标数据集。`
        }
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
        taskProgress={annotationTaskProgress}
        onOpenChange={handleAnnotationDialogOpenChange}
        onSubmitExisting={handleSubmitExistingAnnotation}
        onSubmitNew={handleSubmitNewAnnotation}
      />
    </>
  )
}

function buildEvaluationItemAnnotationDescription({
  reportName,
  selectedCount,
  creatorEmail,
}: {
  reportName: string
  selectedCount: number
  creatorEmail: string
}) {
  return [
    `数据来源：${reportName}-评测数据`,
    `评测数据数量：${selectedCount}条`,
    `创建人：${creatorEmail || '-'}`,
  ].join('\n')
}
