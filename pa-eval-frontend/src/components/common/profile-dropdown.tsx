import type { MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type ProfileDropdownUser = {
  name: string
  email?: string
  initials?: string
  avatarUrl?: string
}

export type ProfileDropdownAction = {
  id: string
  label: string
  href?: string
  icon: LucideIcon
  title?: string
  ariaLabel?: string
}

export type ProfileDropdownProps = {
  user?: ProfileDropdownUser | null
  actions?: ProfileDropdownAction[]
  onAction?: (
    action: ProfileDropdownAction,
    event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>
  ) => void
  className?: string
  triggerClassName?: string
  avatarClassName?: string
  fallbackClassName?: string
  contentClassName?: string
}

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase()
}

function ProfileDropdownActionItem({
  action,
  onAction,
}: {
  action: ProfileDropdownAction
  onAction?: ProfileDropdownProps['onAction']
}) {
  const Icon = action.icon
  const content = (
    <>
      <Icon />
      <span>{action.label}</span>
    </>
  )

  if (action.href) {
    return (
      <DropdownMenuItem asChild>
        <a
          href={action.href}
          title={action.title ?? action.label}
          aria-label={action.ariaLabel ?? action.label}
          onClick={(event) => onAction?.(action, event)}
        >
          {content}
        </a>
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuItem asChild>
      <button
        type='button'
        title={action.title ?? action.label}
        aria-label={action.ariaLabel ?? action.label}
        onClick={(event) => onAction?.(action, event)}
      >
        {content}
      </button>
    </DropdownMenuItem>
  )
}

export function ProfileDropdown(props: ProfileDropdownProps = {}) {
  const {
    user,
    actions = [],
    onAction,
    className,
    triggerClassName,
    avatarClassName,
    fallbackClassName,
    contentClassName,
  } = props

  if (!user) {
    return null
  }

  const userInitials = user.initials ?? getInitial(user.name)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className={cn(
            'relative size-10 rounded-full p-0',
            className,
            triggerClassName
          )}
          aria-label='打开用户菜单'
        >
          <Avatar className={cn('size-10', avatarClassName)}>
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.name} />
            ) : null}
            <AvatarFallback
              className={cn(
                'bg-blue-600 text-sm font-semibold text-white',
                fallbackClassName
              )}
            >
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn('w-56', contentClassName)}
        align='end'
        forceMount
      >
        <DropdownMenuLabel className='font-normal'>
          <div className='flex flex-col gap-1.5'>
            <p className='truncate text-sm leading-none font-medium'>
              {user.name}
            </p>
            {user.email ? (
              <p className='text-muted-foreground truncate text-xs leading-none'>
                {user.email}
              </p>
            ) : null}
          </div>
        </DropdownMenuLabel>
        {actions.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {actions.map((action) => (
                <ProfileDropdownActionItem
                  key={action.id}
                  action={action}
                  onAction={onAction}
                />
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
