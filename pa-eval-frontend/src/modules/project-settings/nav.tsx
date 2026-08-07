import { createElement, type ReactElement } from 'react'
import type { PermissionCode, PermissionScope } from '@/types/permission'
import {
  ActivitySquare,
  Bot,
  FolderTree,
  Home,
  KeyRound,
  Settings,
  Users,
} from 'lucide-react'

export type ProjectSettingsNavigationItem = {
  title: string
  href: string
  icon: ReactElement
  access: PermissionCode | PermissionCode[]
  scope: PermissionScope
}

export function getProjectSettingsBasePath(projectId: string) {
  return `/projects/${projectId}/settings`
}

export function getProjectSettingsNavigationItems(
  projectId: string
): ProjectSettingsNavigationItem[] {
  const basePath = getProjectSettingsBasePath(projectId)

  return [
    {
      title: '通用设置',
      href: `${basePath}/general`,
      icon: createElement(Settings, { size: 18 }),
      access: 'project:settings:view',
      scope: { type: 'project', projectId },
    },
    {
      title: '评分指标',
      href: `${basePath}/score-configs`,
      icon: createElement(ActivitySquare, { size: 18 }),
      access: 'project:score-config:view',
      scope: { type: 'project', projectId },
    },
    {
      title: '数据设置',
      href: `${basePath}/datasets`,
      icon: createElement(FolderTree, { size: 18 }),
      access: 'project:dataset:view',
      scope: { type: 'project', projectId },
    },
    {
      title: '项目成员',
      href: `${basePath}/members`,
      icon: createElement(Users, { size: 18 }),
      access: 'project:member:view',
      scope: { type: 'project', projectId },
    },
    {
      title: '模型设置',
      href: `${basePath}/models`,
      icon: createElement(Bot, { size: 18 }),
      access: 'project:model:view',
      scope: { type: 'project', projectId },
    },
    {
      title: 'API Keys',
      href: `${basePath}/api-keys`,
      icon: createElement(KeyRound, { size: 18 }),
      access: 'project:api-key:view',
      scope: { type: 'project', projectId },
    },
  ]
}

export function getProjectSettingsPageLinks(projectId: string) {
  void projectId

  return [
    {
      title: '项目管理',
      href: '/apps',
      isActive: true,
      disabled: false,
      icon: Home,
    },
  ]
}

export const projectSettingsNavigationItems = getProjectSettingsNavigationItems(
  'project_customer_agent'
)

export const projectSettingsPageLinks = getProjectSettingsPageLinks(
  'project_customer_agent'
)
