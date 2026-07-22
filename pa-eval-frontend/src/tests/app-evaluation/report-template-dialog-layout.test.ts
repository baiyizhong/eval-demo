import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const dialogSource = readFileSync(
  'src/modules/app-evaluation/components/report-template-dialog.tsx',
  'utf8'
)

test('report template dialog passes remaining height to its scroll regions', () => {
  assert.match(
    dialogSource,
    /DialogContent className='flex max-h-\[86svh\] flex-col overflow-hidden sm:max-w-5xl'/
  )
  assert.match(dialogSource, /DialogHeader className='shrink-0'/)
  assert.match(
    dialogSource,
    /grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-\[260px_minmax\(0,1fr\)\]/
  )
})

test('report template panes own their vertical scrolling', () => {
  assert.match(
    dialogSource,
    /flex min-h-0 flex-col gap-2 overflow-y-auto border-r pr-3/
  )
  assert.match(dialogSource, /min-h-0 min-w-0 overflow-y-auto pr-1/)
})
