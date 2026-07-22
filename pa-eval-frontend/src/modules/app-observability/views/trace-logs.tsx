import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listProjectScoreConfigs } from '@/modules/app-evaluation/api/annotation-api'
import { useParams, useSearchParams } from 'react-router'
import { useAPI } from '@/hooks/use-api'
import { DataTable } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { ObservabilityPageNav } from '../components/observability-page-nav'
import { TraceDetailDrawer } from '../components/trace-detail-drawer'
import { TraceLogBulkActions } from '../components/trace-log-bulk-actions'
import { createTraceLogColumns } from '../components/trace-log-columns'
import {
  buildTraceLogFilterGroups,
  traceLogToolbarFilters,
  traceLogUrlFilters,
} from '../components/trace-log-filters'
import {
  TraceOperationSuccessAlert,
  type TraceOperationSuccessNotice,
} from '../components/trace-operation-success-alert'
import { normalizeTraceTimeFilterValues } from '../trace-time-ranges'
import type { TraceListResponse, TraceLogRow } from '../types'
import { buildTraceListQuery } from './trace-logs-query'

export function TraceLogs() {
  const $api = useAPI()
  const { projectId = 'project_customer_agent' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(
    searchParams.get('traceId')
  )
  const [successNotice, setSuccessNotice] =
    useState<TraceOperationSuccessNotice | null>(null)

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

  const columns = useCallback(
    (rows: TraceLogRow[]) =>
      createTraceLogColumns({ onOpenTrace: openTrace, rows }),
    [openTrace]
  )
  const scoreConfigsQuery = useQuery({
    queryKey: ['project-score-configs', $api, projectId, 'trace-log-filters'],
    queryFn: () => listProjectScoreConfigs($api, projectId),
    staleTime: 5 * 60 * 1000,
  })
  const scoreConfigs = useMemo(
    () => scoreConfigsQuery.data ?? [],
    [scoreConfigsQuery.data]
  )
  const traceLogFilterGroups = useMemo(
    () => buildTraceLogFilterGroups(scoreConfigs),
    [scoreConfigs]
  )

  return (
    <Page fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <ObservabilityPageNav />
        {successNotice ? (
          <TraceOperationSuccessAlert
            notice={successNotice}
            onClose={() => setSuccessNotice(null)}
          />
        ) : null}
        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          <DataTable<TraceLogRow>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => ['trace-logs', $api, projectId, state],
              queryFn: (state) =>
                $api.listProjectTraces<TraceListResponse>({
                  path: { projectId },
                  query: buildTraceListQuery(state, projectId),
                }),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: traceLogUrlFilters,
              normalizeFilters: normalizeTraceTimeFilterValues,
            }}
            toolbar={{
              searchPlaceholder: '搜索 traceId / sessionId',
              filters: traceLogToolbarFilters,
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
              columnVisibility: {
                latency: false,
                status: false,
              },
            }}
            filterPanel={{
              title: '高级筛选',
              groups: traceLogFilterGroups,
              advanceFilterCollapsed: true,
              width: 320,
            }}
            bulkActions={(table, selection) => (
              <TraceLogBulkActions
                table={table}
                selection={selection}
                projectId={projectId}
                onOperationSuccess={setSuccessNotice}
              />
            )}
            loadingText={
              <Loading
                text='加载 Trace 日志中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前筛选条件下暂无 Trace 数据'
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
