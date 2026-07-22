import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type ChartMetricCardProps = Omit<
  ComponentProps<typeof Card>,
  'title'
> & {
  title: ReactNode
  value: ReactNode
  description?: ReactNode
  icon?: ReactNode
  headerClassName?: string
  contentClassName?: string
  titleClassName?: string
  valueClassName?: string
  descriptionClassName?: string
}

export function ChartMetricCard({
  title,
  value,
  description,
  icon,
  className,
  headerClassName,
  contentClassName,
  titleClassName,
  valueClassName,
  descriptionClassName,
  ...props
}: ChartMetricCardProps) {
  return (
    <Card className={cn('min-h-[120px] gap-2 py-4', className)} {...props}>
      <CardHeader
        className={cn(
          'flex flex-row items-center justify-between gap-2 pb-0',
          headerClassName
        )}
      >
        <CardTitle className={cn('text-sm font-medium', titleClassName)}>
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent className={contentClassName}>
        <div
          className={cn(
            'mb-1 text-2xl font-bold tabular-nums',
            valueClassName
          )}
        >
          {value}
        </div>
        {description ? (
          <p
            className={cn(
              'text-muted-foreground text-xs',
              descriptionClassName
            )}
          >
            {description}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
