import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getProjectEntryPath } from '../modules/apps/project-routes.ts'

test('getProjectEntryPath returns the project evaluation entry route', () => {
  assert.equal(
    getProjectEntryPath('project-1'),
    '/projects/project-1/evaluation'
  )
})

test('getProjectEntryPath encodes project ids for route safety', () => {
  assert.equal(
    getProjectEntryPath('project with space'),
    '/projects/project%20with%20space/evaluation'
  )
})
