import React, { type MouseEvent } from 'react'
import { LogOut } from 'lucide-react'
import { ProfileDropdown } from '@/components/common/profile-dropdown'

void React

export const profileDropdownWithInjectedUser = (
  <ProfileDropdown
    user={{
      name: 'PANJIANJIAN065',
      email: 'panjianjian065@example.com',
      initials: 'P',
    }}
    actions={[
      {
        id: 'logout',
        label: '退出登录',
        icon: LogOut,
      },
    ]}
    onAction={(
      _action,
      _event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>
    ) => {}}
  />
)
