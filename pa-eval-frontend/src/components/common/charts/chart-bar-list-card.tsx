import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export type ChartBarListCardItem = {
  id?: React.Key
  name: ReactNode
  value: number
}

export type ChartBarListCardProps = Omit<
  ComponentProps<typeof Card>,
  'title'
> & {
  title: ReactNode
  description?: ReactNode
  items: ChartBarListCardItem[]
  barClass?: string
  valueFormatter?: (value: number) => ReactNode
  contentClassName?: string
  listClassName?: string
}

export function ChartBarListCard({
  title,
  description,
  items,
  barClass = 'bg-primary',
  valueFormatter = (value) => `${value}`,
  className,
  contentClassName,
  listClassName,
  ...props
}: ChartBarListCardProps) {
  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <Card className={className} {...props}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={contentClassName}>
        <ul className={cn('flex flex-col gap-3', listClassName)}>
          {items.map((item, index) => {
            const width = `${Math.round((item.value / max) * 100)}%`

            return (
              <li
                key={item.id ?? index}
                className='flex items-center justify-between gap-3'
              >
                <div className='min-w-0 flex-1'>
                  <div className='text-muted-foreground mb-1 truncate text-xs'>
                    {item.name}
                  </div>
                  <div className='bg-muted h-2.5 w-full rounded-full'>
                    <div
                      className={cn('h-2.5 rounded-full', barClass)}
                      style={{ width }}
                    />
                  </div>
                </div>
                <div className='ps-2 text-xs font-medium tabular-nums'>
                  {valueFormatter(item.value)}
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
