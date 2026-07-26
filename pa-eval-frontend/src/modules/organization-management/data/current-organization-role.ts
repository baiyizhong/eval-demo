import type { OrganizationMember, OrganizationRole } from './schema.ts'

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

export function resolveCurrentOrganizationRole(
  members: OrganizationMember[],
  currentUser: { email?: string } | null
): OrganizationRole | null {
  if (!currentUser) {
    return null
  }

  const email = normalizeEmail(currentUser.email)
  const activeMembers = members.filter((item) => item.status !== 'INVITED')
  const member = activeMembers.find(
    (item) => normalizeEmail(item.email) === email
  )

  return member?.role ?? null
}
