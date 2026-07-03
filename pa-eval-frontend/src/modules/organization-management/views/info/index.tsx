import { ContentSection } from '@/components/common/content-section'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyOrganizationState } from '@/modules/organization-management/components/empty-organization-state'
import { useOrganizations } from '@/modules/organization-management/hooks/use-organizations'
import { useOrganizationStore } from '@/stores/organization.store'
import { OrganizationInfoForm } from './organization-info-form'

function OrganizationInfoLoading() {
  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Skeleton className='h-4 w-24' />
        <Skeleton className='h-10 w-full' />
      </div>
      <div className='space-y-2'>
        <Skeleton className='h-4 w-24' />
        <Skeleton className='h-10 w-full' />
      </div>
      <div className='space-y-2'>
        <Skeleton className='h-4 w-24' />
        <Skeleton className='h-28 w-full' />
      </div>
    </div>
  )
}

export function SettingsOrganizationInfo() {
  const { organizations: storeOrganizations, data: organizationsData, isPending } =
    useOrganizations()
  const queryOrganizations = organizationsData?.datas
  const currentOrganizationId = useOrganizationStore(
    (state) => state.currentOrganizationId
  )
  const isLoaded = useOrganizationStore((state) => state.isLoaded)

  const effectiveOrganizations = queryOrganizations ?? storeOrganizations
  const effectiveCurrentOrganization =
    effectiveOrganizations.find(
      (organization) => organization.id === currentOrganizationId
    ) ?? effectiveOrganizations[0] ?? null
  const isLoading = isPending || (!isLoaded && !queryOrganizations)
  const isEmpty = !isLoading && effectiveOrganizations.length === 0

  return (
    <ContentSection
      title='组织信息'
      desc='维护当前组织名称、所属子系统和组织描述。'
    >
      {isLoading ? (
        <OrganizationInfoLoading />
      ) : isEmpty ? (
        <EmptyOrganizationState />
      ) : effectiveCurrentOrganization ? (
        <OrganizationInfoForm organization={effectiveCurrentOrganization} />
      ) : (
        <EmptyOrganizationState />
      )}
    </ContentSection>
  )
}

export { OrganizationInfoForm } from './organization-info-form'
