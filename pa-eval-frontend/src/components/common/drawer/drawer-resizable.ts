import type { DrawerMode } from './index'

const DRAWER_MIN_WIDTH = 360
const RESIZE_HANDLE_CLASS_NAME =
  'absolute inset-y-0 start-0 z-10 w-3 -translate-x-1.5 cursor-col-resize touch-none after:absolute after:inset-y-0 after:start-1/2 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors hover:after:bg-primary/60 data-[resizing=true]:after:bg-primary'

function shouldEnableResizableDrawer(
  mode: DrawerMode,
  resizable?: boolean
): boolean {
  return resizable ?? mode === 'enhanced'
}

function shouldCloseDrawerOnInteractOutside(isResizable: boolean): boolean {
  return !isResizable
}

function shouldShowDrawerOverlay(
  mode: DrawerMode,
  showOverlay?: boolean
): boolean {
  return showOverlay ?? mode !== 'enhanced'
}

function shouldUseModalDrawer(
  mode: DrawerMode,
  showOverlay?: boolean
): boolean {
  return shouldShowDrawerOverlay(mode, showOverlay)
}

function getResizableDrawerWidth(
  pointerClientX: number,
  viewportWidth: number,
  minWidth = DRAWER_MIN_WIDTH
): number {
  const effectiveMinWidth = Math.min(minWidth, viewportWidth)
  const nextWidth = viewportWidth - pointerClientX

  return Math.min(Math.max(nextWidth, effectiveMinWidth), viewportWidth)
}

function getResizableDrawerWidthResetKey(
  mode: DrawerMode,
  width?: number | string,
  _open?: boolean
): string {
  return `${mode}:${String(width)}`
}

function getResizeHandleClassName(): string {
  return RESIZE_HANDLE_CLASS_NAME
}

export {
  DRAWER_MIN_WIDTH,
  getResizeHandleClassName,
  getResizableDrawerWidth,
  getResizableDrawerWidthResetKey,
  shouldCloseDrawerOnInteractOutside,
  shouldEnableResizableDrawer,
  shouldShowDrawerOverlay,
  shouldUseModalDrawer,
}
