import { useLayout } from '@/context/layout-provider'
import { useSidebarData } from '@/hooks/use-sidebar-data'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
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
            <div className='bg-sidebar-primary flex aspect-square size-8 animate-pulse items-center justify-center rounded-lg' />
            <div className='flex flex-col gap-1'>
              <div className='bg-muted h-4 w-24 animate-pulse rounded' />
              <div className='bg-muted h-3 w-16 animate-pulse rounded' />
            </div>
          </div>
        ) : (
          <ProjectSwitcher projects={data?.teams ?? []} />
        )}
      </SidebarHeader>
      <SidebarContent>
        {isLoading ? (
          <div className='space-y-4 px-4'>
            {[1, 2, 3].map((i) => (
              <div key={i} className='space-y-2'>
                <div className='bg-muted h-4 w-16 animate-pulse rounded' />
                <div className='space-y-1'>
                  {[1, 2, 3].map((j) => (
                    <div
                      key={j}
                      className='bg-muted h-8 animate-pulse rounded'
                    />
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
