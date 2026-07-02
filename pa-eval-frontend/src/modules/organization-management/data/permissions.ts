import type { OrganizationRole } from './schema'

type RemoveMemberResult = {
  allowed: boolean
  reason?: string
}

export function canManageMembers(role: OrganizationRole): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export function canAssignRole(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole
): boolean {
  if (actorRole === 'OWNER') {
    return true
  }

  if (actorRole === 'ADMIN') {
    return targetRole !== 'OWNER'
  }

  return false
}

export function canRemoveMember(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
  ownerCount: number
): RemoveMemberResult {
  if (!canManageMembers(actorRole)) {
    return {
      allowed: false,
      reason: '当前角色不能删除成员',
    }
  }

  if (actorRole === 'ADMIN' && targetRole === 'OWNER') {
    return {
      allowed: false,
      reason: 'Admin 不能删除 Owner',
    }
  }

  if (targetRole === 'OWNER' && ownerCount <= 1) {
    return {
      allowed: false,
      reason: '不能删除最后一个 Owner',
    }
  }

  return { allowed: true }
}
