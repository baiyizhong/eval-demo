import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildProjectSwitchPath } from '../modules/project-context/project-context-utils.ts'

test('buildProjectSwitchPath opens trace logs for the next project', () => {
  assert.equal(
    buildProjectSwitchPath({
      nextProjectId: 'project-b',
    }),
    '/projects/project-b/observability/traces/logs'
  )
})

test('buildProjectSwitchPath opens trace logs when current path is outside project context', () => {
  assert.equal(
    buildProjectSwitchPath({
      nextProjectId: 'project-b',
    }),
    '/projects/project-b/observability/traces/logs'
  )
})

test('buildProjectSwitchPath encodes the next project id', () => {
  assert.equal(
    buildProjectSwitchPath({
      nextProjectId: 'project b',
    }),
    '/projects/project%20b/observability/traces/logs'
  )
})
