import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildProjectSwitchPath } from '../modules/project-context/project-context-utils.ts'

test('buildProjectSwitchPath preserves the current project sub path', () => {
  assert.equal(
    buildProjectSwitchPath({
      pathname: '/projects/project-a/evaluation/datasets',
      currentProjectId: 'project-a',
      nextProjectId: 'project-b',
    }),
    '/projects/project-b/evaluation/datasets'
  )
})

test('buildProjectSwitchPath opens evaluation when current path is outside project context', () => {
  assert.equal(
    buildProjectSwitchPath({
      pathname: '/dashboard',
      currentProjectId: 'project-a',
      nextProjectId: 'project-b',
    }),
    '/projects/project-b/evaluation'
  )
})

test('buildProjectSwitchPath encodes the next project id', () => {
  assert.equal(
    buildProjectSwitchPath({
      pathname: '/projects/project%20a/evaluation',
      currentProjectId: 'project a',
      nextProjectId: 'project b',
    }),
    '/projects/project%20b/evaluation'
  )
})
