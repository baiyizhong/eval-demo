import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
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
  type OrganizationRole,
  type UpdateOrganizationPayload,
} from '@/modules/organization-management/data/schema'
import { canManageMembers } from '@/modules/organization-management/data/permissions'
import { useOrganizationStore } from '@/stores/organization.store'

const organizationInfoFormSchema = z.object({
  subsystem: z.string().trim().min(1, '请输入所属子系统'),
  description: z.string().trim().optional(),
})

type OrganizationInfoFormValues = z.infer<typeof organizationInfoFormSchema>

type OrganizationInfoFormProps = {
  organization: Organization
  actorRole: OrganizationRole | null
}

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export function OrganizationInfoForm({
  organization,
  actorRole,
}: OrganizationInfoFormProps) {
  const [copied, setCopied] = useState(false)
  const $api = useAPI()
  const queryClient = useQueryClient()
  const upsertOrganization = useOrganizationStore(
    (state) => state.upsertOrganization
  )
  const canEditOrganization = actorRole ? canManageMembers(actorRole) : false

  const defaultValues = useMemo(
    () => ({
      subsystem: organization.subsystem ?? '',
      description: organization.description ?? '',
    }),
    [organization.description, organization.subsystem]
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
        subsystem: nextOrganization.subsystem ?? '',
        description: nextOrganization.description ?? '',
      })
    },
  })

  const handleCopyPublicKey = async () => {
    if (!organization.publicKey) {
      return
    }

    try {
      await copyText(organization.publicKey)
      setCopied(true)
      toast.success('Public Key 已复制')
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('复制失败，请稍后重试')
    }
  }

  const onSubmit = async (values: OrganizationInfoFormValues) => {
    if (!canEditOrganization) {
      toast.error('当前角色不能编辑组织信息')
      return
    }

    await updateOrganizationMutation.mutateAsync(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <FormItem>
          <FormLabel>组织名称</FormLabel>
          <FormControl>
            <Input value={organization.name} readOnly disabled />
          </FormControl>
        </FormItem>
        <FormField
          control={form.control}
          name='subsystem'
          render={({ field }) => (
            <FormItem>
              <FormLabel>所属子系统</FormLabel>
              <FormControl>
                <Input
                  placeholder='输入所属子系统'
                  disabled={!canEditOrganization}
                  {...field}
                />
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
                  disabled={!canEditOrganization}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormItem>
          <FormLabel>Public Key</FormLabel>
          <div className='flex gap-2'>
            <FormControl>
              <Input
                value={organization.publicKey ?? '暂无 Public Key'}
                readOnly
                disabled
              />
            </FormControl>
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='shrink-0'
              onClick={handleCopyPublicKey}
              disabled={!organization.publicKey}
              aria-label={copied ? '已复制 Public Key' : '复制 Public Key'}
              title={copied ? '已复制 Public Key' : '复制 Public Key'}
            >
              {copied ? <Check className='size-4' /> : <Copy className='size-4' />}
            </Button>
          </div>
        </FormItem>
        <FormItem>
          <FormLabel>Secret Key</FormLabel>
          <FormControl>
            <Input
              value={organization.secretKeyMasked ?? '暂无 Secret Key'}
              readOnly
              disabled
            />
          </FormControl>
        </FormItem>
        <div className='flex justify-end'>
          {canEditOrganization ? (
            <Button type='submit' disabled={updateOrganizationMutation.isPending}>
              保存
            </Button>
          ) : (
            <Button type='button' variant='outline' disabled>
              仅 Owner / Admin 可编辑
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}
