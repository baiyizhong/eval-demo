import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const drawerSource = readFileSync(
  'src/components/common/drawer/index.tsx',
  'utf8'
)
const drawerResizableSource = readFileSync(
  'src/components/common/drawer/drawer-resizable.ts',
  'utf8'
)

test('drawer uses outside click instead of early pointer or double click', () => {
  assert.doesNotMatch(drawerSource, /addEventListener\('dblclick'/)
  assert.doesNotMatch(drawerSource, /addEventListener\('pointerdown'/)
  assert.match(drawerSource, /addEventListener\('click'/)
  assert.match(drawerSource, /contentElement\?\.contains\(target\)/)
  assert.match(drawerSource, /shouldCloseDrawerOnOutsideClick/)
  assert.match(drawerSource, /shouldIgnoreDrawerOutsideClick/)
})

test('drawer ignores outside clicks on interactive elements that may reopen content', () => {
  assert.match(drawerResizableSource, /function shouldIgnoreDrawerOutsideClick/)
  assert.match(drawerResizableSource, /button/)
  assert.match(drawerResizableSource, /data-slot="table-row"/)
  assert.match(drawerResizableSource, /data-drawer-outside-click-ignore/)
})

test('drawer prevents scroll chaining from non-scrollable content', () => {
  assert.match(drawerSource, /addEventListener\('wheel'/)
  assert.match(drawerSource, /addEventListener\('touchmove'/)
  assert.match(drawerSource, /preventDefault\(\)/)
  assert.match(drawerSource, /shouldPreventDrawerScrollChaining/)
})

test('drawer scroll chaining helper allows inner scroll containers to consume scroll', () => {
  assert.match(
    drawerResizableSource,
    /function shouldPreventDrawerScrollChaining/
  )
  assert.match(drawerResizableSource, /scrollTop > 0/)
  assert.match(
    drawerResizableSource,
    /scrollTop \+ .*clientHeight < .*scrollHeight/
  )
})
