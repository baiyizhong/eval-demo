import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildGithubLoginUrl } from '../modules/login/login-url.ts'

test('buildGithubLoginUrl uses configured auth base url to keep oauth host stable', () => {
  assert.equal(
    buildGithubLoginUrl('/api', 'http://localhost:3010/api'),
    'http://localhost:3010/api/auth/github/login'
  )
})

test('buildGithubLoginUrl falls back to relative api base url', () => {
  assert.equal(buildGithubLoginUrl('/api', ''), '/api/auth/github/login')
  assert.equal(
    buildGithubLoginUrl('/api/', undefined),
    '/api/auth/github/login'
  )
})
