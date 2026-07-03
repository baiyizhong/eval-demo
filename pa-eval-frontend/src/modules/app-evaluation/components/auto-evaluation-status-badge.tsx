import { Badge } from '@/components/ui/badge'
import {
  autoEvaluationStatusLabels,
  type AutoEvaluationTaskStatus,
} from '../types'

const variants: Record<
  AutoEvaluationTaskStatus,
  React.ComponentProps<typeof Badge>['variant']
> = {
  DRAFT: 'outline',
  READY: 'secondary',
  RUNNING: 'default',
  COMPLETED: 'secondary',
  FAILED: 'destructive',
  CANCELLED: 'outline',
}

export function AutoEvaluationStatusBadge({
  status,
}: {
  status: AutoEvaluationTaskStatus
}) {
  return <Badge variant={variants[status]}>{autoEvaluationStatusLabels[status]}</Badge>
}
