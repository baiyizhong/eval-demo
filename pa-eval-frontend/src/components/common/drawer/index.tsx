import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  getResizeHandleClassName,
  getResizableDrawerWidth,
  getResizableDrawerWidthResetKey,
  shouldCloseDrawerOnInteractOutside,
  shouldCloseDrawerOnOutsideDoubleClick,
  shouldEnableResizableDrawer,
  shouldShowDrawerOverlay,
  shouldUseModalDrawer,
} from './drawer-resizable'
import {
  getDrawerBodyClassName,
  getDrawerContentClassName,
  getDrawerHeaderClassName,
} from './drawer-layout'

type DrawerMode = 'default' | 'enhanced'

type DrawerActionProps = React.ComponentProps<typeof Button>

type DrawerProps = React.ComponentProps<typeof Sheet> & {
  title: React.ReactNode
  children?: React.ReactNode
  mode?: DrawerMode
  width?: number | string
  resizable?: boolean
  showOverlay?: boolean
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

  return mode === 'enhanced' ? '50vw' : '500px'
}

function Drawer({
  title,
  children,
  mode = 'default',
  width,
  resizable = true,
  showOverlay=true,
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
  open,
  onOpenChange,
  modal,
  ...props
}: DrawerProps) {
  const widthResetKey = getResizableDrawerWidthResetKey(mode, width, open)
  const [resizedState, setResizedState] = React.useState<{
    key: string
    width?: number
  }>({ key: widthResetKey })
  const [isResizing, setIsResizing] = React.useState(false)
  const drawerContentId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const isResizable = shouldEnableResizableDrawer(mode, resizable)
  const resizedWidth =
    resizedState.key === widthResetKey ? resizedState.width : undefined
  const resolvedShowOverlay = shouldShowDrawerOverlay(mode, showOverlay)
  const resolvedModal = modal ?? shouldUseModalDrawer(mode, showOverlay)
  const {
    className: contentClassName,
    style: contentStyle,
    onInteractOutside: contentOnInteractOutside,
    ...restContentProps
  } = contentProps ?? {}

  React.useEffect(() => {
    if (!isResizing) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent) => {
      setResizedState({
        key: widthResetKey,
        width: getResizableDrawerWidth(event.clientX, window.innerWidth),
      })
    }

    const handlePointerUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [isResizing, widthResetKey])

  React.useEffect(() => {
    if (
      !shouldCloseDrawerOnOutsideDoubleClick(
        open,
        resolvedShowOverlay,
        isResizing
      )
    ) {
      return
    }

    const handleDocumentDoubleClick = (event: MouseEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      const contentElement = document.querySelector(
        `[data-drawer-content-id="${drawerContentId}"]`
      )

      if (contentElement?.contains(target)) {
        return
      }

      onOpenChange?.(false)
    }

    document.addEventListener('dblclick', handleDocumentDoubleClick)

    return () => {
      document.removeEventListener('dblclick', handleDocumentDoubleClick)
    }
  }, [drawerContentId, isResizing, onOpenChange, open, resolvedShowOverlay])

  const handleCancel = () => {
    onCancel?.()
    onOpenChange?.(false)
  }

  const handleInteractOutside: React.ComponentProps<
    typeof SheetContent
  >['onInteractOutside'] = (event) => {
    contentOnInteractOutside?.(event)

    if (!shouldCloseDrawerOnInteractOutside(isResizable)) {
      event.preventDefault()
    }
  }

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setIsResizing(true)
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
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      modal={resolvedModal}
      {...props}
    >
      <SheetContent
        className={cn(
          getDrawerContentClassName(),
          isResizing && 'transition-none',
          contentClassName
        )}
        style={{
          width:
            isResizable && resizedWidth
              ? `${resizedWidth}px`
              : getDrawerWidth(mode, width),
          maxWidth: '100vw',
          ...contentStyle,
        }}
        {...restContentProps}
        data-drawer-content-id={drawerContentId}
        onInteractOutside={handleInteractOutside}
        showOverlay={resolvedShowOverlay}
      >
        {isResizable ? (
          <div
            aria-label='调整抽屉宽度'
            aria-orientation='vertical'
            className={getResizeHandleClassName()}
            data-resizing={isResizing}
            role='separator'
            onPointerDown={handleResizePointerDown}
          />
        ) : null}
        <SheetHeader className={getDrawerHeaderClassName()}>
          <div className='flex items-center justify-between gap-4'>
            <SheetTitle className='min-w-0 truncate text-start'>
              {title}
            </SheetTitle>
            {actions === undefined ? defaultActions : actions}
          </div>
        </SheetHeader>
        <div className={getDrawerBodyClassName()}>{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export { Drawer }
export type { DrawerMode, DrawerProps }
