import type { SidebarData, NavItem } from '../components/layout/types'

export type SidebarProject = {
  id: string
  name: string
  organizationId: string
  organizationName: string
  description: string | null
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

export type PaginatedSidebarProjects = {
  total: number
  datas: SidebarProject[]
}

export function buildSidebarDataFromProjects(
  projects: SidebarProject[],
  currentProjectId?: string
): SidebarData {
  const currentProject = currentProjectId
    ? projects.find((project) => project.id === currentProjectId)
    : undefined
  const firstProject =
    projects.find((project) => project.status === 'active') ?? projects[0]
  const projectId = currentProject?.id ?? firstProject?.id

  return {
    user: {
      name: 'PA Eval',
      email: '',
      avatar: '',
    },
    teams: [
      {
        name: '智能评测系统',
        logo: 'Command',
        plan: '评测管理平台',
      },
    ],
    menuGroups: [
      {
        title: '工作台',
        items: [
          {
            title: '数字面板',
            url: '/dashboard',
            icon: 'LayoutDashboard',
          },
          {
            title: '项目管理',
            url: '/apps',
            icon: 'Package',
            activeMatch: 'prefix',
          },
          {
            title: '组织管理',
            url: '/settings/info',
            icon: 'Users',
            activeMatch: 'prefix',
          },
          {
            title: '评测管理',
            url: '/tasks',
            icon: 'ListTodo',
            activeMatch: 'prefix',
          },
          ...buildEvaluationNavItems(projectId),
          ...buildProjectScopedNavItems(projectId),
        ],
      },
    ],
  }
}

function buildEvaluationNavItems(projectId: string | undefined): NavItem[] {
  if (!projectId) {
    return []
  }

  const encodedProjectId = encodeURIComponent(projectId)
  return [
    {
      title: '应用评测',
      url: `/projects/${encodedProjectId}/evaluation`,
      icon: 'Database',
      activeMatch: 'prefix',
    },
  ]
}

function buildProjectScopedNavItems(projectId: string | undefined): NavItem[] {
  if (!projectId) {
    return []
  }

  const encodedProjectId = encodeURIComponent(projectId)
  return [
    {
      title: '应用观测',
      url: `/projects/${encodedProjectId}/observability`,
      icon: 'Monitor',
      activeMatch: 'prefix',
    },
    {
      title: '项目设置',
      url: `/projects/${encodedProjectId}/settings/general`,
      icon: 'Settings',
      activeMatch: 'prefix',
    },
  ]
}
