import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  createProjectLlmConnection,
  deleteProjectLlmConnection,
  getProjectModelSettings,
  updateProjectLlmConnection,
  updateProjectDefaultModel,
} from '../modules/project-settings/api/model-settings-api.ts'

test('project model settings api helpers call model settings endpoints', async () => {
  const calls: unknown[] = []
  const api = {
    async getProjectModelSettings(input: unknown) {
      calls.push(['get', input])
      return {}
    },
    async updateProjectDefaultModel(input: unknown) {
      calls.push(['default', input])
      return {}
    },
    async createProjectLlmConnection(input: unknown) {
      calls.push(['connection', input])
      return {}
    },
    async updateProjectLlmConnection(input: unknown) {
      calls.push(['connection-update', input])
      return {}
    },
    async deleteProjectLlmConnection(input: unknown) {
      calls.push(['connection-delete', input])
      return {}
    },
  }

  await getProjectModelSettings(api as never, 'project-1')
  await updateProjectDefaultModel(api as never, 'project-1', {
    llmConnectionId: 'llm-1',
    model: 'gpt-4o',
    temperature: '0.1',
  })
  await createProjectLlmConnection(api as never, 'project-1', {
    provider: 'OpenAI',
    adapter: 'openai',
    secretKey: 'sk-real',
    baseUrl: 'https://api.openai.com/v1',
    customModels: ['gpt-4o'],
    withDefaultModels: true,
  })
  await updateProjectLlmConnection(api as never, 'project-1', 'llm-1', {
    provider: 'OpenAI',
    adapter: 'openai',
    secretKey: '',
    baseUrl: 'https://api.openai.com/v1',
    customModels: ['gpt-4o'],
    withDefaultModels: false,
  })
  await deleteProjectLlmConnection(api as never, 'project-1', 'llm-1')

  assert.deepEqual(calls, [
    ['get', { path: { projectId: 'project-1' } }],
    [
      'default',
      {
        path: { projectId: 'project-1' },
        body: {
          llmConnectionId: 'llm-1',
          model: 'gpt-4o',
          temperature: '0.1',
        },
      },
    ],
    [
      'connection',
      {
        path: { projectId: 'project-1' },
        body: {
          provider: 'OpenAI',
          adapter: 'openai',
          secretKey: 'sk-real',
          baseUrl: 'https://api.openai.com/v1',
          customModels: ['gpt-4o'],
          withDefaultModels: true,
        },
      },
    ],
    [
      'connection-update',
      {
        path: { projectId: 'project-1', connectionId: 'llm-1' },
        body: {
          provider: 'OpenAI',
          adapter: 'openai',
          secretKey: '',
          baseUrl: 'https://api.openai.com/v1',
          customModels: ['gpt-4o'],
          withDefaultModels: false,
        },
      },
    ],
    [
      'connection-delete',
      { path: { projectId: 'project-1', connectionId: 'llm-1' } },
    ],
  ])
})

test('project model settings helpers do not expose model definition crud', () => {
  const source = readFileSync(
    new URL('../modules/project-settings/api/model-settings-api.ts', import.meta.url),
    'utf8'
  )

  assert.equal(source.includes('createProjectModelDefinition'), false)
  assert.equal(source.includes('updateProjectModelDefinition'), false)
  assert.equal(source.includes('deleteProjectModelDefinition'), false)
})
