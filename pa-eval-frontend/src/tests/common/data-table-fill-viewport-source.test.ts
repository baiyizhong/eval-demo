import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dataTableSource = readFileSync(
  new URL('../../components/common/data-table/data-table.tsx', import.meta.url),
  'utf8'
)
const traceLogsSource = readFileSync(
  new URL(
    '../../modules/app-observability/views/trace-logs.tsx',
    import.meta.url
  ),
  'utf8'
)

test('DataTable fills its table viewport by default without stretching rows', () => {
  assert.match(
    dataTableSource,
    /overflow-hidden rounded-md border \[&_\[data-slot=table-container\]\]:h-full/
  )
  assert.doesNotMatch(dataTableSource, /fillTableViewport/)
  assert.doesNotMatch(dataTableSource, /<Table[^>]*h-full/)
})

test('Trace logs relies on the shared DataTable viewport layout', () => {
  assert.match(traceLogsSource, /<DataTable<TraceLogRow>/)
  assert.doesNotMatch(traceLogsSource, /fillTableViewport/)
})
