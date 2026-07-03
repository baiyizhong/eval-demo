import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { Page } from '@/components/common/page'
import { Skeleton } from '@/components/ui/skeleton'
import { getTraceMetricsMock } from '../api/mock-trace-api'
import { ObservabilityPageNav } from '../components/observability-page-nav'
import { SlowTraceRanking } from '../components/slow-trace-ranking'
import { TraceDashboardCards } from '../components/trace-dashboard-cards'
import {
  TraceEnvironmentChart,
  TraceLatencyChart,
  TraceTrendChart,
} from '../components/trace-dashboard-charts'
import { TraceDashboardFilters } from '../components/trace-dashboard-filters'

export function TraceDashboard() {
  const navigate = useNavigate()
  const { projectId = 'project_customer_agent' } = useParams()
  const [timeRange, setTimeRange] = useState('24h')
  const [environment, setEnvironment] = useState('all')
  const metricsQuery = useQuery({
    queryKey: ['trace-metrics', projectId, timeRange, environment],
    queryFn: () => getTraceMetricsMock(projectId),
  })

  const openTrace = (traceId: string) => {
    navigate(
      `/projects/${projectId}/observability/traces/logs?traceId=${traceId}`
    )
  }

  return (
    <Page fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <ObservabilityPageNav />
        {metricsQuery.isLoading || !metricsQuery.data ? (
          <Skeleton className='h-[520px] rounded-lg' />
        ) : (
          <>
            <div className='flex flex-wrap items-center justify-end gap-3'>
              <TraceDashboardFilters
                timeRange={timeRange}
                environment={environment}
                onTimeRangeChange={setTimeRange}
                onEnvironmentChange={setEnvironment}
              />
            </div>
            <TraceDashboardCards summary={metricsQuery.data.summary} />
            <div className='grid gap-4 xl:grid-cols-[2fr_1fr]'>
              <TraceTrendChart data={metricsQuery.data.traceTrend} />
              <TraceEnvironmentChart
                data={metricsQuery.data.environmentDistribution}
              />
            </div>
            <div className='grid gap-4 xl:grid-cols-[2fr_1fr]'>
              <TraceLatencyChart data={metricsQuery.data.latencyTrend} />
              <SlowTraceRanking
                rows={metricsQuery.data.slowTraces}
                onOpenTrace={openTrace}
              />
            </div>
          </>
        )}
      </div>
    </Page>
  )
}
