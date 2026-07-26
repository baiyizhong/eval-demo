import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const clipboardSource = readFileSync('src/lib/clipboard.ts', 'utf8')

test('clipboard helper falls back when Clipboard API is unavailable or rejected', () => {
  assert.match(clipboardSource, /navigator\.clipboard\?\.writeText/)
  assert.match(
    clipboardSource,
    /catch \{[\s\S]*copyTextWithExecCommand\(text\)/
  )
  assert.match(clipboardSource, /document\.execCommand\('copy'\)/)
  assert.match(clipboardSource, /if \(!copyTextWithExecCommand\(text\)\)/)
})

test('copy buttons use the shared clipboard helper', () => {
  const copySources = [
    'src/modules/project-settings/views/api-keys.tsx',
    'src/modules/app-observability/components/copyable-text.tsx',
    'src/modules/app-evaluation/components/session-trace-dialog.tsx',
    'src/components/common/MixEditor/index.tsx',
    'src/components/common/MixEditor/deps/table/ValueCell.tsx',
    'src/components/common/MixEditor/deps/ui/CodeJsonViewer.tsx',
    'src/components/common/MixEditor/deps/ui/table.tsx',
  ]

  for (const sourcePath of copySources) {
    const source = readFileSync(sourcePath, 'utf8')
    assert.match(source, /copyTextToClipboard/)
    assert.doesNotMatch(source, /navigator\.clipboard/)
  }
})
