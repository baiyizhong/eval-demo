import { settingsNavigationItems } from '@/modules/settings/nav'

export function OrganizationSettingsNavigationTypeUsage() {
  return (
    <span>
      {settingsNavigationItems.map((item) => item.href).join(',')}
    </span>
  )
}
