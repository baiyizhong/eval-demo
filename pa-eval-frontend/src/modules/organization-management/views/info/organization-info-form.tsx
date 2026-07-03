import { useEffect, useMemo } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Form,
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
  type Organization,
  type UpdateOrganizationPayload,
} from '@/modules/organization-management/data/schema'
import { useOrganizationStore } from '@/stores/organization.store'

const organizationInfoFormSchema = z.object({
  name: z.string().trim().min(2, '请输入至少 2 个字符的组织名称'),
  subsystem: z.string().trim().optional(),
  description: z.string().trim().optional(),
})

type OrganizationInfoFormValues = z.infer<typeof organizationInfoFormSchema>

type OrganizationInfoFormProps = {
  organization: Organization
}

export function OrganizationInfoForm({ organization }: OrganizationInfoFormProps) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const upsertOrganization = useOrganizationStore(
    (state) => state.upsertOrganization
  )

  const defaultValues = useMemo(
    () => ({
      name: organization.name,
      subsystem: organization.subsystem ?? '',
      description: organization.description ?? '',
    }),
    [organization.description, organization.name, organization.subsystem]
  )

  const form = useForm<OrganizationInfoFormValues>({
    resolver: zodResolver(organizationInfoFormSchema),
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const updateOrganizationMutation = useMutation({
    mutationFn: (payload: UpdateOrganizationPayload) =>
      $api.updateOrganization<Organization, UpdateOrganizationPayload>({
        path: { organizationId: organization.id },
        body: payload,
      }),
    onSuccess: async (nextOrganization) => {
      upsertOrganization(nextOrganization)
      await queryClient.invalidateQueries({ queryKey: organizationsQueryKey })
      toast.success('组织信息已保存')
      form.reset({
        name: nextOrganization.name,
        subsystem: nextOrganization.subsystem ?? '',
        description: nextOrganization.description ?? '',
      })
    },
  })

  const onSubmit = async (values: OrganizationInfoFormValues) => {
    await updateOrganizationMutation.mutateAsync({
      ...values,
      subsystem: values.subsystem || undefined,
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='flex flex-col gap-6'>
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
        <div className='flex justify-end'>
          <Button type='submit' disabled={updateOrganizationMutation.isPending}>
            <Save data-icon='inline-start' />
            保存
          </Button>
        </div>
      </form>
    </Form>
  )
}
