import { Badge } from '@/components/ui/badge'
import {
  scheduledJobLogStatusLabels,
  scheduledJobStatusLabels,
  type ScheduledJobLogStatus,
  type ScheduledJobStatus,
} from '../types'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const taskStatusVariants: Record<ScheduledJobStatus, BadgeVariant> = {
  NOT_STARTED: 'secondary',
  RUNNING: 'default',
  PAUSED: 'outline',
  SUCCEEDED: 'secondary',
  FAILED: 'destructive',
}

const logStatusVariants: Record<ScheduledJobLogStatus, BadgeVariant> = {
  RUNNING: 'default',
  SUCCEEDED: 'secondary',
  FAILED: 'destructive',
}

type ScheduledJobStatusBadgeProps = {
  status: ScheduledJobStatus
}

type ScheduledJobLogStatusBadgeProps = {
  status: ScheduledJobLogStatus
}

export function ScheduledJobStatusBadge({
  status,
}: ScheduledJobStatusBadgeProps) {
  return (
    <Badge variant={taskStatusVariants[status]}>
      {scheduledJobStatusLabels[status]}
    </Badge>
  )
}

export function ScheduledJobLogStatusBadge({
  status,
}: ScheduledJobLogStatusBadgeProps) {
  return (
    <Badge variant={logStatusVariants[status]}>
      {scheduledJobLogStatusLabels[status]}
    </Badge>
  )
}
