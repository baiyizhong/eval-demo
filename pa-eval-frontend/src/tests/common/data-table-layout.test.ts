import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDataTableRootClassName } from '../../components/common/data-table/layout.ts'

test('data table removes horizontal gap when the advanced filter panel is collapsed', () => {
  assert.equal(
    getDataTableRootClassName({
      hasFilterPanel: true,
      isFilterPanelCollapsed: true,
    }).includes('gap-0'),
    true
  )
})

test('data table keeps default gap when the advanced filter panel is expanded', () => {
  assert.equal(
    getDataTableRootClassName({
      hasFilterPanel: true,
      isFilterPanelCollapsed: false,
    }).includes('gap-4'),
    true
  )
})
