import type { ApiMethod } from '../../../api/types'
import type { DataTableListResponse } from '../../../components/common/data-table'

export type SkillRecord = {
  name: string
  description: string
  source: 'BUILTIN' | 'PROJECT'
  variables: string[]
  updatedAt: string
}

export type SkillDetail = SkillRecord & {
  skillMd: string
  body: string
}

export type SkillApiClient = {
  getSkills: ApiMethod
  getSkill: ApiMethod
  uploadSkill: ApiMethod
  deleteSkill: ApiMethod
}

export function listSkills(api: SkillApiClient, projectId: string) {
  return api.getSkills<DataTableListResponse<SkillRecord>>({
    query: { page: 1, pageSize: 200 },
    path: { projectId },
  })
}

export function getSkillDetail(
  api: Pick<SkillApiClient, 'getSkill'>,
  projectId: string,
  skillName: string
) {
  return api.getSkill<SkillDetail>({
    path: { projectId, skillName },
  })
}

export function uploadSkill(
  api: SkillApiClient,
  projectId: string,
  name: string,
  file: File,
  overwrite: boolean
) {
  const formData = new FormData()
  formData.append('name', name)
  formData.append('overwrite', String(overwrite))
  formData.append('file', file)
  return api.uploadSkill<SkillRecord>({
    path: { projectId },
    body: formData,
  })
}

export function deleteSkill(
  api: SkillApiClient,
  projectId: string,
  skillName: string
) {
  return api.deleteSkill<{ name: string }>({
    path: { projectId, skillName },
  })
}
