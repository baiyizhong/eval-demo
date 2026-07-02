import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type DrawerMode = 'default' | 'enhanced'

type DrawerActionProps = React.ComponentProps<typeof Button>

type DrawerProps = React.ComponentProps<typeof Sheet> & {
  title: React.ReactNode
  children?: React.ReactNode
  mode?: DrawerMode
  width?: number | string
  actions?: React.ReactNode | null
  showCancel?: boolean
  showConfirm?: boolean
  cancelText?: React.ReactNode
  confirmText?: React.ReactNode
  onCancel?: () => void
  onConfirm?: () => void
  cancelProps?: DrawerActionProps
  confirmProps?: DrawerActionProps
  contentProps?: Omit<React.ComponentProps<typeof SheetContent>, 'children'>
}

function getDrawerWidth(mode: DrawerMode, width?: number | string) {
  if (width) {
    return typeof width === 'number' ? `${width}px` : width
  }

  return mode === 'enhanced' ? '70vw' : '450px'
}

function Drawer({
  title,
  children,
  mode = 'default',
  width,
  actions,
  showCancel = true,
  showConfirm = true,
  cancelText = '取消',
  confirmText = '确认',
  onCancel,
  onConfirm,
  cancelProps,
  confirmProps,
  contentProps,
  onOpenChange,
  ...props
}: DrawerProps) {
  const {
    className: contentClassName,
    style: contentStyle,
    ...restContentProps
  } = contentProps ?? {}

  const handleCancel = () => {
    onCancel?.()
    onOpenChange?.(false)
  }

  const defaultActions =
    showCancel || showConfirm ? (
      <div className='flex items-center gap-2'>
        {showConfirm ? (
          <Button type='button' size='sm' onClick={onConfirm} {...confirmProps}>
            {confirmProps?.children ?? confirmText}
          </Button>
        ) : null}
        {showCancel ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={handleCancel}
            {...cancelProps}
          >
            {cancelProps?.children ?? cancelText}
          </Button>
        ) : null}
      </div>
    ) : null

  return (
    <Sheet onOpenChange={onOpenChange} {...props}>
      <SheetContent
        className={cn('gap-0 [&>button:last-child]:hidden', contentClassName)}
        style={{
          width: getDrawerWidth(mode, width),
          maxWidth: '100vw',
          ...contentStyle,
        }}
        {...restContentProps}
      >
        <SheetHeader className='border-b'>
          <div className='flex items-center justify-between gap-4'>
            <SheetTitle className='min-w-0 truncate text-start'>
              {title}
            </SheetTitle>
            {actions === undefined ? defaultActions : actions}
          </div>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}

export { Drawer }
export type { DrawerMode, DrawerProps }
