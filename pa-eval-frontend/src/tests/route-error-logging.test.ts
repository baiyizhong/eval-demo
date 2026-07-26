import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildRouteErrorUrl,
  logRouteError,
} from '../lib/route-error-logging.ts'

test('buildRouteErrorUrl includes pathname, search and hash', () => {
  assert.equal(
    buildRouteErrorUrl({
      pathname: '/projects/p-1/settings',
      search: '?tab=members',
      hash: '#audit',
    }),
    '/projects/p-1/settings?tab=members#audit'
  )
})

test('logRouteError prints status and current route to the console', () => {
  const messages: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => messages.push(args)

  try {
    logRouteError({
      status: 403,
      route: '/projects/p-1/settings',
      reason: 'route guard denied access',
    })
  } finally {
    console.warn = originalWarn
  }

  assert.deepEqual(messages, [
    [
      '[RouteError] 403 route guard denied access:',
      '/projects/p-1/settings',
    ],
  ])
})
