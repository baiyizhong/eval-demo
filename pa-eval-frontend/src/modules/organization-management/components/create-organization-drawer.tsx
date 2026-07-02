import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAPI } from '@/hooks/use-api'
import { organizationsQueryKey } from '@/modules/organization-management/hooks/use-organizations'
import {
  createOrganizationPayloadSchema,
  type CreateOrganizationPayload,
  type Organization,
} from '@/modules/organization-management/data/schema'
import { useOrganizationStore } from '@/stores/organization.store'

const createOrganizationFormSchema = createOrganizationPayloadSchema.extend({
  name: z.string().trim().min(1, '请输入组织名称'),
  subsystem: z.string().trim().min(1, '请输入所属子系统'),
  description: z.string().trim().optional(),
})

type CreateOrganizationDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CreateOrganizationResponse = Organization & {
  secretKey?: string
}

function sanitizeOrganization(organization: CreateOrganizationResponse): Organization {
  const { secretKey: _secretKey, ...safeOrganization } = organization
  return safeOrganization
}

export function CreateOrganizationDrawer({
  open,
  onOpenChange,
}: CreateOrganizationDrawerProps) {
  const formId = useId()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [createdOrganization, setCreatedOrganization] =
    useState<CreateOrganizationResponse | null>(null)
  const upsertOrganization = useOrganizationStore(
    (state) => state.upsertOrganization
  )
  const setCurrentOrganizationId = useOrganizationStore(
    (state) => state.setCurrentOrganizationId
  )

  const createOrganizationMutation = useMutation({
    mutationFn: (payload: CreateOrganizationPayload) =>
      $api.createOrganization<
        CreateOrganizationResponse,
        CreateOrganizationPayload
      >({
        body: payload,
      }),
    onSuccess: async (organization) => {
      const safeOrganization = sanitizeOrganization(organization)
      upsertOrganization(safeOrganization)
      setCurrentOrganizationId(organization.id)
      setCreatedOrganization(organization)
      await queryClient.invalidateQueries({ queryKey: organizationsQueryKey })
      toast.success('组织创建成功')
    },
  })

  const handleSubmit = async (values: CreateOrganizationPayload) => {
    await createOrganizationMutation.mutateAsync(values)
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setCreatedOrganization(null)
          createOrganizationMutation.reset()
        }
        onOpenChange(nextOpen)
      }}
      title={createdOrganization ? '保存组织密钥' : '创建组织'}
      confirmText='创建'
      confirmProps={{
        form: formId,
        type: 'submit',
        disabled: createOrganizationMutation.isPending || Boolean(createdOrganization),
      }}
      cancelProps={{ disabled: createOrganizationMutation.isPending }}
      actions={
        createdOrganization ? (
          <Button type='button' size='sm' onClick={() => onOpenChange(false)}>
            我已保存
          </Button>
        ) : undefined
      }
    >
      {createdOrganization ? (
        <div className='flex flex-col gap-4 p-4'>
          <Alert>
            <TriangleAlert className='size-4' />
            <AlertTitle>Secret Key 仅展示一次</AlertTitle>
            <AlertDescription>
              关闭抽屉后将无法再次查看原始 Secret Key，请立即保存。
            </AlertDescription>
          </Alert>
          <div className='space-y-3 rounded-lg border bg-muted/20 p-4'>
            <div>
              <div className='text-sm font-medium'>Public Key</div>
              <div className='mt-1 break-all font-mono text-sm text-muted-foreground'>
                {createdOrganization.publicKey ?? '-'}
              </div>
            </div>
            <div>
              <div className='text-sm font-medium'>Secret Key</div>
              <div className='mt-1 break-all font-mono text-sm text-muted-foreground'>
                {createdOrganization.secretKey ?? '-'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <BaseForm
          id={formId}
          schema={createOrganizationFormSchema}
          defaultValues={{
            name: '',
            subsystem: '',
            description: '',
          }}
          onSubmit={handleSubmit}
          className='gap-4 overflow-visible'
        >
          {(form) => (
            <>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>组织名称</FormLabel>
                    <FormControl>
                      <Input placeholder='输入组织名称' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='subsystem'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>所属子系统</FormLabel>
                    <FormControl>
                      <Input placeholder='输入所属子系统' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>组织描述</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='输入组织描述'
                        className='min-h-28 resize-none'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </BaseForm>
      )}
    </Drawer>
  )
}
