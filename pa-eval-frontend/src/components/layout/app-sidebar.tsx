import { useLayout } from '@/context/layout-provider'
import { useSidebarData } from '@/hooks/use-sidebar-data'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { NavGroup } from './nav-group'
import { ProjectSwitcher } from './project-switcher'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { data, isLoading } = useSidebarData()

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        {isLoading ? (
          <div className='flex items-center gap-2 px-4 py-2'>
            <Skeleton className='bg-sidebar-primary aspect-square size-8 rounded-lg' />
            <div className='flex flex-col gap-1'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-3 w-16' />
            </div>
          </div>
        ) : (
          <ProjectSwitcher projects={data?.teams ?? []} />
        )}
      </SidebarHeader>
      <SidebarContent>
        {isLoading ? (
          <div className='flex flex-col gap-4 px-4'>
            {[1, 2, 3].map((i) => (
              <div key={i} className='flex flex-col gap-2'>
                <Skeleton className='h-4 w-16' />
                <div className='flex flex-col gap-1'>
                  {[1, 2, 3].map((j) => (
                    <Skeleton key={j} className='h-8' />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          data?.menuGroups.map((props) => (
            <NavGroup key={props.title} {...props} />
          ))
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
