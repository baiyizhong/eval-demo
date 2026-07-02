import { create } from 'zustand'
import type { Organization } from '@/modules/organization-management/data/schema'

type OrganizationStoreState = {
  organizations: Organization[]
  currentOrganizationId: string | null
  isLoaded: boolean
  setOrganizations: (organizations: Organization[]) => void
  setCurrentOrganizationId: (organizationId: string | null) => void
  upsertOrganization: (organization: Organization) => void
  getCurrentOrganization: () => Organization | null
}

export const useOrganizationStore = create<OrganizationStoreState>(
  (set, get) => ({
    organizations: [],
    currentOrganizationId: null,
    isLoaded: false,
    setOrganizations: (organizations) =>
      set((state) => {
        const hasCurrent = organizations.some(
          (organization) => organization.id === state.currentOrganizationId
        )

        return {
          organizations,
          isLoaded: true,
          currentOrganizationId: hasCurrent
            ? state.currentOrganizationId
            : (organizations[0]?.id ?? null),
        }
      }),
    setCurrentOrganizationId: (currentOrganizationId) =>
      set({ currentOrganizationId }),
    upsertOrganization: (organization) =>
      set((state) => {
        const existingIndex = state.organizations.findIndex(
          (item) => item.id === organization.id
        )

        if (existingIndex === -1) {
          return {
            organizations: [...state.organizations, organization],
            isLoaded: true,
            currentOrganizationId:
              state.currentOrganizationId ?? organization.id,
          }
        }

        const organizations = [...state.organizations]
        organizations[existingIndex] = organization

        return {
          organizations,
          isLoaded: true,
        }
      }),
    getCurrentOrganization: () => {
      const { organizations, currentOrganizationId } = get()

      return (
        organizations.find(
          (organization) => organization.id === currentOrganizationId
        ) ?? null
      )
    },
  })
)
