import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { datasetTypeLabels, type DatasetType } from '../types'

const datasetTypeBadgeClassName: Record<DatasetType, string> = {
  evaluation:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
  badcase:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300',
  golden:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  anomaly:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
}

export function DatasetTypeBadge({
  type,
  className,
}: {
  type: DatasetType
  className?: string
}) {
  return (
    <Badge
      variant='outline'
      className={cn(datasetTypeBadgeClassName[type], className)}
    >
      {datasetTypeLabels[type]}
    </Badge>
  )
}
