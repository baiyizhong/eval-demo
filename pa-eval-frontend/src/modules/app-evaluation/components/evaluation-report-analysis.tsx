import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { EvaluationReportDetailRecord } from '../types'

export function EvaluationReportAnalysis({
  report,
}: {
  report: EvaluationReportDetailRecord
}) {
  const maxCount = Math.max(...report.distribution.map((item) => item.count), 1)

  return (
    <section className='grid gap-4 lg:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>分数分布</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {report.distribution.map((item) => (
            <div key={item.label} className='grid grid-cols-[72px_1fr_48px] items-center gap-3 text-sm'>
              <span>{item.label}</span>
              <div className='bg-muted h-2 rounded'>
                <div
                  className='bg-primary h-2 rounded'
                  style={{ width: `${Math.round((item.count / maxCount) * 100)}%` }}
                />
              </div>
              <span>{item.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>分组分析</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          {report.groupAnalysis.map((item) => (
            <div key={item.group} className='flex justify-between gap-4 text-sm'>
              <span>{item.group}</span>
              <span className='text-muted-foreground'>
                {item.sampleCount} 条 · {item.averageScore.toFixed(2)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <ListCard title='风险限制' items={report.risks} />
      <ListCard title='改进建议' items={report.recommendations} />
      <Card className='lg:col-span-2'>
        <CardHeader>
          <CardTitle>复现信息</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-2 text-sm md:grid-cols-2'>
          <span>Report ID：{report.reproduction.reportId}</span>
          <span>Source Task：{report.reproduction.sourceTaskId}</span>
          <span>Score Name：{report.reproduction.scoreName}</span>
          <span>{report.reproduction.generatedConfig}</span>
        </CardContent>
      </Card>
    </section>
  )
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className='flex flex-col gap-2 text-sm'>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
