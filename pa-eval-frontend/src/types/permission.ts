export type PermissionCode = string

export interface OrgScope {
  id: string
  name: string
  permissions: PermissionCode[]
  projects: ProjectScope[]
}

export interface ProjectScope {
  id: string
  name: string
  permissions?: PermissionCode[]
}

export interface UserPermissionPayload {
  user: { id: number; name: string }
  superAdmin: boolean
  orgs: OrgScope[]
}

export interface PermissionState {
  user: UserPermissionPayload['user'] | null
  superAdmin: boolean
  orgs: OrgScope[]
  setPermissions: (payload: UserPermissionPayload) => void
  getPermissionsForProject: (projectId: string) => PermissionCode[]
}
