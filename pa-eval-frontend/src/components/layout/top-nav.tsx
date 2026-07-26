import type { MouseEvent, ReactNode } from 'react'
import type { PermissionAccessRule, PermissionScope } from '@/types/permission'
import type { LucideIcon } from 'lucide-react'
import type { ActiveMatch } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ProfileDropdown } from '@/components/common/profile-dropdown'

export type TopNavBrand = {
  name: string
  initial?: string
  href?: string
  ariaLabel?: string
}

export type TopNavItem = {
  id: string
  label: string
  href: string
  activeMatch?: ActiveMatch
  active?: boolean
  highlighted?: boolean
  access?: string | string[]
  accessRules?: PermissionAccessRule[]
  superAccess?: boolean
  scope?: PermissionScope
}

export type TopNavAction = {
  id: string
  label: string
  href?: string
  icon: LucideIcon
  title?: string
  ariaLabel?: string
}

export type TopNavUser = {
  name: string
  email?: string
  initials?: string
  avatarUrl?: string
}

export type TopNavProps = {
  brand: TopNavBrand
  items: TopNavItem[]
  inlineActions: TopNavAction[]
  rightSlot?: ReactNode
  user?: TopNavUser | null
  menuActions?: TopNavAction[]
  onNavigate?: (item: TopNavItem, event: MouseEvent<HTMLAnchorElement>) => void
  onAction?: (
    action: TopNavAction,
    event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>
  ) => void
  className?: string
  containerClassName?: string
}

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase()
}

function BrandContent({ brand }: { brand: TopNavBrand }) {
  return (
    <>
      <div className='bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg'>
        <span className='text-lg font-bold'>
          {brand.initial ?? getInitial(brand.name)}
        </span>
      </div>
      <span className='text-foreground text-lg font-semibold'>
        {brand.name}
      </span>
    </>
  )
}

function TopNavActionItem({
  action,
  onAction,
  className,
}: {
  action: TopNavAction
  onAction?: TopNavProps['onAction']
  className?: string
}) {
  const Icon = action.icon

  if (action.href) {
    return (
      <Button asChild variant='ghost' size='sm' className={className}>
        <a
          href={action.href}
          title={action.title ?? action.label}
          aria-label={action.ariaLabel ?? action.label}
          onClick={(event) => onAction?.(action, event)}
        >
          <Icon data-icon='inline-start' />
          <span>{action.label}</span>
        </a>
      </Button>
    )
  }

  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      title={action.title ?? action.label}
      aria-label={action.ariaLabel ?? action.label}
      className={className}
      onClick={(event) => onAction?.(action, event)}
    >
      <Icon data-icon='inline-start' />
      <span>{action.label}</span>
    </Button>
  )
}

export function TopNav({
  brand,
  items,
  inlineActions,
  rightSlot,
  user,
  menuActions = [],
  onNavigate,
  onAction,
  className,
  containerClassName,
}: TopNavProps) {
  return (
    <nav
      className={cn(
        className,
        'bg-background fixed top-0 right-0 left-0 z-50 w-full border-b shadow'
      )}
    >
      <div
        className={cn(
          'mx-auto flex h-14 items-center justify-between gap-4 px-6 sm:px-8 lg:px-10',
          containerClassName
        )}
      >
        {/* 左侧：标识和名称 */}
        <div className='flex min-w-0 items-center gap-10 lg:gap-14'>
          {brand.href ? (
            <a
              href={brand.href}
              aria-label={brand.ariaLabel ?? brand.name}
              className='flex items-center gap-2'
            >
              <BrandContent brand={brand} />
            </a>
          ) : (
            <div className='flex items-center gap-2'>
              <BrandContent brand={brand} />
            </div>
          )}

          {/* 导航菜单 */}
          <div className='hidden items-center gap-1 md:flex'>
            {items.map((item) => (
              <Button
                key={item.id}
                asChild
                variant={
                  item.active || item.highlighted ? 'secondary' : 'ghost'
                }
                size='sm'
              >
                <a
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  onClick={(event) => onNavigate?.(item, event)}
                >
                  {item.label}
                </a>
              </Button>
            ))}
          </div>
        </div>

        {/* 右侧：图标和头像 */}
        <div className='flex items-center gap-3'>
          {inlineActions.map((action) => (
            <TopNavActionItem
              key={action.id}
              action={action}
              onAction={onAction}
            />
          ))}

          {rightSlot}

          {/* 用户头像 */}
          {user ? (
            <ProfileDropdown
              user={user}
              actions={menuActions}
              onAction={onAction}
            />
          ) : null}
        </div>
      </div>
    </nav>
  )
}
