import { type ComponentProps, type MouseEvent, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type AppCardTag = {
  label: ReactNode
  variant?: ComponentProps<typeof Badge>['variant']
  className?: string
}

export type AppCardListItem = {
  name: string
  status: 'archived' | 'active'
  desc: string
  tags?: AppCardTag[]
  createdAt?: ReactNode
}

type AppCardActionButton = {
  label: ReactNode
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  className?: string
  onClick?: (app: AppCardListItem, event: MouseEvent<HTMLButtonElement>) => void
}

type AppCardIconAction = {
  icon: ReactNode
  ariaLabel?: string
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  className?: string
  onClick?: (app: AppCardListItem, event: MouseEvent<HTMLButtonElement>) => void
}

type AppCardListProps = {
  apps: AppCardListItem[]
  actionButton: AppCardActionButton
  iconActions: AppCardIconAction[]
  getTags?: (app: AppCardListItem) => AppCardTag[]
  getCreatedAt?: (app: AppCardListItem) => ReactNode
  onCardClick?: (app: AppCardListItem, event: MouseEvent<HTMLLIElement>) => void
}

export function AppCardList({
  apps,
  actionButton,
  iconActions,
  getTags,
  getCreatedAt,
  onCardClick,
}: AppCardListProps) {
  const renderableIconActions = iconActions.filter((action) =>
    Boolean(action.onClick)
  )

  return (
    <ul className='no-scrollbar grid gap-4 overflow-auto pt-4 pb-16 md:grid-cols-2 lg:grid-cols-3'>
      {apps.map((app) => {
        const tags = getTags?.(app) ?? app.tags ?? []
        const createdAt = getCreatedAt?.(app) ?? app.createdAt

        return (
          <li
            key={app.name}
            className='hover:bg-accent/40 hover:ring-primary/30 flex cursor-pointer flex-col rounded-lg border p-4 shadow-md transition-all duration-200 hover:shadow-lg hover:ring-1'
            onClick={(event) => onCardClick?.(app, event)}
          >
            <div className='mb-3 flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <h2 className='mb-1 truncate font-semibold'>{app.name}</h2>
                <p className='text-muted-foreground line-clamp-2'>{app.desc}</p>
              </div>
              <div className='flex shrink-0 items-center gap-1'>
                {renderableIconActions.map((action, index) => (
                  <Button
                    key={index}
                    type='button'
                    aria-label={action.ariaLabel}
                    title={action.ariaLabel}
                    variant={action.variant ?? 'ghost'}
                    size={action.size ?? 'icon'}
                    className={action.className ?? 'size-8 border'}
                    onClick={(event) => {
                      event.stopPropagation()
                      action.onClick?.(app, event)
                    }}
                  >
                    {action.icon}
                  </Button>
                ))}
              </div>
            </div>
            <div className='mt-auto flex min-w-0 flex-wrap items-center gap-2'>
              {tags.map((tag, index) => (
                <Badge
                  key={index}
                  variant={tag.variant ?? 'secondary'}
                  className={tag.className}
                >
                  {tag.label}
                </Badge>
              ))}
            </div>
            <div className='mt-4 flex items-center justify-between gap-4'>
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                {createdAt ? (
                  <p className='text-muted-foreground text-xs'>
                    创建时间：{createdAt}
                  </p>
                ) : null}
              </div>
              <Button
                type='button'
                variant={actionButton.variant ?? 'outline'}
                size={actionButton.size ?? 'sm'}
                className={actionButton.className}
                onClick={(event) => {
                  event.stopPropagation()
                  actionButton.onClick?.(app, event)
                }}
              >
                {actionButton.label}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
