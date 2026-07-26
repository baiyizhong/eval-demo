import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const sourceRoot = new URL('../', import.meta.url)

const userInfoFiles = [
  'hooks/use-auth-profile-menu.ts',
  'modules/organization-management/hooks/use-current-organization-role.ts',
  'modules/project-settings/views/members.tsx',
]

test('user information consumers read from session store instead of auth token payloads', () => {
  const offenders = userInfoFiles.flatMap((filePath) => {
    const content = readFileSync(join(sourceRoot.pathname, filePath), 'utf8')
    const issues: string[] = []

    if (content.includes('parseAuthTokenPayload')) {
      issues.push(`${filePath}: parseAuthTokenPayload`)
    }

    if (content.includes('getDisplayUserFromAccessToken')) {
      issues.push(`${filePath}: getDisplayUserFromAccessToken`)
    }

    return issues
  })

  assert.deepEqual(offenders, [])
})

test('auth store does not expose a user profile field', () => {
  const authStore = readFileSync(
    join(sourceRoot.pathname, 'stores/auth-store.ts'),
    'utf8'
  )

  assert.equal(authStore.includes('user:'), false)
  assert.equal(authStore.includes('setUser'), false)
})
