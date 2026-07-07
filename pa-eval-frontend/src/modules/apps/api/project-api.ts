import type { ApiMethod } from '@/api/types'

export type ProjectPayload = {
  name: string
  description: string
}

export type CreateProjectPayload = ProjectPayload & {
  organizationId: string
}

type ProjectApiClient = {
  createProject: ApiMethod
  updateProject: ApiMethod
  archiveProject: ApiMethod
  restoreProject: ApiMethod
}

export function createProject(
  api: ProjectApiClient,
  input: CreateProjectPayload
) {
  return api.createProject({
    body: input,
  })
}

export function updateProject(
  api: ProjectApiClient,
  projectId: string,
  input: ProjectPayload
) {
  return api.updateProject({
    path: { projectId },
    body: input,
  })
}

export function archiveProject(api: ProjectApiClient, projectId: string) {
  return api.archiveProject({
    path: { projectId },
  })
}

export function restoreProject(api: ProjectApiClient, projectId: string) {
  return api.restoreProject({
    path: { projectId },
  })
}
