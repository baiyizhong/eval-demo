import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

test('pa-eval-login module owns login page and auth helpers', () => {
  assert.equal(existsSync('src/modules/pa-eval-login/index.tsx'), true)
  assert.equal(existsSync('src/modules/pa-eval-login/auth-api.ts'), true)
  assert.equal(existsSync('src/modules/pa-eval-login/session.ts'), true)
  assert.equal(
    existsSync('src/modules/pa-eval-login/use-auth-profile-menu.ts'),
    true
  )
  assert.equal(existsSync('src/modules/login/index.tsx'), false)
})

test('routes import Login from pa-eval-login instead of legacy login module', () => {
  const routesSource = readFileSync('src/routes/index.tsx', 'utf8')

  assert.match(routesSource, /@\/modules\/pa-eval-login/)
  assert.doesNotMatch(routesSource, /@\/modules\/login/)
})

test('session bootstrap is delegated to pa-eval-login', () => {
  const mainSource = readFileSync('src/main.tsx', 'utf8')

  assert.match(mainSource, /@\/modules\/pa-eval-login\/session/)
  assert.doesNotMatch(mainSource, /fetch\('\/api\/user\/session'\)/)
})

test('legacy auth profile hook is only a compatibility wrapper', () => {
  const hookSource = readFileSync('src/hooks/use-auth-profile-menu.ts', 'utf8')

  assert.match(hookSource, /@\/modules\/pa-eval-login\/use-auth-profile-menu/)
  assert.doesNotMatch(hookSource, /useAuthStore/)
  assert.doesNotMatch(hookSource, /useEnvironmentStore/)
})

test('enterprise password login API is isolated in pa-eval-login module', () => {
  const apiSource = readFileSync(
    'src/modules/pa-eval-login/auth-api.ts',
    'utf8'
  )

  assert.match(apiSource, /\/auth\/enterprise-password\/login/)
  assert.match(apiSource, /loginWithEnterprisePassword/)
})

test('login page does not invent fallback providers when backend returns none', () => {
  const loginSource = readFileSync('src/modules/pa-eval-login/index.tsx', 'utf8')

  assert.doesNotMatch(loginSource, /fallbackProviders/)
  assert.match(loginSource, /providers\.length === 0/)
})
