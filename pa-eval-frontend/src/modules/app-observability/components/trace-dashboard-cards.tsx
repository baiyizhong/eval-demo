import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  Timer,
} from 'lucide-react'
import { ChartMetricCard } from '@/components/common/charts'
import { formatLatency, formatPercent } from '../lib/format'
import type { TraceMetricSummary } from '../types'

type TraceDashboardCardsProps = {
  summary: TraceMetricSummary
}

export function TraceDashboardCards({ summary }: TraceDashboardCardsProps) {
  return (
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-6'>
      <ChartMetricCard
        title='Trace 总量'
        value={summary.total.toLocaleString()}
        description={`较上一周期 ${formatPercent(summary.totalChangeRate)}`}
        icon={<Activity className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='成功量'
        value={summary.success.toLocaleString()}
        description='已完成且无错误'
        icon={<CheckCircle2 className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='失败量'
        value={summary.failed.toLocaleString()}
        description='点击图表可下钻日志'
        icon={<AlertTriangle className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='失败率'
        value={formatPercent(summary.failureRate)}
        description='失败 Trace 占比'
        icon={<Gauge className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='平均延迟'
        value={formatLatency(summary.averageLatency)}
        description='Trace 平均耗时'
        icon={<Clock3 className='text-muted-foreground h-4 w-4' />}
      />
      <ChartMetricCard
        title='P95 延迟'
        value={formatLatency(summary.p95Latency)}
        description='95 分位耗时'
        icon={<Timer className='text-muted-foreground h-4 w-4' />}
      />
    </div>
  )
}
