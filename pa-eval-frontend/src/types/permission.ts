export type PermissionCode = string

export type PermissionScope =
  | { type: 'org'; orgId?: string; all?: boolean }
  | { type: 'project'; projectId?: string; all?: boolean }
  | { type: 'system' }

export interface PermissionAccessRule {
  /** 权限码，匹配任意一个即有权限 */
  access?: PermissionCode | PermissionCode[]
  /** 权限作用域 */
  scope?: PermissionScope
  /** 只要 scope 下存在任一权限即可通过 */
  anyPermission?: boolean
}

export interface OrgScope {
  id: string
  name: string
  role?: string | null
  permissions: PermissionCode[]
  projects: ProjectScope[]
}

export interface ProjectScope {
  id: string
  name: string
  role?: string | null
  permissions?: PermissionCode[]
}

export interface UserSessionPayload {
  user: { name: string; email: string }
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
  setCurrentProjectContext: (
    projectId: string | null,
    orgId?: string | null
  ) => void
  getPermissionsForOrg: (orgId?: string) => PermissionCode[]
  getPermissionsForProject: (projectId?: string) => PermissionCode[]
  getSystemPermissions: () => PermissionCode[]
  getPermissionsForScope: (scope?: PermissionScope) => PermissionCode[]
}
