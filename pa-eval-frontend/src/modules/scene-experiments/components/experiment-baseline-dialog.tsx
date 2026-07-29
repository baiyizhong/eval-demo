import { formatDateTime } from '@/modules/app-evaluation/components/format'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { FormDialog } from '@/components/common/form-dialog'
import { Loading } from '@/components/common/loading'
import type { ExperimentReport } from '../types'
import { ExperimentStatusBadge } from './experiment-status-badge'

type ExperimentBaselineDialogProps = {
  open: boolean
  report: ExperimentReport | null
  currentBaselineReport?: ExperimentReport
  hasCurrentBaseline?: boolean
  currentBaselinePending?: boolean
  currentBaselineError?: boolean
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ExperimentBaselineDialog({
  open,
  report,
  currentBaselineReport,
  hasCurrentBaseline = false,
  currentBaselinePending = false,
  currentBaselineError = false,
  pending = false,
  onOpenChange,
  onConfirm,
}: ExperimentBaselineDialogProps) {
  const isReplacing = Boolean(
    hasCurrentBaseline ||
    (currentBaselineReport && currentBaselineReport.id !== report?.id)
  )
  const replacementUnavailable = Boolean(
    isReplacing &&
    (currentBaselinePending || currentBaselineError || !currentBaselineReport)
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isReplacing ? '替换当前基线' : '设为基线'}
      description={
        isReplacing
          ? '新报告将成为当前基线，原基线保留为普通历史报告。'
          : '确认后，该报告将作为同一场景、同一服务系列报告的对比基准。'
      }
      size='lg'
      confirmText={isReplacing ? '确认替换' : '确认设为基线'}
      confirmProps={{
        disabled: pending || !report || replacementUnavailable,
        children: currentBaselinePending
          ? '加载当前基线中...'
          : pending
            ? isReplacing
              ? '替换中...'
              : '设置中...'
            : undefined,
      }}
      onConfirm={onConfirm}
    >
      {report ? (
        isReplacing && currentBaselinePending ? (
          <Loading
            text='加载当前基线报告中...'
            className='min-h-24 border-0 bg-transparent'
          />
        ) : isReplacing && (currentBaselineError || !currentBaselineReport) ? (
          <Alert variant='destructive'>
            <AlertTriangle />
            <AlertTitle>当前基线报告加载失败</AlertTitle>
            <AlertDescription>
              暂时无法确认替换，请关闭后重试。
            </AlertDescription>
          </Alert>
        ) : isReplacing && currentBaselineReport ? (
          <div className='grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center'>
            <ReportSummary label='原基线' report={currentBaselineReport} />
            <span className='text-muted-foreground hidden sm:block'>→</span>
            <ReportSummary label='新基线' report={report} emphasized />
          </div>
        ) : (
          <ReportDetails report={report} />
        )
      ) : null}
    </FormDialog>
  )
}

function ReportDetails({ report }: { report: ExperimentReport }) {
  return (
    <div className='overflow-hidden rounded-md border text-sm'>
      <DetailRow label='报告名称'>{report.name}</DetailRow>
      <DetailRow label='场景'>{report.sceneSnapshot.name}</DetailRow>
      <DetailRow label='调用服务'>
        {report.webhookSnapshot.name} · {report.webhookSnapshot.serviceFamily} ·
        v{report.webhookSnapshot.version}
      </DetailRow>
      <DetailRow label='状态'>
        <ExperimentStatusBadge status={report.status} />
      </DetailRow>
      <DetailRow label='执行信息'>
        {report.runParameters.rounds} 轮 ·{' '}
        {report.completedAt ? formatDateTime(report.completedAt) : '-'}
      </DetailRow>
      <DetailRow label='评分结果' last>
        <ScoreBadges report={report} />
      </DetailRow>
    </div>
  )
}

function ReportSummary({
  label,
  report,
  emphasized = false,
}: {
  label: string
  report: ExperimentReport
  emphasized?: boolean
}) {
  return (
    <div
      className={
        emphasized
          ? 'bg-primary/5 border-primary/35 rounded-md border p-4'
          : 'rounded-md border p-4'
      }
    >
      <p
        className={
          emphasized
            ? 'text-primary text-xs font-medium'
            : 'text-muted-foreground text-xs'
        }
      >
        {label}
      </p>
      <p className='mt-2 font-medium'>{report.name}</p>
      <p className='text-muted-foreground mt-1 text-xs'>
        {report.webhookSnapshot.name} · v{report.webhookSnapshot.version}
      </p>
      <div className='mt-3'>
        <ScoreBadges report={report} limit={2} />
      </div>
    </div>
  )
}

function DetailRow({
  label,
  children,
  last = false,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[6rem_minmax(0,1fr)] ${last ? '' : 'border-b'}`}
    >
      <div className='bg-muted/40 text-muted-foreground px-3 py-2.5'>
        {label}
      </div>
      <div className='min-w-0 px-3 py-2.5'>{children}</div>
    </div>
  )
}

function ScoreBadges({
  report,
  limit = 3,
}: {
  report: ExperimentReport
  limit?: number
}) {
  return report.scoreResults.length ? (
    <div className='flex flex-wrap gap-1.5'>
      {report.scoreResults.slice(0, limit).map((score) => (
        <Badge key={score.key} variant='outline'>
          {score.scoreName} {score.value.toFixed(3)}
        </Badge>
      ))}
      {report.scoreResults.length > limit ? (
        <Badge variant='secondary'>+{report.scoreResults.length - limit}</Badge>
      ) : null}
    </div>
  ) : (
    <span className='text-muted-foreground text-xs'>暂无评分结果</span>
  )
}
