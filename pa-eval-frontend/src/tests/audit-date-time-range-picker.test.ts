import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync('src/modules/system-pages/index.tsx', 'utf8')

test('audit page uses the common date time range picker', () => {
  assert.match(
    source,
    /import \{ DateTimeRangePicker \} from '@\/components\/common\/date-time\/date-time-range-picker'/
  )
  assert.match(source, /<DateTimeRangePicker[\s\S]*?showTime/)
  assert.match(source, /timeFormat='HH:mm'/)
  assert.match(source, /className='w-full flex-none sm:w-\[25rem\]'/)
  assert.doesNotMatch(source, /type='datetime-local'/)
})

test('audit filter bar has no horizontal padding and keeps refresh on the right', () => {
  assert.match(
    source,
    /<CardContent className='flex flex-wrap items-center gap-2 px-0 py-\d'>/
  )
  assert.match(source, /className='ml-auto h-9'[\s\S]*?<RefreshCw/)
})

test('audit date range defaults to the whole current day', () => {
  assert.match(source, /useState<string\[\]>\(getTodayAuditRange\)/)
  assert.match(
    source,
    /return \[\x60\$\{today\} 00:00\x60, \x60\$\{today\} 23:59\x60\]/
  )
})

test('audit date range remains compatible with ISO API query values', () => {
  assert.match(source, /createdFrom: toIsoDateTime\(createdRange\[0\]\)/)
  assert.match(source, /createdTo: toIsoDateTime\(createdRange\[1\]\)/)
  assert.match(source, /value\.replace\(' ', 'T'\)/)
})
