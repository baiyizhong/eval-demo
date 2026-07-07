import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  archiveProject,
  createProject,
  restoreProject,
  updateProject,
} from '../modules/apps/api/project-api.ts'

test('project mutations call real project management endpoints', async () => {
  const calls: unknown[] = []
  const api = {
    async createProject(input: unknown) {
      calls.push(['create', input])
      return { id: 'project-created' }
    },
    async updateProject(input: unknown) {
      calls.push(['update', input])
      return { id: 'project-1' }
    },
    async archiveProject(input: unknown) {
      calls.push(['archive', input])
      return { id: 'project-1' }
    },
    async restoreProject(input: unknown) {
      calls.push(['restore', input])
      return { id: 'project-1' }
    },
  }

  await createProject(api as never, {
    organizationId: 'org-1',
    name: 'AIOps',
    description: 'AIOps 评测项目',
  })
  await updateProject(api as never, 'project-1', {
    name: 'AIOps 更新',
    description: '更新描述',
  })
  await archiveProject(api as never, 'project-1')
  await restoreProject(api as never, 'project-1')

  assert.deepEqual(calls, [
    [
      'create',
      {
        body: {
          organizationId: 'org-1',
          name: 'AIOps',
          description: 'AIOps 评测项目',
        },
      },
    ],
    [
      'update',
      {
        path: { projectId: 'project-1' },
        body: {
          name: 'AIOps 更新',
          description: '更新描述',
        },
      },
    ],
    ['archive', { path: { projectId: 'project-1' } }],
    ['restore', { path: { projectId: 'project-1' } }],
  ])
})
