import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type FormDialogSize = 'sm' | 'default' | 'lg'

type FormDialogActionProps = React.ComponentProps<typeof Button>

type FormDialogProps = React.ComponentProps<typeof Dialog> & {
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  size?: FormDialogSize
  width?: number | string
  actions?: React.ReactNode | null
  showCancel?: boolean
  showConfirm?: boolean
  cancelText?: React.ReactNode
  confirmText?: React.ReactNode
  onCancel?: () => void
  onConfirm?: () => void
  cancelProps?: FormDialogActionProps
  confirmProps?: FormDialogActionProps
  contentProps?: Omit<React.ComponentProps<typeof DialogContent>, 'children'>
  bodyProps?: Omit<React.ComponentProps<'div'>, 'children'>
  footerProps?: React.ComponentProps<typeof DialogFooter>
}

const formDialogWidthMap: Record<FormDialogSize, string> = {
  sm: '400px',
  default: '480px',
  lg: '640px',
}

function getFormDialogWidth(size: FormDialogSize, width?: number | string) {
  if (width) {
    return typeof width === 'number' ? `${width}px` : width
  }

  return formDialogWidthMap[size]
}

function FormDialog({
  title,
  description,
  children,
  size = 'default',
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
  bodyProps,
  footerProps,
  onOpenChange,
  ...props
}: FormDialogProps) {
  const {
    className: contentClassName,
    style: contentStyle,
    showCloseButton = false,
    ...restContentProps
  } = contentProps ?? {}
  const {
    className: bodyClassName,
    ...restBodyProps
  } = bodyProps ?? {}
  const {
    className: footerClassName,
    ...restFooterProps
  } = footerProps ?? {}

  const handleCancel: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    cancelProps?.onClick?.(event)

    if (event.defaultPrevented) {
      return
    }

    onCancel?.()
    onOpenChange?.(false)
  }

  const handleConfirm: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    confirmProps?.onClick?.(event)

    if (event.defaultPrevented) {
      return
    }

    onConfirm?.()
  }

  const defaultActions =
    showCancel || showConfirm ? (
      <>
        {showCancel ? (
          <Button
            {...cancelProps}
            type={cancelProps?.type ?? 'button'}
            variant={cancelProps?.variant ?? 'outline'}
            onClick={handleCancel}
          >
            {cancelProps?.children ?? cancelText}
          </Button>
        ) : null}
        {showConfirm ? (
          <Button
            {...confirmProps}
            type={confirmProps?.type ?? 'button'}
            onClick={handleConfirm}
          >
            {confirmProps?.children ?? confirmText}
          </Button>
        ) : null}
      </>
    ) : null

  const footerContent = actions === undefined ? defaultActions : actions

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn('gap-0 p-0 sm:max-w-none', contentClassName)}
        style={{
          width: getFormDialogWidth(size, width),
          maxWidth: 'calc(100vw - 2rem)',
          ...contentStyle,
        }}
        {...restContentProps}
      >
        <DialogHeader className='p-6 pb-4 text-start'>
          <DialogTitle className='min-w-0 truncate text-start'>
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div
          className={cn(
            'flex flex-col gap-4 px-6',
            footerContent ? 'pb-4' : 'pb-6',
            bodyClassName
          )}
          {...restBodyProps}
        >
          {children}
        </div>
        {footerContent ? (
          <DialogFooter
            className={cn('border-t p-4 sm:justify-end', footerClassName)}
            {...restFooterProps}
          >
            {footerContent}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export { FormDialog }
export type { FormDialogProps, FormDialogSize }
