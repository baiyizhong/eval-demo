import { useId, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { BaseForm } from '@/components/common/base-form'
import { FormDialog } from '@/components/common/form-dialog'
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
import { Label } from '@/components/ui/label'
import { useAPI } from '@/hooks/use-api'
import {
  createOrganizationApiKeyPayloadSchema,
  type CreateOrganizationApiKeyPayload,
  type OrganizationApiKey,
} from '@/modules/organization-management/data/schema'

const createApiKeyFormSchema = createOrganizationApiKeyPayloadSchema.extend({
  name: z.string().trim().min(1, '请输入 API Key 名称'),
})

type CreateApiKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
}

type CopyStatus = 'idle' | 'copied'

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

function SecretValueField({
  label,
  value,
}: {
  label: string
  value?: string
}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')

  const handleCopy = async () => {
    if (!value) {
      return
    }

    try {
      await copyText(value)
      setCopyStatus('copied')
      toast.success(`${label} 已复制`)
      window.setTimeout(() => setCopyStatus('idle'), 1600)
    } catch {
      toast.error(`${label} 复制失败，请稍后重试`)
    }
  }

  const CopyIcon = copyStatus === 'copied' ? Check : Copy
  const copyLabel = copyStatus === 'copied' ? `已复制 ${label}` : `复制 ${label}`

  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <div className='flex gap-2'>
        <Input value={value ?? '-'} readOnly disabled />
        <Button
          type='button'
          variant='outline'
          size='icon'
          className='shrink-0'
          onClick={handleCopy}
          disabled={!value}
          aria-label={copyLabel}
          title={copyLabel}
        >
          <CopyIcon className='size-4' />
        </Button>
      </div>
    </div>
  )
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  organizationId,
}: CreateApiKeyDialogProps) {
  const formId = useId()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [createdApiKey, setCreatedApiKey] = useState<OrganizationApiKey | null>(
    null
  )

  const createApiKeyMutation = useMutation({
    mutationFn: (payload: CreateOrganizationApiKeyPayload) =>
      $api.createOrganizationApiKey<
        OrganizationApiKey,
        CreateOrganizationApiKeyPayload
      >({
        path: { organizationId },
        body: payload,
      }),
    onSuccess: async (apiKey) => {
      setCreatedApiKey(apiKey)
      await queryClient.invalidateQueries({
        queryKey: ['organization-api-keys', organizationId],
      })
      toast.success('API Key 创建成功')
    },
  })

  const dialogTitle = createdApiKey ? '保存你的 API Key' : '创建 API Key'
  const dialogDescription = createdApiKey
    ? 'Secret Key 仅会展示这一次，请立即复制并妥善保管。'
    : '创建新的组织 API Key，用于服务端或自动化集成调用。'

  const dialogActions = useMemo(() => {
    if (createdApiKey) {
      return (
        <Button type='button' onClick={() => onOpenChange(false)}>
          我已保存
        </Button>
      )
    }

    return undefined
  }, [createdApiKey, onOpenChange])

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (createApiKeyMutation.isPending) {
        return
      }

      setCreatedApiKey(null)
      createApiKeyMutation.reset()
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (values: CreateOrganizationApiKeyPayload) => {
    await createApiKeyMutation.mutateAsync({
      name: values.name.trim(),
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      title={dialogTitle}
      description={dialogDescription}
      size='lg'
      showCancel={!createdApiKey}
      showConfirm={!createdApiKey}
      cancelText='取消'
      confirmText='创建'
      confirmProps={{
        form: formId,
        type: 'submit',
        disabled: createApiKeyMutation.isPending,
      }}
      cancelProps={{ disabled: createApiKeyMutation.isPending }}
      actions={dialogActions}
    >
      {createdApiKey ? (
        <div className='space-y-4 pb-2'>
          <Alert>
            <TriangleAlert className='size-4' />
            <AlertTitle>Secret Key 仅展示一次</AlertTitle>
            <AlertDescription>
              关闭弹窗后将无法再次查看原始 Secret Key，请立即复制到安全位置。
            </AlertDescription>
          </Alert>
          <div className='space-y-4 rounded-lg border bg-muted/20 p-4'>
            <SecretValueField label='Public Key' value={createdApiKey.publicKey} />
            <SecretValueField label='Secret Key' value={createdApiKey.secretKey} />
          </div>
        </div>
      ) : (
        <BaseForm
          key={open ? 'create-api-key-open' : 'create-api-key-closed'}
          id={formId}
          schema={createApiKeyFormSchema}
          defaultValues={{ name: '' }}
          onSubmit={handleSubmit}
          className='gap-4 overflow-visible p-0'
        >
          {(form) => (
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名称</FormLabel>
                  <FormControl>
                    <Input placeholder='例如：生产环境 Key' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </BaseForm>
      )}
    </FormDialog>
  )
}
