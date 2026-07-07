import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export type ChartAvatarItemProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'title'
> & {
  title: ReactNode
  description?: ReactNode
  value?: ReactNode
  avatarSrc?: string
  avatarAlt?: string
  avatarFallback: ReactNode
  avatarClassName?: string
}

export function ChartAvatarItem({
  title,
  description,
  value,
  avatarSrc,
  avatarAlt = '',
  avatarFallback,
  className,
  avatarClassName,
  ...props
}: ChartAvatarItemProps) {
  return (
    <div className={cn('flex items-center gap-4', className)} {...props}>
      <Avatar className={cn('size-9', avatarClassName)}>
        {avatarSrc ? <AvatarImage src={avatarSrc} alt={avatarAlt} /> : null}
        <AvatarFallback>{avatarFallback}</AvatarFallback>
      </Avatar>
      <div className='flex flex-1 flex-wrap items-center justify-between'>
        <div className='flex flex-col gap-1'>
          <p className='text-sm leading-none font-medium'>{title}</p>
          {description ? (
            <p className='text-muted-foreground text-sm'>{description}</p>
          ) : null}
        </div>
        {value ? <div className='font-medium'>{value}</div> : null}
      </div>
    </div>
  )
}
