import { Badge } from '@/components/ui/badge'
import {
  evaluationReportStatusLabels,
  type EvaluationReportStatus,
} from '../types'

const variants: Record<
  EvaluationReportStatus,
  React.ComponentProps<typeof Badge>['variant']
> = {
  GENERATING: 'default',
  READY: 'secondary',
  FAILED: 'destructive',
}

export function EvaluationReportStatusBadge({
  status,
}: {
  status: EvaluationReportStatus
}) {
  return <Badge variant={variants[status]}>{evaluationReportStatusLabels[status]}</Badge>
}
