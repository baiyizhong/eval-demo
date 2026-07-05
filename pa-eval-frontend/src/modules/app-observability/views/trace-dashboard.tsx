import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { useAPI } from '@/hooks/use-api'
import { ObservabilityPageNav } from '../components/observability-page-nav'
import { SlowTraceRanking } from '../components/slow-trace-ranking'
import { TraceDashboardCards } from '../components/trace-dashboard-cards'
import {
  TraceEnvironmentChart,
  TraceLatencyChart,
  TraceTrendChart,
} from '../components/trace-dashboard-charts'
import { TraceDashboardFilters } from '../components/trace-dashboard-filters'
import type { TraceMetrics } from '../types'

export function TraceDashboard() {
  const $api = useAPI()
  const navigate = useNavigate()
  const { projectId = 'project_customer_agent' } = useParams()
  const [timeRange, setTimeRange] = useState('24h')
  const [environment, setEnvironment] = useState('all')
  const metricsQuery = useQuery({
    queryKey: ['trace-metrics', $api, projectId, timeRange, environment],
    queryFn: () =>
      $api.getTraceMetrics<TraceMetrics>({
        path: { projectId },
        query: { timeRange, environment },
      }),
  })
  const metrics = metricsQuery.data

  const openTrace = (traceId: string) => {
    navigate(
      `/projects/${projectId}/observability/traces/logs?traceId=${traceId}`
    )
  }

  return (
    <Page fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <ObservabilityPageNav />
        {metricsQuery.isLoading ? (
          <Loading text='加载 Trace 指标中...' className='flex-1' />
        ) : null}
        {metrics ? (
          <>
            <div className='flex flex-wrap items-center justify-end gap-3'>
              <TraceDashboardFilters
                timeRange={timeRange}
                environment={environment}
                onTimeRangeChange={setTimeRange}
                onEnvironmentChange={setEnvironment}
              />
            </div>
            <TraceDashboardCards summary={metrics.summary} />
            <div className='grid gap-4 xl:grid-cols-[2fr_1fr]'>
              <TraceTrendChart data={metrics.traceTrend} />
              <TraceEnvironmentChart
                data={metrics.environmentDistribution}
              />
            </div>
            <div className='grid gap-4 xl:grid-cols-[2fr_1fr]'>
              <TraceLatencyChart data={metrics.latencyTrend} />
              <SlowTraceRanking
                rows={metrics.slowTraces}
                onOpenTrace={openTrace}
              />
            </div>
          </>
        ) : null}
      </div>
    </Page>
  )
}
