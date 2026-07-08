import { createElement } from 'react'
import {
  ActivitySquare,
  Bot,
  Home,
  KeyRound,
  Settings,
  Users,
} from 'lucide-react'

export function getProjectSettingsBasePath(projectId: string) {
  return `/projects/${projectId}/settings`
}

export function getProjectSettingsNavigationItems(projectId: string) {
  const basePath = getProjectSettingsBasePath(projectId)

  return [
    {
      title: '通用设置',
      href: `${basePath}/general`,
      icon: createElement(Settings, { size: 18 }),
    },
    {
      title: '评分指标',
      href: `${basePath}/score-configs`,
      icon: createElement(ActivitySquare, { size: 18 }),
    },
    {
      title: '项目成员',
      href: `${basePath}/members`,
      icon: createElement(Users, { size: 18 }),
    },
    {
      title: '模型设置',
      href: `${basePath}/models`,
      icon: createElement(Bot, { size: 18 }),
    },
    {
      title: 'API Keys',
      href: `${basePath}/api-keys`,
      icon: createElement(KeyRound, { size: 18 }),
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
