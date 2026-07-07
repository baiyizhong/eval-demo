import type { ApiMethod } from '@/api/types'
import type { DefaultModel, LlmConnection, ModelDefinition } from '../types'

export type ProjectModelSettings = {
  defaultModel: DefaultModel
  connections: LlmConnection[]
  modelDefinitions: ModelDefinition[]
}

export type DefaultModelPayload = {
  llmConnectionId: string
  model: string
  temperature: string
}

export type LlmConnectionPayload = {
  provider: string
  adapter: string
  secretKey: string
  baseUrl: string
  customModels: string[]
  withDefaultModels: boolean
}

export type ModelDefinitionPayload = {
  modelName: string
  matchPattern: string
  unit: string
  inputPrice: string
  outputPrice: string
  tokenizerId: string
}

type ModelSettingsApiClient = {
  getProjectModelSettings: ApiMethod
  updateProjectDefaultModel: ApiMethod
  createProjectLlmConnection: ApiMethod
  updateProjectLlmConnection: ApiMethod
  deleteProjectLlmConnection: ApiMethod
  createProjectModelDefinition: ApiMethod
  updateProjectModelDefinition: ApiMethod
  deleteProjectModelDefinition: ApiMethod
}

export function getProjectModelSettings(
  api: ModelSettingsApiClient,
  projectId: string
) {
  return api.getProjectModelSettings<ProjectModelSettings>({
    path: { projectId },
  })
}

export function updateProjectDefaultModel(
  api: ModelSettingsApiClient,
  projectId: string,
  input: DefaultModelPayload
) {
  return api.updateProjectDefaultModel<DefaultModel>({
    path: { projectId },
    body: input,
  })
}

export function createProjectLlmConnection(
  api: ModelSettingsApiClient,
  projectId: string,
  input: LlmConnectionPayload
) {
  return api.createProjectLlmConnection<LlmConnection>({
    path: { projectId },
    body: input,
  })
}

export function updateProjectLlmConnection(
  api: ModelSettingsApiClient,
  projectId: string,
  connectionId: string,
  input: LlmConnectionPayload
) {
  return api.updateProjectLlmConnection<LlmConnection>({
    path: { projectId, connectionId },
    body: input,
  })
}

export function deleteProjectLlmConnection(
  api: ModelSettingsApiClient,
  projectId: string,
  connectionId: string
) {
  return api.deleteProjectLlmConnection<{ id: string }>({
    path: { projectId, connectionId },
  })
}

export function createProjectModelDefinition(
  api: ModelSettingsApiClient,
  projectId: string,
  input: ModelDefinitionPayload
) {
  return api.createProjectModelDefinition<ModelDefinition>({
    path: { projectId },
    body: input,
  })
}

export function updateProjectModelDefinition(
  api: ModelSettingsApiClient,
  projectId: string,
  modelId: string,
  input: ModelDefinitionPayload
) {
  return api.updateProjectModelDefinition<ModelDefinition>({
    path: { projectId, modelId },
    body: input,
  })
}

export function deleteProjectModelDefinition(
  api: ModelSettingsApiClient,
  projectId: string,
  modelId: string
) {
  return api.deleteProjectModelDefinition<{ id: string }>({
    path: { projectId, modelId },
  })
}
