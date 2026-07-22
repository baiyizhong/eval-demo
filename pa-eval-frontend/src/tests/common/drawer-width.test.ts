import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DRAWER_WIDTHS,
  getDrawerWidth,
} from '../../components/common/drawer/drawer-width.ts'

test('drawer modes use responsive viewport widths with rem boundaries', () => {
  assert.equal(DRAWER_WIDTHS.default, 'clamp(30rem, 32vw, 36rem)')
  assert.equal(DRAWER_WIDTHS.enhanced, 'clamp(44rem, 50vw, 64rem)')
})

test('custom drawer width overrides the mode width', () => {
  assert.equal(
    getDrawerWidth('enhanced', 'clamp(64rem, 70vw, 96rem)'),
    'clamp(64rem, 70vw, 96rem)'
  )
})
