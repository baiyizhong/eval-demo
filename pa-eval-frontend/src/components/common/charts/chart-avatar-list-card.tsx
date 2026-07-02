import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ChartAvatarItem } from './chart-avatar-item'

export type ChartAvatarListCardItem = {
  id?: React.Key
  title: ReactNode
  description?: ReactNode
  value?: ReactNode
  avatarSrc?: string
  avatarAlt?: string
  avatarFallback: ReactNode
  avatarClassName?: string
}

export type ChartAvatarListCardProps = Omit<
  ComponentProps<typeof Card>,
  'title'
> & {
  title: ReactNode
  description?: ReactNode
  items: ChartAvatarListCardItem[]
  contentClassName?: string
  listClassName?: string
}

export function ChartAvatarListCard({
  title,
  description,
  items,
  className,
  contentClassName,
  listClassName,
  ...props
}: ChartAvatarListCardProps) {
  return (
    <Card className={className} {...props}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={contentClassName}>
        <div className={cn('space-y-8', listClassName)}>
          {items.map((item, index) => (
            <ChartAvatarItem
              key={item.id ?? index}
              avatarSrc={item.avatarSrc}
              avatarAlt={item.avatarAlt}
              avatarFallback={item.avatarFallback}
              avatarClassName={item.avatarClassName}
              title={item.title}
              description={item.description}
              value={item.value}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
