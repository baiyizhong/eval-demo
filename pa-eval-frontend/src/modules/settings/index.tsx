import { Outlet } from 'react-router'
import { Separator } from '@/components/ui/separator'
import { SidebarNav } from '@/components/common/sidebar-nav'
import { Main } from '@/components/layout/main'
import { settingsNavigationItems } from './nav'

export function Settings() {
  return (
    <Main fixed>
      <div className='flex flex-col gap-0.5'>
        <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
          组织管理
        </h1>
        <p className='text-muted-foreground'>管理当前组织的信息和成员。</p>
      </div>
      <Separator className='my-4 lg:my-6' />
      <div className='flex flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:gap-12'>
        <aside className='top-0 lg:sticky lg:w-1/5'>
          <SidebarNav
            items={settingsNavigationItems}
            defaultValue='/settings/info'
            selectPlaceholder='组织分组'
          />
        </aside>
        <div className='flex w-full min-w-0 overflow-y-hidden p-1'>
          <Outlet />
        </div>
      </div>
    </Main>
  )
}
