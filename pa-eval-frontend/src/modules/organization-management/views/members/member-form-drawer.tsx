import { useEffect, useId, useMemo, useState } from 'react'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { canAssignRole } from '@/modules/organization-management/data/permissions'
import {
  buildOrganizationMemberEmail,
  organizationRoleSchema,
  type CreateOrganizationMemberPayload,
  type OrganizationMember,
  type OrganizationRole,
  type UpdateOrganizationMemberPayload,
} from '@/modules/organization-management/data/schema'
import { toast } from 'sonner'
import { useSessionStore } from '@/stores/session.store'
import { refreshSessionStore } from '@/lib/session-refresh'
import { useAPI } from '@/hooks/use-api'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'

const ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
  NONE: 'None',
}

const memberFormSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().trim().email('请输入正确的邮箱地址'),
  role: organizationRoleSchema,
})

type MemberFormValues = z.infer<typeof memberFormSchema>

const ORGANIZATION_MEMBER_EXISTS_MESSAGE =
  '用户已在该组织中，请使用设置组织角色调整权限'

type MemberEmailSettings = {
  defaultEmailDomain: string
}

type MemberFormDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  actorRole: OrganizationRole
  ownerCount: number
  member?: OrganizationMember | null
  existingMembers?: OrganizationMember[]
}

export function MemberFormDrawer({
  open,
  onOpenChange,
  organizationId,
  actorRole,
  ownerCount,
  member,
  existingMembers = [],
}: MemberFormDrawerProps) {
  const formId = useId()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const isEditMode = Boolean(member)
  const [formError, setFormError] = useState<string | null>(null)
  const emailSettingsQuery = useQuery({
    queryKey: ['organization-member-email-settings', $api],
    enabled: open && !isEditMode,
    queryFn: () =>
      $api.getOrganizationMemberEmailSettings<MemberEmailSettings>(),
    staleTime: Infinity,
  })
  const defaultEmailDomain = emailSettingsQuery.data?.defaultEmailDomain ?? ''

  const roleOptions = useMemo(() => {
    if (member?.role === 'OWNER' && ownerCount <= 1) {
      return ['OWNER'] as const
    }

    return organizationRoleSchema.options.filter((role) =>
      canAssignRole(actorRole, role)
    )
  }, [actorRole, member?.role, ownerCount])

  const mutation = useMutation({
    mutationFn: async (values: MemberFormValues) => {
      if (member) {
        return $api.updateOrganizationMember<
          OrganizationMember,
          UpdateOrganizationMemberPayload
        >({
          path: {
            organizationId,
            memberId: member.id,
          },
          body: {
            role: values.role,
          },
        })
      }

      return $api.createOrganizationMember<
        OrganizationMember,
        CreateOrganizationMemberPayload
      >({
        path: { organizationId },
        body: {
          name: values.name,
          email: values.email,
          role: values.role,
        },
      })
    },
    onError: (error) => {
      const message =
        error instanceof Error &&
        (error.message.includes('已经为该组织成员') ||
          error.message.includes('已在该组织中'))
          ? ORGANIZATION_MEMBER_EXISTS_MESSAGE
          : error instanceof Error
            ? error.message
            : '成员保存失败'
      setFormError(message)
    },
    onSuccess: async (memberResult) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['organization-members', organizationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['organization-members-actor', organizationId],
        }),
        refreshSessionStore($api),
      ])
      useSessionStore.getState().setCurrentOrgId(organizationId)
      toast.success(
        isEditMode
          ? '成员角色已更新'
          : memberResult.status === 'INVITED'
            ? '成员邀请已创建'
            : '成员已添加'
      )
      onOpenChange(false)
    },
  })

  const defaultValues = useMemo<MemberFormValues>(
    () => ({
      name: member?.name ?? '',
      email: member?.email ?? '',
      role: member?.role ?? roleOptions[0] ?? 'MEMBER',
    }),
    [member?.email, member?.name, member?.role, roleOptions]
  )

  const handleSubmit = async (values: MemberFormValues) => {
    setFormError(null)

    if (
      !isEditMode &&
      findExistingOrganizationMemberByEmail(existingMembers, values.email)
    ) {
      setFormError(ORGANIZATION_MEMBER_EXISTS_MESSAGE)
      return
    }

    await mutation.mutateAsync(values)
  }

  useEffect(() => {
    if (open) {
      setFormError(null)
    }
  }, [member?.id, open])

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? '编辑成员角色' : '添加成员'}
      confirmText={isEditMode ? '保存' : '添加'}
      confirmProps={{
        form: formId,
        type: 'submit',
        disabled: mutation.isPending,
      }}
      cancelProps={{ disabled: mutation.isPending }}
    >
      <BaseForm
        key={member?.id ?? 'create-member'}
        id={formId}
        schema={memberFormSchema}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        className='gap-4 overflow-visible'
      >
        {(form) => {
          return (
            <>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>姓名</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='输入成员姓名'
                        disabled={isEditMode || mutation.isPending}
                        name={field.name}
                        ref={field.ref}
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={(event) => {
                          field.onChange(event)
                          if (!isEditMode && defaultEmailDomain) {
                            form.setValue(
                              'email',
                              buildOrganizationMemberEmail(
                                event.target.value,
                                defaultEmailDomain
                              ),
                              {
                                shouldDirty: true,
                                shouldValidate: true,
                              }
                            )
                            setFormError(null)
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='输入成员邮箱'
                        disabled={isEditMode || mutation.isPending}
                        name={field.name}
                        ref={field.ref}
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={(event) => {
                          field.onChange(event)
                          setFormError(null)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='role'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>角色</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={mutation.isPending}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='选择组织角色' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roleOptions.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )
        }}
      </BaseForm>
      {formError ? (
        <div className='border-destructive/30 bg-destructive/5 text-destructive mx-4 mb-4 rounded-md border px-3 py-2 text-sm'>
          {formError}
        </div>
      ) : null}
    </Drawer>
  )
}

function findExistingOrganizationMemberByEmail(
  members: OrganizationMember[],
  email: string
) {
  const normalizedEmail = normalizeMemberEmail(email)

  return members.find(
    (member) => normalizeMemberEmail(member.email) === normalizedEmail
  )
}

function normalizeMemberEmail(email: string) {
  return email.trim().toLowerCase()
}
