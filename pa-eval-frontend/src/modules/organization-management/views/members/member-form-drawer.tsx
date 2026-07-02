import { useId, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { toast } from 'sonner'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
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
import { useAPI } from '@/hooks/use-api'
import { canAssignRole } from '@/modules/organization-management/data/permissions'
import {
  organizationRoleSchema,
  type CreateOrganizationMemberPayload,
  type OrganizationMember,
  type OrganizationRole,
  type UpdateOrganizationMemberPayload,
} from '@/modules/organization-management/data/schema'

const ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
}

const memberFormSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().trim().email('请输入正确的邮箱地址'),
  role: organizationRoleSchema,
})

type MemberFormValues = z.infer<typeof memberFormSchema>

type MemberFormDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  actorRole: OrganizationRole
  ownerCount: number
  member?: OrganizationMember | null
}

export function MemberFormDrawer({
  open,
  onOpenChange,
  organizationId,
  actorRole,
  ownerCount,
  member,
}: MemberFormDrawerProps) {
  const formId = useId()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const isEditMode = Boolean(member)

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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['organization-members', organizationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['organization-members-actor', organizationId],
        }),
      ])
      toast.success(isEditMode ? '成员角色已更新' : '成员已添加')
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
    await mutation.mutateAsync(values)
  }

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
        {(form) => (
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
                      {...field}
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
                      {...field}
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
        )}
      </BaseForm>
    </Drawer>
  )
}
