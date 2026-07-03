import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime } from './format'
import { AutoEvaluationStatusBadge } from './auto-evaluation-status-badge'
import type { AutoEvaluationRunRecord } from '../types'

export function AutoEvaluationRunRecords({
  runs,
}: {
  runs: AutoEvaluationRunRecord[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>运行记录</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>状态</TableHead>
                <TableHead>样本数</TableHead>
                <TableHead>完成</TableHead>
                <TableHead>失败</TableHead>
                <TableHead>Badcase</TableHead>
                <TableHead>开始时间</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead>错误</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <AutoEvaluationStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>{run.sampleCount}</TableCell>
                  <TableCell>{run.completedCount}</TableCell>
                  <TableCell>{run.failedCount}</TableCell>
                  <TableCell>{run.badcaseCount}</TableCell>
                  <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                  <TableCell>{run.durationText}</TableCell>
                  <TableCell>{run.errorMessage ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className='text-muted-foreground text-sm'>暂无运行记录</div>
        )}
      </CardContent>
    </Card>
  )
}
