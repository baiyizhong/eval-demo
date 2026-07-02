import * as React from 'react'
import { cn } from '@/lib/utils'

type BaseDetailFieldItem = {
  key?: React.Key
  label: React.ReactNode
  value?: React.ReactNode
  emptyText?: React.ReactNode
  span?: 1 | 2 | 'full'
  className?: string
  labelClassName?: string
  valueClassName?: string
}

type BaseDetailCustomItem = {
  key?: React.Key
  render: React.ReactNode | (() => React.ReactNode)
  span?: 1 | 2 | 'full'
  className?: string
}

type BaseDetailItem = BaseDetailFieldItem | BaseDetailCustomItem

type BaseDetailProps = Omit<React.ComponentProps<'dl'>, 'children'> & {
  items: BaseDetailItem[]
  columns?: 1 | 2
  emptyText?: React.ReactNode
}

function getItemClassName(item: BaseDetailItem) {
  return cn(item.span === 2 || item.span === 'full' ? 'sm:col-span-2' : null)
}

function isCustomItem(item: BaseDetailItem): item is BaseDetailCustomItem {
  return 'render' in item
}

function BaseDetail({
  items,
  columns = 1,
  emptyText = '-',
  className,
  ...props
}: BaseDetailProps) {
  return (
    <dl
      className={cn(
        'grid gap-4 p-4',
        columns === 2 && 'sm:grid-cols-2',
        className
      )}
      {...props}
    >
      {items.map((item, index) => {
        const key = item.key ?? index

        if (isCustomItem(item)) {
          return (
            <div
              key={key}
              className={cn(getItemClassName(item), item.className)}
            >
              {typeof item.render === 'function' ? item.render() : item.render}
            </div>
          )
        }

        return (
          <div
            key={key}
            className={cn('grid gap-1', getItemClassName(item), item.className)}
          >
            <dt
              className={cn(
                'text-muted-foreground text-sm',
                item.labelClassName
              )}
            >
              {item.label}
            </dt>
            <dd className={cn('text-sm break-words', item.valueClassName)}>
              {item.value === undefined || item.value === null
                ? (item.emptyText ?? emptyText)
                : item.value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

export { BaseDetail }
export type {
  BaseDetailCustomItem,
  BaseDetailFieldItem,
  BaseDetailItem,
  BaseDetailProps,
}
