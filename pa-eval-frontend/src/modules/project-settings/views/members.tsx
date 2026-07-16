import { useId, useMemo, useState } from 'react'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import type { ProjectUserRecord } from '@/modules/app-evaluation/types'
import { buildOrganizationMemberEmail } from '@/modules/organization-management/data/schema'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import type { ApiErrorPayload } from '@/api/types'
import { useSessionStore } from '@/stores/session.store'
import { refreshSessionStore } from '@/lib/session-refresh'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ContentSection } from '@/components/common/content-section'
import {
  DataTable,
  type DataTableListResponse,
  type DataTableQueryState,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Drawer } from '@/components/common/drawer'

type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | 'NONE'

const ROLE_LABELS: Record<ProjectRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
  NONE: 'None',
}

const ROLE_BADGE_VARIANTS: Record<
  ProjectRole,
  'default' | 'secondary' | 'outline'
> = {
  OWNER: 'default',
  ADMIN: 'secondary',
  MEMBER: 'outline',
  VIEWER: 'outline',
  NONE: 'outline',
}

const ROLE_LEVELS: Record<ProjectRole, number> = {
  NONE: 0,
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
}

const STATUS_LABELS: Record<
  NonNullable<ProjectUserRecord['status']>,
  string
> = {
  active: '已加入',
  pending: '待邀请',
}

const PROJECT_ROLE_OPTIONS = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
  'NONE',
] as const satisfies readonly ProjectRole[]
const CREATE_PROJECT_ROLE_OPTIONS = PROJECT_ROLE_OPTIONS.filter(
  (role) => role !== 'NONE'
)

const projectMemberFormSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().trim().email('请输入正确的邮箱地址'),
  role: z.enum(PROJECT_ROLE_OPTIONS),
})

type ProjectMemberFormValues = z.infer<typeof projectMemberFormSchema>

const PROJECT_MEMBER_EXISTS_MESSAGE =
  '用户已在该项目中，请使用设置项目角色调整权限'

type MemberEmailSettings = {
  defaultEmailDomain: string
}

function normalizeRole(role?: string | null): ProjectRole {
  if (
    role === 'OWNER' ||
    role === 'ADMIN' ||
    role === 'MEMBER' ||
    role === 'VIEWER' ||
    role === 'NONE'
  ) {
    return role
  }

  return 'NONE'
}

function roleLevel(role?: string | null) {
  return ROLE_LEVELS[normalizeRole(role)]
}

function maxRole(...roles: Array<string | null | undefined>): ProjectRole {
  return roles.reduce<ProjectRole>((highest, role) => {
    const current = normalizeRole(role)
    return ROLE_LEVELS[current] > ROLE_LEVELS[highest] ? current : highest
  }, 'NONE')
}

function formatRole(role?: string | null) {
  return ROLE_LABELS[normalizeRole(role)]
}

function getEffectiveRole(member: ProjectUserRecord): ProjectRole {
  return maxRole(member.role, member.organizationRole, member.projectRole)
}

function normalizeEmail(value?: string) {
  return value?.trim().toLowerCase() ?? ''
}

function matchesKeyword(member: ProjectUserRecord, keyword: string) {
  if (!keyword) {
    return true
  }

  const needle = keyword.toLowerCase()
  return [
    member.name,
    member.email,
    getEffectiveRole(member),
    member.organizationRole,
    member.projectRole,
    member.status ? STATUS_LABELS[member.status] : undefined,
  ].some((value) => value?.toLowerCase().includes(needle))
}

function getApiErrorMessage(error: unknown) {
  if (!error) return ''
  const payload = error as Partial<ApiErrorPayload>
  return payload.message || '操作失败，请稍后重试'
}

function getProjectMemberFormErrorMessage(error: unknown) {
  const message = getApiErrorMessage(error)

  if (
    message.includes('已经为该项目成员') ||
    message.includes('已在该项目中')
  ) {
    return PROJECT_MEMBER_EXISTS_MESSAGE
  }

  return message || '项目成员保存失败'
}

function getRoleFilter(state: DataTableQueryState, field: string) {
  const role = state.filters[field]

  if (!Array.isArray(role)) {
    return []
  }

  return role
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizeRole(item))
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return {
    total: items.length,
    datas: items.slice(start, start + pageSize),
  }
}

