import { Badge } from '@/components/ui/badge'
import { annotationItemStatusLabels, type AnnotationItemStatus } from '../types'

type AnnotationStatusBadgeProps = {
  status: AnnotationItemStatus
}

export function AnnotationStatusBadge({ status }: AnnotationStatusBadgeProps) {
  return (
    <Badge variant={status === 'COMPLETED' ? 'default' : 'secondary'}>
      {annotationItemStatusLabels[status]}
    </Badge>
  )
}
