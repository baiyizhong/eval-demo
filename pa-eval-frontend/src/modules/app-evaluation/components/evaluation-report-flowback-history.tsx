import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from './format'
import type { EvaluationReportFlowbackRecord } from '../types'

export function EvaluationReportFlowbackHistory({
  records,
}: {
  records: EvaluationReportFlowbackRecord[]
}) {
  return (
    <section className='grid gap-3'>
      {records.length ? (
        records.map((record) => (
          <Card key={record.id}>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                {record.targetDatasetName}
                <Badge variant='secondary'>{record.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className='grid gap-2 text-sm md:grid-cols-4'>
              <span>类型：{record.flowbackType}</span>
              <span>请求：{record.requestedCount}</span>
              <span>成功：{record.successCount}</span>
              <span>{formatDateTime(record.createdAt)} · {record.createdBy}</span>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className='text-muted-foreground text-sm'>暂无回流历史</CardContent>
        </Card>
      )}
    </section>
  )
}
