import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync('src/api/request.ts', 'utf8')

test('http error payload prefers backend business message', () => {
  assert.match(source, /let message = error\.message \|\| 'Request failed'/)
  assert.match(source, /message = msg/)
  assert.doesNotMatch(source, /message: error\.message \|\| 'Request failed'/)
})