function resolveActorRole(
  members: ProjectUserRecord[],
  currentUser: { email?: string } | null
): ProjectRole {
  const email = normalizeEmail(currentUser?.email)
  const actor = members.find((member) => normalizeEmail(member.email) === email)

  return actor ? getEffectiveRole(actor) : 'NONE'
}

function canManageProjectMembers(actorRole: ProjectRole) {
  return roleLevel(actorRole) >= ROLE_LEVELS.ADMIN
}

function canOperateMember(actorRole: ProjectRole, member: ProjectUserRecord) {
  return (
    member.status !== 'pending' &&
    canManageProjectMembers(actorRole) &&
    roleLevel(getEffectiveRole(member)) <= roleLevel(actorRole)
  )
}

function getProjectRoleOptions(actorRole: ProjectRole, includeNone: boolean) {
  return PROJECT_ROLE_OPTIONS.filter((role) => {
    if (role === 'NONE') {
      return includeNone
    }

    return roleLevel(role) <= roleLevel(actorRole)
  })
}

export function ProjectMembersSettings() {
  const { projectId = '' } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditProjectMembers = can('project:member:edit')
  const currentUser = useSessionStore((state) => state.user)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<ProjectUserRecord | null>(
    null
  )
  const [removingMember, setRemovingMember] =
    useState<ProjectUserRecord | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const membersMetaQuery = useQuery({
    queryKey: ['project-settings-members-meta', $api, projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      $api.getProjectMembers<ProjectUserRecord[]>({
        path: { projectId },
      }),
  })
  const actorRole = resolveActorRole(membersMetaQuery.data ?? [], currentUser)
  const canManage = canEditProjectMembers && canManageProjectMembers(actorRole)

  const invalidateMembers = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['project-settings-members', $api, projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['project-settings-members-meta', $api, projectId],
      }),
    ])

  const refreshProjectSession = async () => {
    await refreshSessionStore($api)
    if (projectId) {
      useSessionStore.getState().setCurrentProjectId(projectId)
    }
  }

  const createMutation = useMutation({
    mutationFn: (input: { name?: string; email: string; role: ProjectRole }) =>
      $api.createProjectMember<ProjectUserRecord>({
        path: { projectId },
        body: input,
      }),
    onSuccess: async () => {
      await Promise.all([invalidateMembers(), refreshProjectSession()])
      setFormError(null)
      setDrawerOpen(false)
      toast.success('项目成员已添加')
    },
    onError: (error) => {
      setFormError(getProjectMemberFormErrorMessage(error))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: { memberId: string; role: ProjectRole }) =>
      $api.updateProjectMember<ProjectUserRecord>({
        path: { projectId, memberId: input.memberId },
        body: { role: input.role },
      }),
    onSuccess: async (_data, variables) => {
      await Promise.all([invalidateMembers(), refreshProjectSession()])
      setFormError(null)
      setDrawerOpen(false)
      setEditingMember(null)
      toast.success(
        variables.role === 'NONE' ? '项目角色覆盖已移除' : '项目成员角色已更新'
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (memberId: string) =>
      $api.deleteProjectMember<{ id: string }>({
        path: { projectId, memberId },
      }),
    onSuccess: async () => {
      await Promise.all([invalidateMembers(), refreshProjectSession()])
      setRemovingMember(null)
      toast.success('项目角色覆盖已移除')
    },
  })

  const roleToolbarFilters = useMemo<DataTableToolbarFilter[]>(
    () => [
      {
        fieldId: 'effectiveRole',
        title: '有效角色',
        options: CREATE_PROJECT_ROLE_OPTIONS.map((role) => ({
          value: role,
          label: ROLE_LABELS[role],
        })),
      },
      {
        fieldId: 'projectRole',
        title: '项目角色',
        options: PROJECT_ROLE_OPTIONS.map((role) => ({
          value: role,
          label: ROLE_LABELS[role],
        })),
      },
    ],
    []
  )

  const columns = useMemo<ColumnDef<ProjectUserRecord>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '成员',
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col gap-1'>
            <span className='max-w-40 truncate font-medium'>
              {row.original.name || '-'}
            </span>
            <span className='text-muted-foreground max-w-56 truncate text-xs'>
              {row.original.email || '-'}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => {
          const status = row.original.status ?? 'active'
          return (
            <Badge variant={status === 'pending' ? 'outline' : 'secondary'}>
              {STATUS_LABELS[status]}
            </Badge>
          )
        },
      },
      {
        id: 'effectiveRole',
        header: '有效角色',
        cell: ({ row }) => {
          const role = getEffectiveRole(row.original)

          return (
            <Badge variant={ROLE_BADGE_VARIANTS[role]}>
              {ROLE_LABELS[role]}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'organizationRole',
        header: '组织角色',
        cell: ({ row }) => (
          <Badge variant='secondary'>
            {formatRole(row.original.organizationRole)}
          </Badge>
        ),
      },
      {
        accessorKey: 'projectRole',
        header: '项目角色',
        cell: ({ row }) => (
          <Badge variant='outline'>
            {formatRole(row.original.projectRole)}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          const member = row.original
          const canOperate = canOperateMember(actorRole, member)
          const hasProjectOverride =
            normalizeRole(member.projectRole) !== 'NONE'

          if (!canEditProjectMembers || !canManageProjectMembers(actorRole)) {
            return (
              <span className='text-muted-foreground text-xs'>
                当前角色不能管理
              </span>
            )
          }

          if (member.status === 'pending') {
            return (
              <span className='text-muted-foreground text-xs'>
                等待接受邀请
              </span>
            )
          }

          return (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' className='size-8'>
                  <MoreHorizontal className='size-4' />
                  <span className='sr-only'>打开项目成员操作</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  disabled={!canOperate}
                  onClick={() => {
                    setEditingMember(member)
                    setDrawerOpen(true)
                  }}
                >
                  设置项目角色
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='text-destructive focus:text-destructive'
                  disabled={!canOperate || !hasProjectOverride}
                  onClick={() => setRemovingMember(member)}
                >
                  移除项目角色
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [actorRole, canEditProjectMembers]
  )

  return (
    <ContentSection
      title='项目成员'
      desc='管理当前项目的角色覆盖；未设置项目角色时默认继承组织角色。'
    >
      <div className='flex min-w-0 flex-col gap-4'>
        <div className='flex justify-end'>
          <Button
            onClick={() => {
              setEditingMember(null)
              setFormError(null)
              createMutation.reset()
              updateMutation.reset()
              setDrawerOpen(true)
            }}
            disabled={!canManage}
          >
            <Plus data-icon='inline-start' />
            新增项目成员
          </Button>
        </div>

        <section className='bg-card text-card-foreground min-w-0 rounded-lg border p-4'>
          <DataTable<
            ProjectUserRecord,
            DataTableListResponse<ProjectUserRecord>
          >
            columns={columns}
            request={{
              queryKey: ['project-settings-members', $api, projectId],
              enabled: Boolean(projectId),
              queryFn: async (state) => {
                const rows = await $api.getProjectMembers<ProjectUserRecord[]>({
                  path: { projectId },
                })
                const effectiveRoleFilter = getRoleFilter(
                  state,
                  'effectiveRole'
                )
                const projectRoleFilter = getRoleFilter(state, 'projectRole')
                const filtered = rows.filter((member) => {
                  const effectiveRole = getEffectiveRole(member)
                  const projectRole = normalizeRole(member.projectRole)

                  return (
                    matchesKeyword(member, state.keyword) &&
                    (effectiveRoleFilter.length === 0 ||
                      effectiveRoleFilter.includes(effectiveRole)) &&
                    (projectRoleFilter.length === 0 ||
                      projectRoleFilter.includes(projectRole))
                  )
                })

                return paginate(filtered, state.page, state.pageSize)
              },
            }}
            urlState={{
              pageKey: 'projectMemberPage',
              pageSizeKey: 'projectMemberPageSize',
              globalFilterKey: 'projectMemberKeyword',
              filters: [
                { fieldId: 'effectiveRole', type: 'array' },
                { fieldId: 'projectRole', type: 'array' },
              ],
            }}
            toolbar={{
              searchPlaceholder: '按姓名、邮箱或角色搜索...',
              filters: roleToolbarFilters,
              columnLabels: {
                name: '成员',
                status: '状态',
                effectiveRole: '有效角色',
                organizationRole: '组织角色',
                projectRole: '项目角色',
              },
            }}
            enableRowSelection={false}
            minTableWidth={900}
            emptyText='当前项目暂无可展示成员。'
            errorText='项目成员加载失败，请确认后端服务和项目权限。'
          />
        </section>

        <ProjectMemberDrawer
          key={editingMember?.id ?? 'create'}
          open={drawerOpen}
          member={editingMember}
          actorRole={actorRole}
          saving={createMutation.isPending || updateMutation.isPending}
          errorMessage={
            formError ??
            (editingMember
              ? getApiErrorMessage(updateMutation.error)
              : getApiErrorMessage(createMutation.error))
          }
          onInputChange={() => {
            if (!editingMember) {
              setFormError(null)
              createMutation.reset()
            }
          }}
          onOpenChange={(open) => {
            setDrawerOpen(open)
            if (!open) {
              setEditingMember(null)
              setFormError(null)
              createMutation.reset()
              updateMutation.reset()
            }
          }}
          onSubmit={(input) => {
            if (editingMember) {
              updateMutation.mutate({
                memberId: editingMember.id,
                role: input.role,
              })
              return
            }
            setFormError(null)
            if (
              findExistingProjectMemberByEmail(
                membersMetaQuery.data ?? [],
                input.email
              )
            ) {
              setFormError(PROJECT_MEMBER_EXISTS_MESSAGE)
              return
            }
            createMutation.mutate(input)
          }}
        />

        <ConfirmDialog
          open={Boolean(removingMember)}
          onOpenChange={(open) => {
            if (!open) setRemovingMember(null)
          }}
          title='移除项目角色'
          desc='移除后该成员将继承组织角色；如果组织角色为 None，则不再拥有当前项目访问权限。'
          confirmText='移除'
          destructive
          isLoading={deleteMutation.isPending}
          handleConfirm={() => {
            if (removingMember) {
              deleteMutation.mutate(removingMember.id)
            }
          }}
        />
      </div>
    </ContentSection>
  )
}

function ProjectMemberDrawer({
  open,
  member,
  actorRole,
  saving,
  errorMessage,
  onInputChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  member: ProjectUserRecord | null
  actorRole: ProjectRole
  saving: boolean
  errorMessage?: string
  onInputChange?: () => void
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { name?: string; email: string; role: ProjectRole }) => void
}) {
  const formId = useId()
  const $api = useAPI()
  const isEditMode = Boolean(member)
  const roleOptions = getProjectRoleOptions(actorRole, isEditMode)
  const fallbackRole = isEditMode ? 'NONE' : 'MEMBER'
  const emailSettingsQuery = useQuery({
    queryKey: ['organization-member-email-settings', $api],
    enabled: open && !isEditMode,
    queryFn: () =>
      $api.getOrganizationMemberEmailSettings<MemberEmailSettings>(),
    staleTime: Infinity,
  })
  const defaultEmailDomain = emailSettingsQuery.data?.defaultEmailDomain ?? ''

  const defaultValues = useMemo<ProjectMemberFormValues>(
    () => ({
      name: member?.name ?? '',
      email: member?.email ?? '',
      role: normalizeRole(member?.projectRole ?? fallbackRole),
    }),
    [fallbackRole, member?.email, member?.name, member?.projectRole]
  )

  const handleSubmit = (values: ProjectMemberFormValues) => {
    onSubmit({
      name: values.name?.trim(),
      email: values.email.trim(),
      role: values.role,
    })
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? '设置项目角色' : '新增项目成员'}
      confirmText={isEditMode ? '保存' : '添加'}
      confirmProps={{
        form: formId,
        type: 'submit',
        disabled: saving || roleOptions.length === 0,
      }}
      cancelProps={{ disabled: saving }}
    >
      <BaseForm
        key={member?.id ?? 'create-project-member'}
        id={formId}
        schema={projectMemberFormSchema}
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
                      disabled={isEditMode || saving}
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event)
                        onInputChange?.()
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
                      disabled={isEditMode || saving}
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event)
                        onInputChange?.()
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
                  <FormLabel>项目角色</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) =>
                      field.onChange(normalizeRole(value))
                    }
                    disabled={saving || roleOptions.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='选择项目角色' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {formatRole(option)}
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
      {errorMessage ? (
        <div className='border-destructive/30 bg-destructive/5 text-destructive mx-4 mb-4 rounded-md border px-3 py-2 text-sm'>
          {errorMessage}
        </div>
      ) : null}
    </Drawer>
  )
}

function findExistingProjectMemberByEmail(
  members: ProjectUserRecord[],
  email: string
) {
  const normalizedEmail = normalizeEmail(email)

  return members.find(
    (member) =>
      normalizeEmail(member.email) === normalizedEmail &&
      roleLevel(getEffectiveRole(member)) > ROLE_LEVELS.NONE
  )
}
