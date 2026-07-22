import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const formSource = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8'
)
const viewSource = readFileSync(
  'src/modules/app-evaluation/views/auto-evaluations.tsx',
  'utf8'
)

test('auto evaluation evaluator step keeps drawer content shrinkable', () => {
  assert.match(
    formSource,
    /flex min-h-full min-w-0 flex-1 flex-col gap-5 overflow-x-clip/
  )
  assert.match(formSource, /lg:grid-cols-\[minmax\(0,320px\)_minmax\(0,1fr\)\]/)
  assert.match(formSource, /md:grid-cols-\[minmax\(0,220px\)_minmax\(0,1fr\)\]/)
  assert.match(formSource, /SelectTrigger className='w-full min-w-0'/)
  assert.match(formSource, /min-w-0 truncate text-sm font-medium/)
})

test('auto evaluation drawer uses one vertical scroll container', () => {
  assert.doesNotMatch(formSource, /max-h-\[min\(560px,calc\(100vh-320px\)\)\]/)
  assert.doesNotMatch(formSource, /overflow-y-auto pr-1/)
  assert.doesNotMatch(
    viewSource,
    /contentProps=\{\{ className: 'overflow-y-auto' \}\}/
  )
})

test('auto evaluation actions stay at the bottom of the drawer body', () => {
  assert.match(viewSource, /className='flex min-h-full flex-col p-4'/)
  assert.match(formSource, /sticky bottom-0 -mx-4 -mb-4 mt-auto flex flex-wrap/)
})
