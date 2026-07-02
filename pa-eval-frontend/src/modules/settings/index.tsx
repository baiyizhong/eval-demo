import { Building2, KeyRound, Users } from 'lucide-react'
import { Outlet } from 'react-router'
import { Separator } from '@/components/ui/separator'
import { SidebarNav } from '@/components/common/sidebar-nav'
import { Main } from '@/components/layout/main'

const sidebarNavItems = [
  {
    title: '组织信息',
    href: '/settings/info',
    icon: <Building2 size={18} />,
  },
  {
    title: '组织人员',
    href: '/settings/members',
    icon: <Users size={18} />,
  },
  {
    title: 'API Key 管理',
    href: '/settings/api-keys',
    icon: <KeyRound size={18} />,
  },
]

export function Settings() {
  return (
    <Main>
      <div className='space-y-0.5'>
        <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
          组织管理
        </h1>
        <p className='text-muted-foreground'>
          管理当前组织的信息、成员和 API Key。
        </p>
      </div>
      <Separator className='my-4 lg:my-6' />
      <div className='flex flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12'>
        <aside className='top-0 lg:sticky lg:w-1/5'>
          <SidebarNav
            items={sidebarNavItems}
            defaultValue='/settings/info'
            selectPlaceholder='组织分组'
          />
        </aside>
        <div className='flex w-full overflow-y-hidden p-1'>
          <Outlet />
        </div>
      </div>
    </Main>
  )
}
