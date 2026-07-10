import { useQuery } from '@tanstack/react-query'
import {
  type OrganizationMember,
  type OrganizationRole,
  type PaginatedResult,
} from '@/modules/organization-management/data/schema'
import { resolveCurrentOrganizationRole } from '@/modules/organization-management/data/current-organization-role'
import { useSessionStore } from '@/stores/session.store'
import { useAPI } from '@/hooks/use-api'

type UseCurrentOrganizationRoleResult = {
  actorRole: OrganizationRole | null
  isPending: boolean
}

export function useCurrentOrganizationRole(
  organizationId: string | null
): UseCurrentOrganizationRoleResult {
  const $api = useAPI()
  const currentUser = useSessionStore((state) => state.user)
  const actorMembersQuery = useQuery({
    queryKey: ['organization-members-actor', organizationId, currentUser?.email, $api],
    enabled: Boolean(organizationId),
    queryFn: () => {
      if (!organizationId) {
        throw new Error('缺少组织 ID')
      }

      return $api.getOrganizationMembers<PaginatedResult<OrganizationMember>>({
        path: { organizationId },
        query: {
          page: 1,
          pageSize: 10000,
          keyword: '',
        },
      })
    },
  })

  const actorRole = resolveCurrentOrganizationRole(
    actorMembersQuery.data?.datas ?? [],
    currentUser
  )

  return {
    actorRole,
    isPending: actorMembersQuery.isPending,
  }
}
