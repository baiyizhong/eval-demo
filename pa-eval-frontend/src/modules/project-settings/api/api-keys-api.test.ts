import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProjectApiKey,
  deleteProjectApiKey,
  listProjectApiKeys,
  updateProjectApiKey,
} from './api-keys-api.ts'

test('listProjectApiKeys sends pagination query', async () => {
  const captured: { request?: Record<string, unknown> } = {}
  const api = {
    async getProjectApiKeys(input: Record<string, unknown>) {
      captured.request = input
      return { total: 0, datas: [] }
    },
  }

  await listProjectApiKeys(api as never, 'project-1', { page: 2, pageSize: 20 })

  assert.deepEqual(captured.request, {
    path: { projectId: 'project-1' },
    query: { page: 2, pageSize: 20 },
  })
})

test('createProjectApiKey sends note body', async () => {
  const captured: { request?: Record<string, unknown> } = {}
  const api = {
    async createProjectApiKey(input: Record<string, unknown>) {
      captured.request = input
      return { id: 'key-1' }
    },
  }

  await createProjectApiKey(api as never, 'project-1', { note: 'Dify' })

  assert.deepEqual(captured.request, {
    path: { projectId: 'project-1' },
    body: { note: 'Dify' },
  })
})

test('updateProjectApiKey sends note body', async () => {
  const captured: { request?: Record<string, unknown> } = {}
  const api = {
    async updateProjectApiKey(input: Record<string, unknown>) {
      captured.request = input
      return { id: 'key-1' }
    },
  }

  await updateProjectApiKey(api as never, 'project-1', 'key-1', {
    note: 'Dify 更新',
  })

  assert.deepEqual(captured.request, {
    path: { projectId: 'project-1', keyId: 'key-1' },
    body: { note: 'Dify 更新' },
  })
})

test('deleteProjectApiKey sends path params', async () => {
  const captured: { request?: Record<string, unknown> } = {}
  const api = {
    async deleteProjectApiKey(input: Record<string, unknown>) {
      captured.request = input
      return { id: 'key-1' }
    },
  }

  await deleteProjectApiKey(api as never, 'project-1', 'key-1')

  assert.deepEqual(captured.request, {
    path: { projectId: 'project-1', keyId: 'key-1' },
  })
})
