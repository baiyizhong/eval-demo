import { useCallback, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Page } from '@/components/common/page'
import {
  DataTable,
  type DataTableQueryState,
} from '@/components/common/data-table'
import { listProjectTracesMock } from '../api/mock-trace-api'
import { ObservabilityPageNav } from '../components/observability-page-nav'
import { TraceDetailDrawer } from '../components/trace-detail-drawer'
import { TraceLogBulkActions } from '../components/trace-log-bulk-actions'
import { createTraceLogColumns } from '../components/trace-log-columns'
import {
  traceLogFilterGroups,
  traceLogToolbarFilters,
  traceLogUrlFilters,
} from '../components/trace-log-filters'
import type { TraceListQuery, TraceLogRow } from '../types'

function buildTraceListQuery(
  state: DataTableQueryState,
  projectId: string
): TraceListQuery {
  return {
    projectId,
    page: state.page,
    pageSize: state.pageSize,
    keyword: state.keyword,
    createdAtRange: state.filters.createdAtRange as string[] | undefined,
    environments: state.filters.environment as string[] | undefined,
    statuses: state.filters.status as string[] | undefined,
    tags: state.filters.tags as string[] | undefined,
    latencyMin: String(state.filters.latencyMin ?? ''),
    latencyMax: String(state.filters.latencyMax ?? ''),
    sessionId: String(state.filters.sessionId ?? ''),
    userId: String(state.filters.userId ?? ''),
    businessId: String(state.filters.businessId ?? ''),
    metadataKey: String(state.filters.metadataKey ?? ''),
    metadataValue: String(state.filters.metadataValue ?? ''),
  }
}

export function TraceLogs() {
  const { projectId = 'project_customer_agent' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(
    searchParams.get('traceId')
  )

  const closeTrace = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('traceId')
    setSearchParams(next, { replace: true })
    setSelectedTraceId(null)
  }, [searchParams, setSearchParams])

  const openTrace = useCallback(
    (traceId: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('traceId', traceId)
      setSearchParams(next, { replace: true })
      setSelectedTraceId(traceId)
    },
    [searchParams, setSearchParams]
  )

  const columns = useMemo(
    () => createTraceLogColumns({ onOpenTrace: openTrace }),
    [openTrace]
  )

  return (
    <Page fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <ObservabilityPageNav />
        <section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable<TraceLogRow>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => ['trace-logs', projectId, state],
              queryFn: (state) =>
                listProjectTracesMock(buildTraceListQuery(state, projectId)),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: traceLogUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '搜索 traceId / sessionId',
              filters: traceLogToolbarFilters,
              columnLabels: {
                traceId: 'Trace ID',
                sessionId: 'Session ID',
                environment: '环境',
                status: '状态',
                latency: '延迟',
                createdAt: '创建时间',
              },
            }}
            filterPanel={{
              title: '高级筛选',
              groups: traceLogFilterGroups,
              advanceFilterCollapsed: true,
              width: 320,
            }}
            bulkActions={(table) => (
              <TraceLogBulkActions table={table} projectId={projectId} />
            )}
            emptyText='当前筛选条件下暂无 Trace 数据'
            minTableWidth={980}
          />
          <TraceDetailDrawer
            projectId={projectId}
            traceId={selectedTraceId}
            open={Boolean(selectedTraceId)}
            onOpenChange={(open) => {
              if (!open) closeTrace()
            }}
          />
        </section>
      </div>
    </Page>
  )
}
