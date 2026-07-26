import React from 'react'
import { Wrench } from 'lucide-react'
import { SidebarNav } from '@/components/common/sidebar-nav'

void React

const sidebarNavItems = [
  {
    title: '账户',
    href: '/settings/account',
    icon: <Wrench size={18} />,
  },
]

export const sidebarNavWithResponsiveOrientation = (
  <SidebarNav items={sidebarNavItems} orientation='responsive' />
)

export const sidebarNavWithHorizontalOrientation = (
  <SidebarNav items={sidebarNavItems} orientation='horizontal' />
)

export const sidebarNavWithVerticalOrientation = (
  <SidebarNav items={sidebarNavItems} orientation='vertical' />
)
