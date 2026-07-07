import { useId } from 'react'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createOrganizationPayloadSchema,
  type CreateOrganizationPayload,
  type Organization,
} from '@/modules/organization-management/data/schema'
import { organizationsQueryKey } from '@/modules/organization-management/hooks/use-organizations'
import { toast } from 'sonner'
import { useOrganizationStore } from '@/stores/organization.store'
import { useAPI } from '@/hooks/use-api'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'

const createOrganizationFormSchema = createOrganizationPayloadSchema.extend({
  name: z.string().trim().min(1, '请输入组织名称'),
  subsystem: z.string().trim().min(1, '请输入所属子系统'),
  description: z.string().trim().optional(),
})

type CreateOrganizationDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationDrawer({
  open,
  onOpenChange,
}: CreateOrganizationDrawerProps) {
  const formId = useId()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const upsertOrganization = useOrganizationStore(
    (state) => state.upsertOrganization
  )
  const setCurrentOrganizationId = useOrganizationStore(
    (state) => state.setCurrentOrganizationId
  )

  const createOrganizationMutation = useMutation({
    mutationFn: (payload: CreateOrganizationPayload) =>
      $api.createOrganization<Organization, CreateOrganizationPayload>({
        body: payload,
      }),
    onSuccess: async (organization) => {
      upsertOrganization(organization)
      setCurrentOrganizationId(organization.id)
      await queryClient.invalidateQueries({ queryKey: organizationsQueryKey })
      toast.success('组织创建成功')
      onOpenChange(false)
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
          createOrganizationMutation.reset()
        }
        onOpenChange(nextOpen)
      }}
      title='创建组织'
      confirmText='创建'
      confirmProps={{
        form: formId,
        type: 'submit',
        disabled: createOrganizationMutation.isPending,
      }}
      cancelProps={{ disabled: createOrganizationMutation.isPending }}
    >
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
    </Drawer>
  )
}
