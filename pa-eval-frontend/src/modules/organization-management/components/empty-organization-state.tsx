import { useState } from 'react'
import { CreateOrganizationDrawer } from '@/modules/organization-management/components/create-organization-drawer'
import { Building2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyOrganizationState() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className='bg-muted/20 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center'>
        <div className='bg-background mb-4 rounded-full border p-3'>
          <Building2 className='text-muted-foreground size-5' />
        </div>
        <div className='flex flex-col gap-2'>
          <h4 className='text-base font-medium'>暂无组织</h4>
          <p className='text-muted-foreground max-w-sm text-sm'>
            创建一个组织后，即可管理组织信息和成员权限。
          </p>
        </div>
        <Button className='mt-6' onClick={() => setOpen(true)}>
          <Plus data-icon='inline-start' />
          创建组织
        </Button>
      </div>
      <CreateOrganizationDrawer open={open} onOpenChange={setOpen} />
    </>
  )
}
