import { useState } from 'react'
import { CreateOrganizationDrawer } from '@/modules/organization-management/components/create-organization-drawer'
import { shouldShowCreateOrganization } from '@/modules/organization-management/data/create-permission'
import { Building2, Plus } from 'lucide-react'
import { useSessionStore } from '@/stores/session.store'
import { Button } from '@/components/ui/button'

export function EmptyOrganizationState() {
  const [open, setOpen] = useState(false)
  const superAdmin = useSessionStore((state) => state.superAdmin)
  const canCreateOrganization = shouldShowCreateOrganization(superAdmin)

  return (
    <>
      <div className='bg-muted/20 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center'>
        <div className='bg-background mb-4 rounded-full border p-3'>
          <Building2 className='text-muted-foreground size-5' />
        </div>
        <div className='flex flex-col gap-2'>
          <h4 className='text-base font-medium'>暂无组织</h4>
          <p className='text-muted-foreground max-w-sm text-sm'>
            {canCreateOrganization
              ? '创建一个组织后，即可管理组织信息和成员权限。'
              : '当前账号暂无可访问组织，请联系管理员开通权限。'}
          </p>
        </div>
        {canCreateOrganization ? (
          <Button className='mt-6' onClick={() => setOpen(true)}>
            <Plus data-icon='inline-start' />
            创建组织
          </Button>
        ) : null}
      </div>
      <CreateOrganizationDrawer open={open} onOpenChange={setOpen} />
    </>
  )
}
