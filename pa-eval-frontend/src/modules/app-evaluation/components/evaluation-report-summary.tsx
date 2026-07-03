import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { EvaluationReportDetailRecord } from '../types'

export function EvaluationReportSummary({
  report,
}: {
  report: EvaluationReportDetailRecord
}) {
  const metrics = [
    { label: '平均分', value: report.metrics.averageScore.toFixed(2) },
    { label: '通过率', value: `${Math.round(report.metrics.passRate * 100)}%` },
    { label: '失败率', value: `${Math.round(report.metrics.failureRate * 100)}%` },
    { label: 'Badcase率', value: `${Math.round(report.metrics.badcaseRate * 100)}%` },
  ]

  return (
    <section className='grid gap-4 lg:grid-cols-[1fr_2fr]'>
      <div className='grid gap-3 sm:grid-cols-2'>
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardTitle className='text-sm text-muted-foreground'>
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-2xl font-semibold'>
              {metric.value}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>报告摘要</CardTitle>
        </CardHeader>
        <CardContent className='text-sm'>{report.summary}</CardContent>
      </Card>
    </section>
  )
}
