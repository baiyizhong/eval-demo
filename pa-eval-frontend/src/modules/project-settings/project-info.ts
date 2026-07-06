import type { ProjectInfo } from './types'

export type ProjectListItem = {
  id: string
  name: string
  organizationId: string
  organizationName: string
  description: string | null
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

export type ProjectListResponse = {
  total: number
  datas: ProjectListItem[]
}

export function toProjectInfo(project: ProjectListItem): ProjectInfo {
  return {
    id: project.id,
    organizationName: project.organizationName,
    name: project.name,
    description: project.description ?? '',
    retentionDays: 90,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}
