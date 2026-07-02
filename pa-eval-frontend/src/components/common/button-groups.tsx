import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type ButtonProps = React.ComponentProps<typeof Button>

export type ButtonGroupItem = Omit<ButtonProps, 'children'> & {
  id?: React.Key
  label: React.ReactNode
  icon?: LucideIcon
  iconPosition?: 'start' | 'end'
  hidden?: boolean
}

export type ButtonGroupsProps = React.HTMLAttributes<HTMLDivElement> & {
  buttons?: ButtonGroupItem[] | null
}

export function ButtonGroups({
  buttons,
  className,
  ...props
}: ButtonGroupsProps) {
  if (!buttons?.length) {
    return null
  }

  return (
    <div className={cn('flex gap-2', className)} {...props}>
      {buttons.map(
        (
          { id, label, icon: Icon, iconPosition = 'end', hidden, ...button },
          index
        ) => {
          if (hidden) {
            return null
          }

          return (
            <Button key={id ?? index} {...button}>
              {Icon && iconPosition === 'start' ? (
                <Icon data-icon='inline-start' />
              ) : null}
              <span>{label}</span>
              {Icon && iconPosition === 'end' ? (
                <Icon data-icon='inline-end' />
              ) : null}
            </Button>
          )
        }
      )}
    </div>
  )
}
