import type { MouseEvent } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { SearchProvider } from '@/context/search-provider'
import { getRouteActiveState } from '@/lib/nav'
import { cn } from '@/lib/utils'
import {
  TopNav,
  type TopNavAction,
  type TopNavItem,
  type TopNavProps,
} from '@/components/layout/top-nav'

type TopbarLayoutProps = {
  navigation: TopNavProps
  children?: React.ReactNode
  className?: string
  contentClassName?: string
}

export function TopbarLayout({
  navigation,
  children,
  className,
  contentClassName,
}: TopbarLayoutProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const navigationWithActiveItems: TopNavProps = {
    ...navigation,
    items: navigation.items.map((item) => ({
      ...item,
      active: getRouteActiveState(pathname, item),
    })),
  }

  const handleNavigate = (
    item: TopNavItem,
    event: MouseEvent<HTMLAnchorElement>
  ) => {
    navigation.onNavigate?.(item, event)

    if (event.defaultPrevented) {
      return
    }

    event.preventDefault()
    navigate(item.href)
  }

  const handleAction = (
    action: TopNavAction,
    event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>
  ) => {
    navigation.onAction?.(action, event)

    if (event.defaultPrevented || !action.href) {
      return
    }

    event.preventDefault()
    navigate(action.href)
  }

  return (
    <SearchProvider>
      <div
        className={cn(
          '@container/content bg-background flex min-h-svh flex-col pt-14',
          className
        )}
      >
        <TopNav
          {...navigationWithActiveItems}
          onNavigate={handleNavigate}
          onAction={handleAction}
        />
        <div
          id='content'
          className={cn(
            'bg-white flex flex-1 flex-col [&>main]:w-full [&>main]:max-w-none [&>main]:px-6 sm:[&>main]:px-8 lg:[&>main]:px-10',
            contentClassName
          )}
        >
          {children ?? <Outlet />}
        </div>
      </div>
    </SearchProvider>
  )
}
