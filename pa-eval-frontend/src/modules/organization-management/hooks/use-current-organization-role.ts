import { useQuery } from '@tanstack/react-query'
import {
  type OrganizationMember,
  type OrganizationRole,
  type PaginatedResult,
} from '@/modules/organization-management/data/schema'
import { useAPI } from '@/hooks/use-api'

const MOCK_CURRENT_MEMBER_USER_ID = 'user-current'

type UseCurrentOrganizationRoleResult = {
  actorRole: OrganizationRole | null
  isPending: boolean
}

export function useCurrentOrganizationRole(
  organizationId: string | null
): UseCurrentOrganizationRoleResult {
  const $api = useAPI()
  const actorMembersQuery = useQuery({
    queryKey: ['organization-members-actor', organizationId, $api],
    enabled: Boolean(organizationId),
    queryFn: () => {
      if (!organizationId) {
        throw new Error('缺少组织 ID')
      }

      // mock 模式下缺少独立的“当前成员/组织权限”接口；真实后端应替换为专用权限上下文接口。
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

  const actorMember =
    actorMembersQuery.data?.datas.find(
      (member) => member.userId === MOCK_CURRENT_MEMBER_USER_ID
    ) ?? null

  return {
    actorRole: actorMember?.role ?? null,
    isPending: actorMembersQuery.isPending,
  }
}
