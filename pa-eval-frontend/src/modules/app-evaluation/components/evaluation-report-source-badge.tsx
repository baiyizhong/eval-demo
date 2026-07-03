import { Badge } from '@/components/ui/badge'
import {
  evaluationReportSourceTypeLabels,
  type EvaluationReportSourceType,
} from '../types'

export function EvaluationReportSourceBadge({
  sourceType,
}: {
  sourceType: EvaluationReportSourceType
}) {
  return (
    <Badge variant={sourceType === 'AUTO_EVAL' ? 'default' : 'secondary'}>
      {evaluationReportSourceTypeLabels[sourceType]}
    </Badge>
  )
}
