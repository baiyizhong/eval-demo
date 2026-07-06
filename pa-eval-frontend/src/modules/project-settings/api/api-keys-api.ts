import type { ApiMethod } from '@/api/types'
import type { DataTableListResponse } from '@/components/common/data-table'
import type { ProjectApiKey } from '../types'

type ProjectApiKeysApiClient = {
  getProjectApiKeys: ApiMethod
  createProjectApiKey: ApiMethod
  updateProjectApiKey: ApiMethod
  deleteProjectApiKey: ApiMethod
}

export type ProjectApiKeyInput = {
  note: string
}

export type ProjectApiKeysQuery = {
  page: number
  pageSize: number
}

export function listProjectApiKeys(
  api: ProjectApiKeysApiClient,
  projectId: string,
  query: ProjectApiKeysQuery
) {
  return api.getProjectApiKeys<DataTableListResponse<ProjectApiKey>>({
    path: { projectId },
    query,
  })
}

export function createProjectApiKey(
  api: ProjectApiKeysApiClient,
  projectId: string,
  input: ProjectApiKeyInput
) {
  return api.createProjectApiKey<ProjectApiKey>({
    path: { projectId },
    body: input,
  })
}

export function updateProjectApiKey(
  api: ProjectApiKeysApiClient,
  projectId: string,
  keyId: string,
  input: ProjectApiKeyInput
) {
  return api.updateProjectApiKey<ProjectApiKey>({
    path: { projectId, keyId },
    body: input,
  })
}

export function deleteProjectApiKey(
  api: ProjectApiKeysApiClient,
  projectId: string,
  keyId: string
) {
  return api.deleteProjectApiKey<{ id: string }>({
    path: { projectId, keyId },
  })
}
