import * as React from 'react'
import { cn } from '@/lib/utils'

export function Tree({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role='tree'
      className={cn('flex min-w-0 flex-col gap-0.5 text-sm', className)}
      {...props}
    />
  )
}

export function TreeItem({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      role='treeitem'
      aria-selected={selected}
      className={cn(
        'group/tree-item flex min-w-0 items-center rounded-md outline-none',
        selected && 'bg-accent text-accent-foreground',
        className
      )}
      {...props}
    />
  )
}

export function TreeItemLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5',
        className
      )}
      {...props}
    />
  )
}
