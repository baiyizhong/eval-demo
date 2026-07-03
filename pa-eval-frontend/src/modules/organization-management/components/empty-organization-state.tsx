import { useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreateOrganizationDrawer } from '@/modules/organization-management/components/create-organization-drawer'

export function EmptyOrganizationState() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center'>
        <div className='mb-4 rounded-full border bg-background p-3'>
          <Building2 className='size-5 text-muted-foreground' />
        </div>
        <div className='space-y-2'>
          <h4 className='text-base font-medium'>暂无组织</h4>
          <p className='text-muted-foreground max-w-sm text-sm'>
            创建一个组织后，即可管理组织信息和成员权限。
          </p>
        </div>
        <Button className='mt-6 gap-2' onClick={() => setOpen(true)}>
          <Plus className='size-4' />
          创建组织
        </Button>
      </div>
      <CreateOrganizationDrawer open={open} onOpenChange={setOpen} />
    </>
  )
}
