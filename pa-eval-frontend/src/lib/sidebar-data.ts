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
  const projectId = currentProjectId

  return {
    user: {
      name: 'PA Eval',
      email: '',
      avatar: '',
    },
    teams: projectId
      ? buildProjectSwitcherItems(projects, projectId)
      : buildPlatformSwitcherItems(),
    menuGroups: [
      {
        title: projectId ? '项目' : '工作台',
        items: projectId
          ? buildProjectNavItems(projectId)
          : buildPlatformNavItems(),
      },
    ],
  }
}

function buildPlatformSwitcherItems(): SidebarData['teams'] {
  return [
    {
      name: '智能评测系统',
      logo: 'Command',
      plan: '评测管理平台',
    },
  ]
}

function buildProjectSwitcherItems(
  projects: SidebarProject[],
  currentProjectId: string
): SidebarData['teams'] {
  const activeProjects = projects.filter(
    (project) => project.status === 'active'
  )
  const sortedProjects = activeProjects.length > 0 ? activeProjects : projects
  const currentProject = sortedProjects.find(
    (project) => project.id === currentProjectId
  )
  const orderedProjects = currentProject
    ? [
        currentProject,
        ...sortedProjects.filter((project) => project.id !== currentProject.id),
      ]
    : sortedProjects

  if (orderedProjects.length === 0) {
    return [
      {
        id: currentProjectId,
        name: currentProjectId,
        logo: 'Package',
        plan: '当前项目',
      },
    ]
  }

  return orderedProjects.map((project) => ({
    id: project.id,
    name: project.name,
    logo: 'Package',
    plan: project.organizationName,
  }))
}

function buildPlatformNavItems(): NavItem[] {
  return [
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
  ]
}

function buildProjectNavItems(projectId: string): NavItem[] {
  const encodedProjectId = encodeURIComponent(projectId)
  return [
    {
      title: '应用观测',
      url: `/projects/${encodedProjectId}/observability`,
      icon: 'Monitor',
      activeMatch: 'prefix',
    },
    {
      title: '应用评测',
      url: `/projects/${encodedProjectId}/evaluation`,
      icon: 'Database',
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
