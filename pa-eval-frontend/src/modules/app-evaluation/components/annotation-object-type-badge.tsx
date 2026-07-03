import { Badge } from '@/components/ui/badge'
import {
  annotationObjectTypeLabels,
  type AnnotationObjectType,
} from '../types'

type AnnotationObjectTypeBadgeProps = {
  objectType: AnnotationObjectType
}

export function AnnotationObjectTypeBadge({
  objectType,
}: AnnotationObjectTypeBadgeProps) {
  return <Badge variant='outline'>{annotationObjectTypeLabels[objectType]}</Badge>
}
