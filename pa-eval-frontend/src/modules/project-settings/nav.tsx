import {
  ActivitySquare,
  Bot,
  KeyRound,
  Settings,
  ShieldCheck,
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
      icon: <Settings size={18} />,
    },
    {
      title: '评分指标',
      href: `${basePath}/score-configs`,
      icon: <ActivitySquare size={18} />,
    },
    {
      title: '项目成员',
      href: `${basePath}/members`,
      icon: <Users size={18} />,
    },
    {
      title: '模型设置',
      href: `${basePath}/models`,
      icon: <Bot size={18} />,
    },
    {
      title: 'API Keys',
      href: `${basePath}/api-keys`,
      icon: <KeyRound size={18} />,
    },
  ]
}

export const projectSettingsNavigationItems = getProjectSettingsNavigationItems(
  'project_customer_agent'
)

export const projectSettingsPageLinks = [
  {
    title: '项目设置',
    href: '/projects/project_customer_agent/settings/general',
    isActive: true,
    disabled: false,
    icon: ShieldCheck,
  },
]
