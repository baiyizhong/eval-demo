import { useState } from 'react'
import { Check, ChevronsUpDown, Plus, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { CreateOrganizationDrawer } from '@/modules/organization-management/components/create-organization-drawer'
import { useOrganizations } from '@/modules/organization-management/hooks/use-organizations'
import { useOrganizationStore } from '@/stores/organization.store'

export function OrganizationSwitcher() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { organizations, currentOrganization, isFetching } = useOrganizations()
  const setCurrentOrganizationId = useOrganizationStore(
    (state) => state.setCurrentOrganizationId
  )

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='w-52 justify-between gap-3'
            aria-label='切换组织'
          >
            <span className='flex min-w-0 items-center gap-2'>
              <Building2 className='size-4 text-gray-500' />
              <span className='truncate'>
                {currentOrganization?.name ?? '暂无组织'}
              </span>
            </span>
            <ChevronsUpDown className='size-4 text-gray-500' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-64'>
          <DropdownMenuLabel>组织</DropdownMenuLabel>
          {organizations.length > 0 ? (
            organizations.map((organization) => {
              const isActive = organization.id === currentOrganization?.id

              return (
                <DropdownMenuItem
                  key={organization.id}
                  className='gap-2'
                  onClick={() => setCurrentOrganizationId(organization.id)}
                >
                  <Check
                    className={cn(
                      'size-4 text-primary',
                      isActive ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className='flex min-w-0 flex-1 flex-col'>
                    <span className='truncate'>{organization.name}</span>
                    <span className='text-muted-foreground truncate text-xs'>
                      {organization.subsystem ?? '未配置子系统'}
                    </span>
                  </div>
                </DropdownMenuItem>
              )
            })
          ) : (
            <DropdownMenuItem disabled>
              {isFetching ? '加载中...' : '暂无组织'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className='gap-2'
            onClick={() => setDrawerOpen(true)}
          >
            <Plus className='size-4' />
            <span>创建组织</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}
