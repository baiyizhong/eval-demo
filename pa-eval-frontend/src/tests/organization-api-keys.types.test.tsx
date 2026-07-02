import { SettingsOrganizationApiKeys } from '@/modules/organization-management/views/api-keys'
import { CreateApiKeyDialog } from '@/modules/organization-management/views/api-keys/create-api-key-dialog'

export function OrganizationApiKeysTypeUsage() {
  return (
    <>
      <SettingsOrganizationApiKeys />
      <CreateApiKeyDialog open={false} onOpenChange={() => {}} organizationId='org_1' />
    </>
  )
}
