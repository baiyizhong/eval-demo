import type { Organization } from '@/modules/organization-management/data/schema'
import { create } from 'zustand'
import { useSessionStore } from '@/stores/session.store'

type OrganizationStoreState = {
  organizations: Organization[]
  currentOrganizationId: string | null
  isLoaded: boolean
  setOrganizations: (organizations: Organization[]) => void
  setCurrentOrganizationId: (organizationId: string | null) => void
  upsertOrganization: (organization: Organization) => void
  resetOrganizations: () => void
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
        const sessionOrgId = useSessionStore.getState().currentOrgId
        const hasSessionOrg = organizations.some(
          (organization) => organization.id === sessionOrgId
        )

        return {
          organizations,
          isLoaded: true,
          currentOrganizationId: hasCurrent
            ? state.currentOrganizationId
            : hasSessionOrg
              ? sessionOrgId
              : (organizations[0]?.id ?? null),
        }
      }),
    setCurrentOrganizationId: (currentOrganizationId) =>
      set({ currentOrganizationId }),
    resetOrganizations: () =>
      set({
        organizations: [],
        currentOrganizationId: null,
        isLoaded: false,
      }),
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
