import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('trace detail drawer uses MixEditor for mixed content display', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-detail-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(source, /import \{ MixEditor \}/)
  assert.doesNotMatch(source, /JsonEditorPanel/)
  assert.doesNotMatch(source, /MarkdownEditorPanel/)
})

test('trace detail drawer uses join annotation task wording and removes editing actions', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-detail-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(source, />\s*加入标注任务\s*</)
  assert.doesNotMatch(source, /新建标注任务/)
  assert.doesNotMatch(source, />\s*编辑\s*</)
  assert.doesNotMatch(source, />\s*保存\s*</)
  assert.doesNotMatch(source, />\s*取消\s*</)
  assert.doesNotMatch(source, /patchProjectTrace/)
  assert.doesNotMatch(source, /defaultMode='edit'/)
  assert.doesNotMatch(source, /当前 Trace 编辑内容/)
})

test('trace detail drawer keeps the right column adaptive after resizing trace chain', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-detail-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(source, /traceChainWidth/)
  assert.match(
    source,
    /'--trace-chain-current-column-width':[\s\S]+traceChainWidth/
  )
  assert.match(source, /onWidthChange=\{setTraceChainWidth\}/)
  assert.match(source, /className='min-w-0 flex h-full flex-col gap-3'/)
})

test('trace detail drawer fetches observation detail when a trace-chain node is clicked', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-detail-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(source, /selectedObservationId/)
  assert.match(source, /getProjectTraceObservation/)
  assert.match(source, /onNodeClick=\{\(node\) =>/)
  assert.match(source, /node\.id/)
})
