import { Wrench } from 'lucide-react'
import { Outlet } from 'react-router'
import { Separator } from '@/components/ui/separator'
import { SidebarNav } from '@/components/common/sidebar-nav'
import { Main } from '@/components/layout/main'

const sidebarNavItems = [
  {
    title: '账户',
    href: '/settings/account',
    icon: <Wrench size={18} />,
  },
]

export function Settings() {
  return (
    <Main>
      <div className='space-y-0.5'>
        <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
          设置
        </h1>
        <p className='text-muted-foreground'>管理账户设置和偏好配置。</p>
      </div>
      <Separator className='my-4 lg:my-6' />
      <div className='flex flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12'>
        <aside className='top-0 lg:sticky lg:w-1/5'>
          <SidebarNav
            items={sidebarNavItems}
            defaultValue='/settings/account'
            selectPlaceholder='设置分组'
          />
        </aside>
        <div className='flex w-full overflow-y-hidden p-1'>
          <Outlet />
        </div>
      </div>
    </Main>
  )
}
