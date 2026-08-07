import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProjectDatasetDirectory,
  deleteProjectDatasetDirectory,
  listProjectDatasetDirectories,
  updateProjectDatasetDirectory,
  updateProjectDatasetDirectoryOrder,
} from '../../modules/app-evaluation/api/dataset-api.ts'

test('dataset directory wrappers call project scoped endpoints', async () => {
  const calls: unknown[] = []
  const api = {
    async getProjectDatasetDirectories(options: unknown) {
      calls.push(['list', options])
      return [{ id: 'dir-1' }]
    },
    async createProjectDatasetDirectory(options: unknown) {
      calls.push(['create', options])
      return { id: 'dir-2' }
    },
    async updateProjectDatasetDirectory(options: unknown) {
      calls.push(['update', options])
      return { id: 'dir-1' }
    },
    async deleteProjectDatasetDirectory(options: unknown) {
      calls.push(['delete', options])
      return { id: 'dir-1' }
    },
    async updateProjectDatasetDirectoryOrder(options: unknown) {
      calls.push(['order', options])
      return [{ id: 'dir-1' }]
    },
  }

  await listProjectDatasetDirectories(api as never, 'project-1')
  await createProjectDatasetDirectory(api as never, 'project-1', {
    name: '一级目录',
    parentId: null,
  })
  await updateProjectDatasetDirectory(api as never, 'project-1', 'dir-1', {
    name: '重命名目录',
  })
  await deleteProjectDatasetDirectory(api as never, 'project-1', 'dir-1')
  await updateProjectDatasetDirectoryOrder(api as never, 'project-1', [
    { id: 'dir-1', parentId: null, order: 0 },
  ])

  assert.deepEqual(calls, [
    ['list', { path: { projectId: 'project-1' } }],
    [
      'create',
      {
        path: { projectId: 'project-1' },
        body: { name: '一级目录', parentId: null },
      },
    ],
    [
      'update',
      {
        path: { projectId: 'project-1', directoryId: 'dir-1' },
        body: { name: '重命名目录' },
      },
    ],
    [
      'delete',
      { path: { projectId: 'project-1', directoryId: 'dir-1' } },
    ],
    [
      'order',
      {
        path: { projectId: 'project-1' },
        body: { directories: [{ id: 'dir-1', parentId: null, order: 0 }] },
      },
    ],
  ])
})
