import React from 'react'
import { settingsNavigationItems } from '@/modules/settings/nav'

void React

export function OrganizationSettingsNavigationTypeUsage() {
  return (
    <span>{settingsNavigationItems.map((item) => item.href).join(',')}</span>
  )
}
