import type { AuthTokenPayload } from '../../../lib/auth-token.ts'
import type { OrganizationMember, OrganizationRole } from './schema.ts'

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

export function resolveCurrentOrganizationRole(
  members: OrganizationMember[],
  currentUser: Pick<AuthTokenPayload, 'langfuseUserId' | 'email'> | null
): OrganizationRole | null {
  if (!currentUser) {
    return null
  }

  const userId = currentUser.langfuseUserId?.trim()
  const email = normalizeEmail(currentUser.email)
  const activeMembers = members.filter((item) => item.status !== 'INVITED')
  const member =
    activeMembers.find((item) => Boolean(userId) && item.userId === userId) ??
    activeMembers.find((item) => normalizeEmail(item.email) === email)

  return member?.role ?? null
}
