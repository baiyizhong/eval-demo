import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getDisplayUserFromAccessToken,
  parseAuthTokenPayload,
  readAccessToken,
} from '../lib/auth-token.ts'

function createPaToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  )
  return `pa.${encoded}.signature`
}

test('readAccessToken parses legacy JSON cookie values', () => {
  assert.equal(readAccessToken('"legacy-token"'), 'legacy-token')
})

test('readAccessToken accepts plain token cookie values', () => {
  assert.equal(readAccessToken('pa.signed-token'), 'pa.signed-token')
})

test('readAccessToken returns empty string for missing cookie values', () => {
  assert.equal(readAccessToken(undefined), '')
})

test('parseAuthTokenPayload decodes PA Eval access token payload', () => {
  const token = createPaToken({
    provider: 'github',
    login: 'baiyizhong',
    langfuseUserId: 'user-1',
    email: 'baiyizhong@163.com',
    name: '白一中',
  })

  assert.deepEqual(parseAuthTokenPayload(token), {
    provider: 'github',
    login: 'baiyizhong',
    langfuseUserId: 'user-1',
    email: 'baiyizhong@163.com',
    name: '白一中',
  })
})

test('getDisplayUserFromAccessToken maps token payload to top navigation user', () => {
  const token = createPaToken({
    login: 'baiyizhong',
    email: 'baiyizhong@163.com',
  })

  assert.deepEqual(getDisplayUserFromAccessToken(token), {
    name: 'baiyizhong',
    email: 'baiyizhong@163.com',
    initials: 'B',
  })
})

test('getDisplayUserFromAccessToken returns null for invalid tokens', () => {
  assert.equal(getDisplayUserFromAccessToken('invalid-token'), null)
})
