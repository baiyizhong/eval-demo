export type PermissionCode = string

export type PermissionScope =
  | { type: 'org'; orgId?: string }
  | { type: 'project'; projectId?: string }
  | { type: 'system' }

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

export interface UserSessionPayload {
  user: { id: number; name: string; email: string }
  superAdmin: boolean
  permissions?: PermissionCode[]
  orgs: OrgScope[]
}

export interface SessionState {
  user: UserSessionPayload['user'] | null
  superAdmin: boolean
  permissions: PermissionCode[]
  orgs: OrgScope[]
  currentOrgId: string | null
  currentProjectId: string | null
  setSession: (payload: UserSessionPayload) => void
  setCurrentOrgId: (orgId: string | null) => void
  setCurrentProjectId: (projectId: string | null) => void
  getPermissionsForOrg: (orgId?: string) => PermissionCode[]
  getPermissionsForProject: (projectId?: string) => PermissionCode[]
  getSystemPermissions: () => PermissionCode[]
  getPermissionsForScope: (scope?: PermissionScope) => PermissionCode[]
}
