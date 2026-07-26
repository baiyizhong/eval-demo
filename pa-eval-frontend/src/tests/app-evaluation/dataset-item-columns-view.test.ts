import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const columnsSource = readFileSync(
  'src/modules/app-evaluation/components/dataset-item-columns.tsx',
  'utf8'
)
const previewCellsSource = readFileSync(
  'src/modules/app-evaluation/components/dataset-item-preview-cells.tsx',
  'utf8'
)

test('dataset item json columns use formatted hover previews', () => {
  assert.match(columnsSource, /JsonPreviewCell/)
  assert.match(columnsSource, /Expected Output/)
  assert.match(columnsSource, /Metadata/)
  assert.match(previewCellsSource, /HoverPreviewCell/)
  assert.match(previewCellsSource, /@\/components\/common\/hover-preview-cell/)
  assert.match(previewCellsSource, /stringifyPretty/)
  assert.match(previewCellsSource, /JSON\.stringify\(value, null, 2\)/)
  assert.doesNotMatch(columnsSource, /JSON\.stringify\(row\.original\.input\)/)
  assert.doesNotMatch(
    columnsSource,
    /JSON\.stringify\(row\.original\.expectedOutput\)/
  )
  assert.doesNotMatch(
    columnsSource,
    /JSON\.stringify\(row\.original\.metadata\)/
  )
})

test('dataset item source column only shows trace id and supports opening trace detail', () => {
  assert.match(columnsSource, /SourcePreviewCell/)
  assert.match(columnsSource, /sourceTraceId/)
  assert.match(columnsSource, /onOpenTrace=\{onOpenTrace\}/)
  assert.match(previewCellsSource, /onOpenTrace\?: \(traceId: string\) => void/)
  assert.match(previewCellsSource, /max-w-\[320px\]/)
  assert.match(previewCellsSource, /break-all/)
  assert.doesNotMatch(previewCellsSource, /sourceObservationId/)
  assert.doesNotMatch(previewCellsSource, /Observation ID/)
  assert.doesNotMatch(columnsSource, /max-w-40/)
})
