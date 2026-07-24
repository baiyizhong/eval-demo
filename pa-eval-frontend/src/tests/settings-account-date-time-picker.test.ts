import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/settings/views/account/account-form.tsx',
  'utf8'
)

test('account birth date uses DateTimePicker in date-only mode', () => {
  assert.match(source, /import \{ DateTimePicker \}/)
  assert.match(
    source,
    /<FormLabel>出生日期<\/FormLabel>[\s\S]*?<DateTimePicker/
  )
  assert.match(source, /showTime=\{false\}/)
  assert.match(
    source,
    /value=\{field\.value \? formatDate\(field\.value\) : ''\}/
  )
  assert.match(
    source,
    /field\.onChange\(parseDate\(nextValue\) \?\? undefined\)/
  )
  assert.doesNotMatch(source, /<DatePicker selected=\{field\.value\}/)
})
