import { Badge } from '@/components/ui/badge'
import type { TraceStatus } from '../types'

const statusLabel: Record<TraceStatus, string> = {
  success: '成功',
  failed: '失败',
  running: '运行中',
  unknown: '未知',
}

type StatusBadgeProps = {
  status: TraceStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant={status === 'failed' ? 'destructive' : 'secondary'}
      className={className}
    >
      {statusLabel[status]}
    </Badge>
  )
}
