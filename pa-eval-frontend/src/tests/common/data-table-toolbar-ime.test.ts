import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getSearchInputCommitValue } from '../../components/common/data-table/ime.ts'

test('data table search input does not commit text while typing', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'change',
      value: 'demo',
      isComposing: false,
    }),
    null
  )
})

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

test('data table search input does not commit finalized IME composition text before search submit', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'compositionend',
      value: '客服',
      isComposing: false,
    }),
    null
  )
})

test('data table search input commits text on Enter', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'keydown',
      key: 'Enter',
      value: '客服',
      isComposing: false,
    }),
    '客服'
  )
})

test('data table search input ignores non-Enter keydown', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'keydown',
      key: 'a',
      value: '客服',
      isComposing: false,
    }),
    null
  )
})

test('data table search input does not commit Enter while IME is composing', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'keydown',
      key: 'Enter',
      value: 'kef',
      isComposing: true,
    }),
    null
  )
})

test('data table search input commits text on search button click', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'submit',
      value: '客服',
      isComposing: false,
    }),
    '客服'
  )
})

test('data table search input commits empty text on clear', () => {
  assert.equal(
    getSearchInputCommitValue({
      eventType: 'clear',
      value: '客服',
      isComposing: false,
    }),
    ''
  )
})
