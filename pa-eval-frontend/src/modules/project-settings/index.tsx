import { Navigate, Outlet, useParams } from 'react-router'
import { Separator } from '@/components/ui/separator'
import { Page } from '@/components/common/page'
import { SidebarNav } from '@/components/common/sidebar-nav'
import {
  getProjectSettingsBasePath,
  getProjectSettingsNavigationItems,
  getProjectSettingsPageLinks,
} from './nav'

const DEFAULT_PROJECT_ID = 'project_customer_agent'

export function ProjectSettings() {
  const { projectId = DEFAULT_PROJECT_ID } = useParams()
  const navigationItems = getProjectSettingsNavigationItems(projectId)
  const pageLinks = getProjectSettingsPageLinks(projectId)

  return (
    <Page links={pageLinks} fixed>
      <div className='flex flex-col gap-1'>
        <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
          项目设置
        </h1>
        <p className='text-muted-foreground'>
          管理当前项目的基础信息、评分指标、成员、模型和 API Keys。
        </p>
      </div>
      <Separator className='my-4 lg:my-6' />
      <div className='flex flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:gap-12'>
        <aside className='top-0 lg:sticky lg:w-1/5'>
          <SidebarNav
            items={navigationItems}
            defaultValue={`${getProjectSettingsBasePath(projectId)}/general`}
            selectPlaceholder='项目设置分组'
          />
        </aside>
        <div className='flex w-full overflow-y-hidden p-1'>
          <Outlet />
        </div>
      </div>
    </Page>
  )
}

export function ProjectSettingsIndexRedirect() {
  const { projectId = DEFAULT_PROJECT_ID } = useParams()

  return (
    <Navigate to={`${getProjectSettingsBasePath(projectId)}/general`} replace />
  )
}
