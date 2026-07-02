import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAPI } from '@/hooks/use-api'
import {
  type Organization,
  type PaginatedResult,
} from '@/modules/organization-management/data/schema'
import { useOrganizationStore } from '@/stores/organization.store'

export const organizationsQueryKey = ['organizations'] as const

export function useOrganizations() {
  const $api = useAPI()
  const organizations = useOrganizationStore((state) => state.organizations)
  const currentOrganizationId = useOrganizationStore(
    (state) => state.currentOrganizationId
  )
  const isLoaded = useOrganizationStore((state) => state.isLoaded)
  const setOrganizations = useOrganizationStore((state) => state.setOrganizations)

  const query = useQuery({
    queryKey: [...organizationsQueryKey, $api] as const,
    queryFn: () =>
      $api.getOrganizations<PaginatedResult<Organization>>({
        query: { page: 1, pageSize: 100 },
      }),
  })

  useEffect(() => {
    if (query.data) {
      setOrganizations(query.data.datas)
    }
  }, [query.data, setOrganizations])

  const currentOrganization = useMemo(
    () =>
      organizations.find(
        (organization) => organization.id === currentOrganizationId
      ) ?? null,
    [currentOrganizationId, organizations]
  )

  return {
    ...query,
    organizations,
    currentOrganization,
    hasOrganizations: organizations.length > 0,
    isLoaded,
  }
}
