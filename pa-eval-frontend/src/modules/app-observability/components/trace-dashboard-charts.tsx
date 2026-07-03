import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatLatency } from '../lib/format'
import type {
  TraceEnvironmentPoint,
  TraceLatencyPoint,
  TraceTrendPoint,
} from '../types'

export function TraceTrendChart({ data }: { data: TraceTrendPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trace 趋势</CardTitle>
      </CardHeader>
      <CardContent className='h-72'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='time' />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type='monotone'
              dataKey='total'
              name='Trace 总量'
              stroke='var(--chart-1)'
            />
            <Line
              type='monotone'
              dataKey='failed'
              name='失败量'
              stroke='var(--destructive)'
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function TraceLatencyChart({ data }: { data: TraceLatencyPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>延迟趋势</CardTitle>
      </CardHeader>
      <CardContent className='h-72'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='time' />
            <YAxis tickFormatter={formatLatency} />
            <Tooltip formatter={(value) => formatLatency(Number(value))} />
            <Legend />
            <Line
              type='monotone'
              dataKey='averageLatency'
              name='平均延迟'
              stroke='var(--chart-2)'
            />
            <Line
              type='monotone'
              dataKey='p95Latency'
              name='P95 延迟'
              stroke='var(--chart-3)'
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function TraceEnvironmentChart({
  data,
}: {
  data: TraceEnvironmentPoint[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>环境分布</CardTitle>
      </CardHeader>
      <CardContent className='h-72'>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='environment' />
            <YAxis />
            <Tooltip />
            <Bar
              dataKey='count'
              name='Trace 数量'
              fill='var(--chart-4)'
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
