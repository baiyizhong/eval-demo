import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildAuthLoginUrl } from '../modules/pa-eval-login/login-url.ts'

test('buildAuthLoginUrl uses configured auth base url to keep oauth host stable', () => {
  assert.equal(
    buildAuthLoginUrl('github', '/api', 'http://localhost:3010/api'),
    'http://localhost:3010/api/auth/github/login'
  )
})

test('buildAuthLoginUrl falls back to relative api base url', () => {
  assert.equal(
    buildAuthLoginUrl('github', '/api', ''),
    '/api/auth/github/login'
  )
  assert.equal(
    buildAuthLoginUrl('github', '/api/', undefined),
    '/api/auth/github/login'
  )
})

test('buildAuthLoginUrl supports enterprise sso login endpoint', () => {
  assert.equal(
    buildAuthLoginUrl('oidc', '/api', 'https://pa.example.com/api'),
    'https://pa.example.com/api/auth/oidc/login'
  )
})

test('development env does not force github oauth through inactive port 3010', () => {
  const developmentEnv = readFileSync('.env.development', 'utf8')

  assert.equal(
    /^VITE_AUTH_BASE_URL=http:\/\/localhost:3010\/api$/m.test(developmentEnv),
    false
  )
})
