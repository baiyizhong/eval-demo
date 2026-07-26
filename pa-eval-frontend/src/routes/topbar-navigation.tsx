import { useMemo } from 'react'
import { OrganizationSwitcher } from '@/modules/organization-management/components/organization-switcher'
import { BookOpen, ShieldCheck } from 'lucide-react'
import { useAuthProfileMenu } from '@/hooks/use-auth-profile-menu'
import { type TopNavProps } from '@/components/layout/top-nav'
import { TopbarLayout } from '@/components/layout/topbar-layout'

const appsTopbarNavigation: TopNavProps = {
  brand: {
    name: '智能评测系统',
    initial: 'A',
    ariaLabel: '智能评测系统',
  },
  items: [
    {
      id: 'apps',
      label: '项目管理',
      href: '/apps',
      activeMatch: 'prefix',
      accessRules: [
        { scope: { type: 'org', all: true }, access: 'org:project:view' },
        { scope: { type: 'project', all: true }, anyPermission: true },
      ],
    },
    {
      id: 'org',
      label: '组织管理',
      href: '/settings',
      activeMatch: 'prefix',
      access: ['org:organization:view', 'org:member:view'],
      scope: { type: 'org' },
    },
    {
      id: 'audit',
      label: '操作审计',
      href: '/audit',
      activeMatch: 'prefix',
      access: 'system:audit:view',
      scope: { type: 'system' },
    },
    {
      id: 'backend',
      label: '后台管理',
      href: '/backend',
      activeMatch: 'prefix',
      superAccess: true,
    },
  ],
  inlineActions: [
    {
      id: 'help',
      label: '帮助文档',
      href: '/help',
      icon: BookOpen,
      title: '帮助文档',
      ariaLabel: '帮助文档',
    },
    {
      id: 'permissions',
      label: '申请权限',
      href: '/permissions',
      icon: ShieldCheck,
      title: '申请权限',
      ariaLabel: '申请权限',
    },
  ],
  rightSlot: <OrganizationSwitcher />,
}

export function AppsTopbarLayout() {
  const { user, menuActions, handleAuthMenuAction } = useAuthProfileMenu()
  const navigation = useMemo<TopNavProps>(
    () => ({
      ...appsTopbarNavigation,
      user,
      menuActions,
      onAction: handleAuthMenuAction,
    }),
    [handleAuthMenuAction, menuActions, user]
  )

  return <TopbarLayout navigation={navigation} />
}
