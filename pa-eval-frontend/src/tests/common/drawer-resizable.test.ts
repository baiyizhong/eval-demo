import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getResizeHandleClassName,
  getResizableDrawerWidthResetKey,
  getResizableDrawerWidth,
  shouldShowDrawerOverlay,
  shouldCloseDrawerOnInteractOutside,
  shouldCloseDrawerOnOutsideClick,
  shouldEnableResizableDrawer,
  shouldIgnoreDrawerOutsideClick,
  shouldUseModalDrawer,
} from '../../components/common/drawer/drawer-resizable.ts'

test('enhanced drawer enables resizing by default', () => {
  assert.equal(shouldEnableResizableDrawer('enhanced'), true)
})

test('drawer resizable prop can force enhanced mode resizing off', () => {
  assert.equal(shouldEnableResizableDrawer('enhanced', false), false)
})

test('default drawer does not enable resizing by default', () => {
  assert.equal(shouldEnableResizableDrawer('default'), false)
})

test('enhanced drawer hides overlay by default', () => {
  assert.equal(shouldShowDrawerOverlay('enhanced'), false)
})

test('drawer overlay visibility can be overridden', () => {
  assert.equal(shouldShowDrawerOverlay('enhanced', true), true)
  assert.equal(shouldShowDrawerOverlay('default', false), false)
})

test('drawer uses non-modal behavior when overlay is hidden', () => {
  assert.equal(shouldUseModalDrawer('enhanced'), false)
  assert.equal(shouldUseModalDrawer('default'), true)
  assert.equal(shouldUseModalDrawer('default', false), false)
})

test('drawer closes on overlay interaction unless it is being resized', () => {
  assert.equal(shouldCloseDrawerOnInteractOutside(true), false)
  assert.equal(shouldCloseDrawerOnInteractOutside(false), true)
})

test('drawer closes on outside click only when overlay is hidden', () => {
  assert.equal(shouldCloseDrawerOnOutsideClick(true, false, false), true)
  assert.equal(shouldCloseDrawerOnOutsideClick(true, true, false), false)
  assert.equal(shouldCloseDrawerOnOutsideClick(false, false, false), false)
  assert.equal(shouldCloseDrawerOnOutsideClick(true, false, true), false)
})

test('drawer ignores radix select portal content as an external click target', () => {
  const previousElement = globalThis.Element

  class PortalElement {
    closest(selector: string) {
      return selector.includes('[data-slot="select-content"]') ? this : null
    }
  }

  Object.defineProperty(globalThis, 'Element', {
    configurable: true,
    value: PortalElement,
  })

  try {
    assert.equal(
      shouldIgnoreDrawerOutsideClick(
        new PortalElement() as unknown as EventTarget
      ),
      true
    )
  } finally {
    Object.defineProperty(globalThis, 'Element', {
      configurable: true,
      value: previousElement,
    })
  }
})

test('resizable drawer width is clamped to the viewport', () => {
  assert.equal(getResizableDrawerWidth(700, 1200), 500)
  assert.equal(getResizableDrawerWidth(1000, 1200), 360)
  assert.equal(getResizableDrawerWidth(-100, 1200), 1200)
})

test('resized drawer width is preserved while closing', () => {
  assert.equal(
    getResizableDrawerWidthResetKey('enhanced', undefined, true),
    getResizableDrawerWidthResetKey('enhanced', undefined, false)
  )
})

test('resize handle exposes hover and active visual states', () => {
  const className = getResizeHandleClassName()

  assert.equal(className.includes('hover:after:bg-primary'), true)
  assert.equal(
    className.includes('data-[resizing=true]:after:bg-primary'),
    true
  )
})
