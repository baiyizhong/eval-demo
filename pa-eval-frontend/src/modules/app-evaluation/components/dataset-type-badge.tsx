import type { ComponentProps } from 'react'
import { Badge } from '@/components/ui/badge'
import { datasetTypeLabels, type DatasetType } from '../types'

const datasetTypeBadgeVariant: Record<
  DatasetType,
  ComponentProps<typeof Badge>['variant']
> = {
  evaluation: 'default',
  badcase: 'destructive',
  golden: 'outline',
  anomaly: 'secondary',
}

export function DatasetTypeBadge({
  type,
  className,
}: {
  type: DatasetType
  className?: string
}) {
  return (
    <Badge variant={datasetTypeBadgeVariant[type]} className={className}>
      {datasetTypeLabels[type]}
    </Badge>
  )
}
