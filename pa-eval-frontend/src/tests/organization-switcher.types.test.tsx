import React from 'react'
import { OrganizationSwitcher } from '@/modules/organization-management/components/organization-switcher'
import { TopNav } from '@/components/layout/top-nav'

void React

export function OrganizationSwitcherTypeUsage() {
  return (
    <TopNav
      brand={{ name: '智能评测系统', href: '/' }}
      items={[]}
      inlineActions={[]}
      rightSlot={<OrganizationSwitcher />}
    />
  )
}
