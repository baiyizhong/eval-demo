import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getSearchInputCommitValue } from '../../components/common/data-table/ime.ts'

test('data table search input does not commit intermediate IME composition text', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'change',
      value: 'kef',
      isComposing: true,
    }),
    null
  )
})

test('data table search input commits finalized IME composition text', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'compositionend',
      value: '客服',
      isComposing: false,
    }),
    '客服'
  )
})
