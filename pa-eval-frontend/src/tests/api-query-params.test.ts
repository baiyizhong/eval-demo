import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('api client serializes array query params as repeated keys without brackets', () => {
  const source = readFileSync('src/api/request.ts', 'utf8')

  assert.match(source, /paramsSerializer:\s*{/)
  assert.match(source, /indexes:\s*null/)
})
