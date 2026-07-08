import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getDrawerBodyClassName,
  getDrawerContentClassName,
  getDrawerHeaderClassName,
} from '../../components/common/drawer/drawer-layout.ts'

test('drawer content prevents the whole sheet from scrolling', () => {
  const className = getDrawerContentClassName()

  assert.equal(className.includes('h-full'), true)
  assert.equal(className.includes('min-h-0'), true)
  assert.equal(className.includes('overflow-hidden'), true)
})

test('drawer header stays fixed above the scrollable body', () => {
  assert.equal(getDrawerHeaderClassName().includes('shrink-0'), true)
})

test('drawer body owns vertical scrolling', () => {
  const className = getDrawerBodyClassName()

  assert.equal(className.includes('min-h-0'), true)
  assert.equal(className.includes('flex-1'), true)
  assert.equal(className.includes('overflow-y-auto'), true)
})
