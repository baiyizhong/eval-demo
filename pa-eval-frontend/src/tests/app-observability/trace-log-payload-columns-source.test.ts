import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('trace log table exposes input output and metadata columns', () => {
  const typeSource = readFileSync(
    resolve(process.cwd(), 'src/modules/app-observability/types.ts'),
    'utf8'
  )
  const columnsSource = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-log-columns.tsx'
    ),
    'utf8'
  )
  const viewSource = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/views/trace-logs.tsx'
    ),
    'utf8'
  )

  assert.match(typeSource, /input\?: string/)
  assert.match(typeSource, /output\?: string/)
  assert.match(typeSource, /metadata\?: Record<string, unknown>/)
  assert.match(columnsSource, /accessorKey: 'input'/)
  assert.match(columnsSource, /accessorKey: 'output'/)
  assert.match(columnsSource, /accessorKey: 'metadata'/)
  assert.match(columnsSource, /HoverPreviewCell/)
  assert.match(columnsSource, /@\/components\/common\/hover-preview-cell/)
  assert.match(columnsSource, /renderTracePayloadPreview\('Input'/)
  assert.match(columnsSource, /renderTracePayloadPreview\('Output'/)
  assert.match(columnsSource, /renderTracePayloadPreview\('Metadata'/)
  assert.match(columnsSource, /formatTracePayloadDetail/)
  assert.doesNotMatch(columnsSource, /@\/components\/ui\/hover-card/)
  assert.doesNotMatch(columnsSource, /title=\{text\}/)
  assert.match(viewSource, /input: 'Input'/)
  assert.match(viewSource, /output: 'Output'/)
  assert.match(viewSource, /metadata: 'Metadata'/)
})
