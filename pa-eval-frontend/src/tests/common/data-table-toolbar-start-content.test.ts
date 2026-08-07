import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const dataTableSource = readFileSync(
  'src/components/common/data-table/data-table.tsx',
  'utf8'
)
const toolbarSource = readFileSync(
  'src/components/common/data-table/toolbar.tsx',
  'utf8'
)

test('DataTable toolbar supports start content before the search controls', () => {
  assert.match(dataTableSource, /startContent\?: ReactNode/)
  assert.match(dataTableSource, /startContent=\{toolbar\?\.startContent\}/)
  assert.match(toolbarSource, /startContent\?: ReactNode/)

  const startContentIndex = toolbarSource.indexOf('{startContent}')
  const searchInputIndex = toolbarSource.indexOf('<Input')

  assert.ok(startContentIndex > -1)
  assert.ok(searchInputIndex > -1)
  assert.ok(startContentIndex < searchInputIndex)
})
