import type { Table } from '@tanstack/react-table'
import { Download, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DataTableBulkActions } from '@/components/common/data-table'
import {
  createAnnotationTaskMock,
  exportProjectTracesMock,
} from '../api/mock-trace-api'
import type { TraceLogRow } from '../types'

type TraceLogBulkActionsProps = {
  table: Table<TraceLogRow>
  projectId: string
}

export function TraceLogBulkActions({
  table,
  projectId,
}: TraceLogBulkActionsProps) {
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const traceIds = selectedRows.map((row) => row.original.traceId)

  const handleExport = async () => {
    const traces = await exportProjectTracesMock(projectId, traceIds)
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

  const handleCreateAnnotationTask = async () => {
    const result = await createAnnotationTaskMock(traceIds)
    toast.success(`已创建人工标注入口，包含 ${result.traceCount} 条 Trace`)
    table.resetRowSelection()
  }

  return (
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
        onClick={() => {
          void handleCreateAnnotationTask()
        }}
      >
        <Tags data-icon='inline-start' />
        人工标注
      </Button>
    </DataTableBulkActions>
  )
}
