import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { useAPI } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import type { DataTableListResponse } from '@/components/common/data-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  buildProjectModuleSwitchPath,
  findProjectContext,
  type ProjectContextSummary,
} from './project-context-utils'

type ProjectContextSwitcherProps = {
  currentProjectId: string
  moduleSegment: string
  defaultSubPath: string
  queryKeyScope: string
  ariaLabel: string
}

export function ProjectContextSwitcher({
  currentProjectId,
  moduleSegment,
  defaultSubPath,
  queryKeyScope,
  ariaLabel,
}: ProjectContextSwitcherProps) {
  const $api = useAPI()
  const location = useLocation()
  const navigate = useNavigate()
  const projectQuery = useQuery({
    queryKey: ['project-context-switcher', queryKeyScope, $api],
    queryFn: () =>
      $api.getProjects<DataTableListResponse<ProjectContextSummary>>({
        query: {
          page: 1,
          pageSize: 200,
          status: 'active',
        },
      }),
  })
  const projects = projectQuery.data?.datas ?? []
  const currentProject = findProjectContext(projects, currentProjectId)
  const currentName = currentProject?.name ?? currentProjectId
  const currentOrganization = currentProject?.organizationName

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-9 max-w-[280px] justify-between gap-2 px-3'
          aria-label={ariaLabel}
        >
          <span className='flex min-w-0 flex-col items-start leading-tight'>
            <span className='max-w-[220px] truncate text-sm font-medium'>
              {currentName}
            </span>
            {currentOrganization ? (
              <span className='text-muted-foreground max-w-[220px] truncate text-[11px]'>
                {currentOrganization}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className='text-muted-foreground size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-80'>
        <DropdownMenuLabel className='text-muted-foreground text-xs'>
          切换项目
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((project) => {
          const active = project.id === currentProjectId

          return (
            <DropdownMenuItem
              key={project.id}
              className='items-start gap-3 py-2'
              onSelect={() => {
                if (!active) {
                  navigate(
                    buildProjectModuleSwitchPath({
                      pathname: location.pathname,
                      currentProjectId,
                      nextProjectId: project.id,
                      moduleSegment,
                      defaultSubPath,
                    })
                  )
                }
              }}
            >
              <Check
                className={cn(
                  'mt-0.5 size-4',
                  active ? 'opacity-100' : 'opacity-0'
                )}
              />
              <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className='truncate font-medium'>{project.name}</span>
                <span className='text-muted-foreground truncate text-xs'>
                  {project.organizationName}
                </span>
              </span>
            </DropdownMenuItem>
          )
        })}
        {!projects.length ? (
          <DropdownMenuItem disabled>暂无可切换项目</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
