import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('data table pagination displays the server total row count', () => {
  const paginationSource = readFileSync(
    new URL(
      '../../components/common/data-table/pagination.tsx',
      import.meta.url
    ),
    'utf8'
  )
  const tableSource = readFileSync(
    new URL(
      '../../components/common/data-table/data-table.tsx',
      import.meta.url
    ),
    'utf8'
  )

  assert.match(paginationSource, /totalRows: number/)
  assert.match(paginationSource, /共 \{totalRows\.toLocaleString\(\)\} 条/)
  assert.match(tableSource, /totalRows=\{total\}/)
})
