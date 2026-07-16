import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('hover preview cell centralizes the default HoverCard preview pattern', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/common/hover-preview-cell.tsx'),
    'utf8'
  )

  assert.match(source, /export function HoverPreviewCell/)
  assert.match(source, /@\/components\/ui\/hover-card/)
  assert.match(source, /<HoverCard openDelay=\{250\} closeDelay=\{100\}>/)
  assert.match(source, /<HoverCardTrigger asChild>/)
  assert.match(source, /align='start'/)
  assert.match(source, /w-\[520px\] p-3/)
  assert.match(source, /max-h-80 overflow-auto/)
  assert.match(source, /font-mono text-xs leading-relaxed/)
  assert.match(source, /whitespace-pre-wrap/)
  assert.match(source, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/)
})

test('existing formatted hover preview cells use the shared component', () => {
  const files = [
    'src/modules/app-observability/components/trace-log-columns.tsx',
    'src/modules/app-evaluation/components/evaluation-report-badcase-table.tsx',
    'src/modules/app-evaluation/views/annotation-batch.tsx',
    'src/modules/app-evaluation/components/dataset-item-preview-cells.tsx',
  ]

  for (const file of files) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')

    assert.match(source, /HoverPreviewCell/, file)
    assert.match(source, /@\/components\/common\/hover-preview-cell/, file)
    assert.doesNotMatch(
      source,
      /<HoverCardContent align='start' className='w-\[520px\] p-3'>/,
      file
    )
  }
})
