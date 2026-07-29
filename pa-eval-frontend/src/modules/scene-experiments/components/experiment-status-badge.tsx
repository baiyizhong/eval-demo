import { Badge } from '@/components/ui/badge'
import type { ExperimentReportStatus } from '../types'

const statusLabels: Record<ExperimentReportStatus, string> = {
  QUEUED: '排队中',
  RUNNING: '运行中',
  SCORING: '评分中',
  COMPLETED: '已完成',
  FAILED: '失败',
}

export function ExperimentStatusBadge({
  status,
}: {
  status: ExperimentReportStatus
}) {
  return (
    <Badge
      variant={
        status === 'FAILED'
          ? 'destructive'
          : status === 'COMPLETED'
            ? 'default'
            : 'secondary'
      }
    >
      {statusLabels[status]}
    </Badge>
  )
}
