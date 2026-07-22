import type { DrawerMode } from './drawer-width'

const DRAWER_MIN_WIDTH = 360
const RESIZE_HANDLE_CLASS_NAME =
  'absolute inset-y-0 start-0 z-10 w-3 -translate-x-1.5 cursor-col-resize touch-none after:absolute after:inset-y-0 after:start-1/2 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors hover:after:bg-primary/60 data-[resizing=true]:after:bg-primary'
const DRAWER_OUTSIDE_CLICK_IGNORE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="row"]',
  '[tabindex]:not([tabindex="-1"])',
  '[data-slot="table-row"]',
  '[data-drawer-outside-click-ignore]',
].join(',')

function shouldEnableResizableDrawer(
  mode: DrawerMode,
  resizable?: boolean
): boolean {
  return resizable ?? mode === 'enhanced'
}

function shouldCloseDrawerOnInteractOutside(isResizing: boolean): boolean {
  return !isResizing
}

function shouldCloseDrawerOnOutsideClick(
  open: boolean | undefined,
  showOverlay: boolean,
  isResizing: boolean
): boolean {
  return Boolean(open) && !showOverlay && !isResizing
}

function shouldIgnoreDrawerOutsideClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(target.closest(DRAWER_OUTSIDE_CLICK_IGNORE_SELECTOR))
}

function shouldPreventDrawerScrollChaining(
  target: EventTarget | null,
  boundaryElement: HTMLElement | null,
  deltaY: number
): boolean {
  if (!boundaryElement || !(target instanceof Node) || deltaY === 0) {
    return false
  }

  let currentElement =
    target instanceof HTMLElement
      ? target
      : target.parentNode instanceof HTMLElement
        ? target.parentNode
        : null

  while (currentElement && boundaryElement.contains(currentElement)) {
    if (canElementScrollVertically(currentElement, deltaY)) {
      return false
    }

    currentElement = currentElement.parentElement
  }

  return true
}

function canElementScrollVertically(element: HTMLElement, deltaY: number) {
  if (element.scrollHeight <= element.clientHeight) {
    return false
  }

  const overflowY = window.getComputedStyle(element).overflowY

  if (!['auto', 'scroll', 'overlay'].includes(overflowY)) {
    return false
  }

  if (deltaY < 0) {
    return element.scrollTop > 0
  }

  return element.scrollTop + element.clientHeight < element.scrollHeight
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
  width?: string,
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
  shouldCloseDrawerOnOutsideClick,
  shouldEnableResizableDrawer,
  shouldIgnoreDrawerOutsideClick,
  shouldPreventDrawerScrollChaining,
  shouldShowDrawerOverlay,
  shouldUseModalDrawer,
}
