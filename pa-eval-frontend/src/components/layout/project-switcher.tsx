import { buildProjectSwitchPath } from '@/modules/project-context/project-context-utils'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useSessionStore } from '@/stores/session.store'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { resolveIcon } from './icon-map'

type ProjectSwitcherProps = {
  projects: {
    id?: string
    organizationId?: string
    name: string
    logo: string
    plan: string
  }[]
}

export function ProjectSwitcher({ projects }: ProjectSwitcherProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const setCurrentProjectContext = useSessionStore(
    (state) => state.setCurrentProjectContext
  )
  const activeProject = projects?.[0]

  if (!activeProject) {
    return null
  }

  const ProjectLogo = activeProject.logo
    ? resolveIcon(activeProject.logo)
    : null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
            >
              <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>
                {ProjectLogo ? <ProjectLogo className='size-4' /> : null}
              </div>
              <div className='grid flex-1 text-start text-sm leading-tight'>
                <span className='truncate font-semibold'>
                  {activeProject.name}
                </span>
                <span className='truncate text-xs'>{activeProject.plan}</span>
              </div>
              <ChevronsUpDown className='ms-auto' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            align='start'
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className='text-muted-foreground text-xs'>
              项目
            </DropdownMenuLabel>
            {projects.map((project, index) => {
              const ProjectItemLogo = project.logo
                ? resolveIcon(project.logo)
                : null
              const active = index === 0
              return (
                <DropdownMenuItem
                  key={project.id ?? project.name}
                  onSelect={() => {
                    if (!project.id || active) {
                      return
                    }

                    setCurrentProjectContext(project.id, project.organizationId)
                    navigate(
                      buildProjectSwitchPath({
                        nextProjectId: project.id,
                      })
                    )
                    setOpenMobile(false)
                  }}
                  className='gap-2 p-2'
                >
                  <div className='flex size-6 items-center justify-center rounded-sm border'>
                    {ProjectItemLogo ? (
                      <ProjectItemLogo className='size-4 shrink-0' />
                    ) : null}
                  </div>
                  <span className='flex min-w-0 flex-1 flex-col'>
                    <span className='truncate font-medium'>{project.name}</span>
                    <span className='text-muted-foreground truncate text-xs'>
                      {project.plan}
                    </span>
                  </span>
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      active ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
