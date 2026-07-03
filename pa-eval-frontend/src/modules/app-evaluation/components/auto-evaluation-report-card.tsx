import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatDateTime } from './format'
import { EvaluationReportStatusBadge } from './evaluation-report-status-badge'
import type {
  AutoEvaluationLatestReportSummary,
  AutoEvaluationTaskRecord,
} from '../types'

export function AutoEvaluationReportCard({
  projectId,
  task,
  report,
}: {
  projectId: string
  task: AutoEvaluationTaskRecord
  report: AutoEvaluationLatestReportSummary | null
}) {
  if (task.status === 'RUNNING') {
    return <StateCard title='报告生成' desc='任务正在运行，完成后可生成并查看评测报告。' />
  }
  if (task.status === 'FAILED') {
    return (
      <StateCard
        title='报告生成'
        desc='最近一次运行失败，暂无法生成评测报告。可重新运行任务后再查看。'
      />
    )
  }
  if (task.status === 'DRAFT' || task.status === 'READY') {
    return <StateCard title='报告生成' desc='任务尚未运行，运行完成后将生成评测报告。' />
  }
  if (!report) {
    return <StateCard title='报告生成' desc='暂无报告，刷新后查看生成状态。' />
  }
  if (report.status === 'GENERATING') {
    return <StateCard title='报告生成中' desc='报告生成中' />
  }
  if (report.status === 'FAILED') {
    return (
      <StateCard
        title='报告生成失败'
        desc={report.errorMessage ?? '报告生成失败'}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{report.title}</CardTitle>
        <CardDescription>
          {formatDateTime(report.generatedAt)} · {report.sampleCount} 条样本 ·{' '}
          {report.badcaseCount} 个 Badcase
        </CardDescription>
        <CardAction>
          <EvaluationReportStatusBadge status={report.status} />
        </CardAction>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <p className='text-sm'>{report.summary}</p>
        <div>
          <Button asChild>
            <Link to={`/projects/${projectId}/evaluation/reports/${report.id}`}>
              查看报告
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StateCard({ title, desc }: { title: string; desc: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
    </Card>
  )
}
