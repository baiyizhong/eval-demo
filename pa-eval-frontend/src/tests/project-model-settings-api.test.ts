import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProjectLlmConnection,
  createProjectModelDefinition,
  deleteProjectLlmConnection,
  deleteProjectModelDefinition,
  getProjectModelSettings,
  updateProjectLlmConnection,
  updateProjectDefaultModel,
  updateProjectModelDefinition,
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
    async createProjectModelDefinition(input: unknown) {
      calls.push(['definition', input])
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
    async updateProjectModelDefinition(input: unknown) {
      calls.push(['definition-update', input])
      return {}
    },
    async deleteProjectModelDefinition(input: unknown) {
      calls.push(['definition-delete', input])
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
  await createProjectModelDefinition(api as never, 'project-1', {
    modelName: 'gpt-4o',
    matchPattern: 'gpt-4o*',
    unit: 'TOKENS',
    inputPrice: '2.5',
    outputPrice: '10',
    tokenizerId: 'openai',
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
  await updateProjectModelDefinition(api as never, 'project-1', 'model-1', {
    modelName: 'gpt-4o',
    matchPattern: 'gpt-4o*',
    unit: 'TOKENS',
    inputPrice: '2.5',
    outputPrice: '10',
    tokenizerId: 'openai',
  })
  await deleteProjectModelDefinition(api as never, 'project-1', 'model-1')

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
      'definition',
      {
        path: { projectId: 'project-1' },
        body: {
          modelName: 'gpt-4o',
          matchPattern: 'gpt-4o*',
          unit: 'TOKENS',
          inputPrice: '2.5',
          outputPrice: '10',
          tokenizerId: 'openai',
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
    [
      'definition-update',
      {
        path: { projectId: 'project-1', modelId: 'model-1' },
        body: {
          modelName: 'gpt-4o',
          matchPattern: 'gpt-4o*',
          unit: 'TOKENS',
          inputPrice: '2.5',
          outputPrice: '10',
          tokenizerId: 'openai',
        },
      },
    ],
    [
      'definition-delete',
      { path: { projectId: 'project-1', modelId: 'model-1' } },
    ],
  ])
})
