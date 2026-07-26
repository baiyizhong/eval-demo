import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  shouldShowProjectsEmpty,
  shouldShowProjectsLoading,
} from '../modules/apps/apps-state.ts'

test('apps page keeps empty state hidden while organization context is pending', () => {
  assert.equal(
    shouldShowProjectsEmpty({
      currentOrganizationId: null,
      organizationLoaded: false,
      organizationPending: true,
      projectCount: 0,
      projectError: false,
      projectFetched: false,
      projectPending: false,
    }),
    false
  )

  assert.equal(
    shouldShowProjectsLoading({
      currentOrganizationId: null,
      organizationLoaded: false,
      organizationPending: true,
      projectPending: false,
    }),
    true
  )
})

test('apps page shows empty state only after selected organization projects are fetched', () => {
  assert.equal(
    shouldShowProjectsEmpty({
      currentOrganizationId: 'org-1',
      organizationLoaded: true,
      organizationPending: false,
      projectCount: 0,
      projectError: false,
      projectFetched: true,
      projectPending: false,
    }),
    true
  )
})
