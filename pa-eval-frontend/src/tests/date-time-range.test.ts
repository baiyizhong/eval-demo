import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  compareDateTimeValues,
  parseDate,
  parseDateTimeInput,
} from '../components/common/date-time/date-time-utils.ts'

const controlSource = readFileSync(
  'src/components/common/date-time/date-time-range-picker.tsx',
  'utf8'
)
const pickerSource = readFileSync(
  'src/components/common/date-time/date-time-picker.tsx',
  'utf8'
)

test('date range inputs support accessible clear actions', () => {
  assert.match(controlSource, /clearable = true/)
  assert.match(controlSource, /aria-label='清除开始时间'/)
  assert.match(controlSource, /aria-label='清除结束时间'/)
  assert.match(
    controlSource,
    /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/
  )
  assert.match(controlSource, /onChange\(\[remainingResult\.value, ''\]\)/)
  assert.match(controlSource, /onChange\(\['', remainingResult\.value\]\)/)
})

test('date time picker aligns input, clear and calendar behaviors', () => {
  assert.match(pickerSource, /export function DateTimePicker/)
  assert.match(pickerSource, /showTime = false/)
  assert.match(pickerSource, /parseDateTimeInput\(inputText, config, 'start'\)/)
  assert.match(pickerSource, /aria-label='清除日期时间'/)
  assert.match(pickerSource, /mode='single'/)
  assert.match(pickerSource, /type='time'/)
  assert.match(pickerSource, /<Label htmlFor=\{timeInputId\}/)
  assert.match(pickerSource, /时间选择/)
  assert.match(
    pickerSource,
    /className='w-32 \[&::-webkit-calendar-picker-indicator\]:ml-auto'/
  )
  assert.match(pickerSource, /locale=\{dateTimeCalendarLocale\}/)
  assert.match(pickerSource, /labels=\{dateTimeCalendarLabels\}/)
  assert.match(controlSource, /locale=\{dateTimeCalendarLocale\}/)
  assert.match(controlSource, /labels=\{dateTimeCalendarLabels\}/)
})

test('date inputs open their calendar while preserving input focus', () => {
  assert.match(pickerSource, /onFocus=\{openFromInput\}/)
  assert.match(controlSource, /onFocus=\{openFromInput\}/)
  assert.match(pickerSource, /onOpenChange=\{handleOpenChange\}/)
  assert.match(controlSource, /onOpenChange=\{handleOpenChange\}/)
  assert.match(pickerSource, /onOpenAutoFocus=\{\(event\) => \{/)
  assert.match(controlSource, /onOpenAutoFocus=\{\(event\) => \{/)
  assert.match(pickerSource, /openedFromInputRef\.current/)
  assert.match(controlSource, /openedFromInputRef\.current/)
  assert.match(pickerSource, /onInteractOutside=\{\(event\) => \{/)
  assert.match(controlSource, /onInteractOutside=\{\(event\) => \{/)
  assert.match(pickerSource, /anchorRef\.current\?\.contains\(event\.target/)
  assert.match(controlSource, /anchorRef\.current\?\.contains\(event\.target/)
})

test('formats supported date inputs to YYYY-MM-DD', () => {
  const config = { showTime: false }

  assert.deepEqual(parseDateTimeInput('20260723', config, 'start'), {
    status: 'valid',
    value: '2026-07-23',
  })
  assert.deepEqual(parseDateTimeInput('2026/7/3', config, 'end'), {
    status: 'valid',
    value: '2026-07-03',
  })
})

test('rejects dates that do not exist', () => {
  assert.equal(parseDate('2026-02-29'), undefined)
  assert.ok(parseDate('2024-02-29') instanceof Date)

  const result = parseDateTimeInput('2026-02-30', { showTime: false }, 'start')
  assert.equal(result.status, 'invalid')
})

test('formats date time and applies range side defaults', () => {
  const config = { showTime: true, timeFormat: 'HH:mm' as const }

  assert.deepEqual(parseDateTimeInput('202607231430', config, 'start'), {
    status: 'valid',
    value: '2026-07-23 14:30',
  })
  assert.deepEqual(parseDateTimeInput('2026-07-23', config, 'start'), {
    status: 'valid',
    value: '2026-07-23 00:00',
  })
  assert.deepEqual(parseDateTimeInput('2026-07-23', config, 'end'), {
    status: 'valid',
    value: '2026-07-23 23:59',
  })
})

test('validates time bounds and compares normalized values', () => {
  const config = { showTime: true, timeFormat: 'HH:mm:ss' as const }
  const invalid = parseDateTimeInput('2026-07-23 24:00:00', config, 'start')

  assert.equal(invalid.status, 'invalid')
  assert.ok(
    compareDateTimeValues(
      '2026-07-23 14:30:01',
      '2026-07-23 14:30:00',
      config
    ) > 0
  )
})
