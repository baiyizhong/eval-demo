import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { EmptyOrganizationState } from '@/modules/organization-management/components/empty-organization-state'
import {
  canManageMembers,
  canRemoveMember,
} from '@/modules/organization-management/data/permissions'
import {
  type OrganizationMember,
  type OrganizationRole,
  type PaginatedResult,
} from '@/modules/organization-management/data/schema'
import { useCurrentOrganizationRole } from '@/modules/organization-management/hooks/use-current-organization-role'
import { useOrganizations } from '@/modules/organization-management/hooks/use-organizations'
import { MoreHorizontal, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useOrganizationStore } from '@/stores/organization.store'
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
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ContentSection } from '@/components/common/content-section'
import {
  DataTable,
  type DataTableListResponse,
  type DataTableQueryState,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { MemberFormDrawer } from './member-form-drawer'

const ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
  NONE: 'None',
}

const ROLE_BADGE_VARIANTS: Record<
  OrganizationRole,
  'default' | 'secondary' | 'outline'
> = {
  OWNER: 'default',
  ADMIN: 'secondary',
  MEMBER: 'outline',
  VIEWER: 'outline',
  NONE: 'outline',
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '已加入',
  INVITED: '待接受',
  SUSPENDED: '已停用',
}

const STATUS_BADGE_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  ACTIVE: 'secondary',
  INVITED: 'outline',
  SUSPENDED: 'destructive',
}

function formatDateTime(value?: string) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getRoleFilter(state: DataTableQueryState) {
  const role = state.filters.role

  if (!Array.isArray(role)) {
    return undefined
  }

  const values = role.filter(
    (item): item is OrganizationRole => typeof item === 'string'
  )

  if (values.length === 0) {
    return undefined
  }

  return values.length === 1 ? values[0] : values
}

function getEditBlockedReason(
  actorRole: OrganizationRole | null,
  member: OrganizationMember,
  ownerCount: number
) {
  if (member.status === 'INVITED') {
    return '等待接受邀请'
  }

  if (!actorRole || !canManageMembers(actorRole)) {
    return '当前角色不能管理成员'
  }

  if (actorRole === 'ADMIN' && member.role === 'OWNER') {
    return 'Admin 不能操作 Owner'
  }

  if (member.role === 'OWNER' && ownerCount <= 1) {
    return '不能调整最后一个 Owner 的角色'
  }

  return null
}

function OrganizationMembersLoading() {
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap justify-end gap-2'>
        <Skeleton className='h-9 w-24' />
      </div>
      <div className='rounded-lg border p-4'>
        <div className='flex flex-col gap-3'>
          <Skeleton className='h-8 w-56' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      </div>
    </div>
  )
}

export function SettingsOrganizationMembers() {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const {
    organizations: storeOrganizations,
    data: organizationsData,
    isPending: organizationsPending,
  } = useOrganizations()
  const currentOrganizationId = useOrganizationStore(
    (state) => state.currentOrganizationId
  )
  const isLoaded = useOrganizationStore((state) => state.isLoaded)

  const [createOpen, setCreateOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(
    null
  )
  const [deletingMember, setDeletingMember] =
    useState<OrganizationMember | null>(null)

  const queryOrganizations = organizationsData?.datas
  const effectiveOrganizations = queryOrganizations ?? storeOrganizations
  const effectiveCurrentOrganization =
    effectiveOrganizations.find(
      (organization) => organization.id === currentOrganizationId
    ) ??
    effectiveOrganizations[0] ??
    null
  const organizationId = effectiveCurrentOrganization?.id ?? null
  const { can } = usePermission({
    type: 'org',
    orgId: organizationId ?? undefined,
  })
  const canEditOrgMembers = can('org:member:edit')
  const isLoading = organizationsPending || (!isLoaded && !queryOrganizations)
  const isEmpty = !isLoading && effectiveOrganizations.length === 0

  const { actorRole, isPending: actorRolePending } =
    useCurrentOrganizationRole(organizationId)
  const actorMembersQuery = useQuery({
    queryKey: ['organization-members-permission-meta', organizationId, $api],
    enabled: Boolean(organizationId),
    queryFn: () => {
      if (!organizationId) {
        throw new Error('缺少组织 ID')
      }

      // mock 模式下缺少 owner 统计接口；真实后端应返回当前组织权限摘要。
      return $api.getOrganizationMembers<PaginatedResult<OrganizationMember>>({
        path: { organizationId },
        query: {
          page: 1,
          pageSize: 10000,
          keyword: '',
        },
      })
    },
  })
  const ownerCount =
    actorMembersQuery.data?.datas.filter(
      (member) => member.status !== 'INVITED' && member.role === 'OWNER'
    ).length ?? 0
  const canManage =
    canEditOrgMembers && actorRole ? canManageMembers(actorRole) : false

  const deleteMutation = useMutation({
    mutationFn: (member: OrganizationMember) =>
      $api.deleteOrganizationMember<void>({
        path: {
          organizationId: member.organizationId,
          memberId: member.id,
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['organization-members', organizationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['organization-members-actor', organizationId],
        }),
      ])
      toast.success('成员已删除')
      setDeletingMember(null)
    },
  })

  const roleToolbarFilters = useMemo<DataTableToolbarFilter[]>(
    () => [
      {
        columnId: 'role',
        title: '角色',
        options: Object.entries(ROLE_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
      },
    ],
    []
  )

  const columns = useMemo<ColumnDef<OrganizationMember>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '姓名',
        cell: ({ row }) => (
          <div className='max-w-36 truncate font-medium'>
            {row.original.name || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: '邮箱',
        cell: ({ row }) => (
          <div className='text-muted-foreground max-w-56 truncate'>
            {row.original.email}
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: '角色',
        cell: ({ row }) => (
          <Badge variant={ROLE_BADGE_VARIANTS[row.original.role]}>
            {ROLE_LABELS[row.original.role]}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => {
          const status = row.original.status ?? 'ACTIVE'

          return (
            <Badge variant={STATUS_BADGE_VARIANTS[status] ?? 'outline'}>
              {STATUS_LABELS[status] ?? status}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'joinedAt',
        header: '加入时间',
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDateTime(row.original.joinedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          const member = row.original
          if (member.status === 'INVITED') {
            return (
              <span className='text-muted-foreground text-xs'>
                等待接受邀请
              </span>
            )
          }

          const editBlockedReason = canEditOrgMembers
            ? getEditBlockedReason(actorRole, member, ownerCount)
            : '当前角色不能管理成员'
          const removeResult =
            canEditOrgMembers && actorRole
              ? canRemoveMember(actorRole, member.role, ownerCount)
              : {
                  allowed: false,
                  reason: '当前角色不能删除成员',
                }
          const hasAnyAction = !editBlockedReason || removeResult.allowed

          if (!hasAnyAction) {
            return (
              <span className='text-muted-foreground text-xs'>
                {editBlockedReason ?? removeResult.reason ?? '不可操作'}
              </span>
            )
          }

          return (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' className='size-8'>
                  <MoreHorizontal className='size-4' />
                  <span className='sr-only'>打开成员操作</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  disabled={Boolean(editBlockedReason)}
                  onClick={() => setEditingMember(member)}
                >
                  编辑角色
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='text-destructive focus:text-destructive'
                  disabled={!removeResult.allowed}
                  onClick={() => setDeletingMember(member)}
                >
                  删除成员
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [actorRole, canEditOrgMembers, ownerCount]
  )

  return (
    <ContentSection
      title='组织人员'
      desc='管理当前组织成员和角色权限。'
    >
      <>
        {isLoading ? (
          <OrganizationMembersLoading />
        ) : isEmpty ? (
          <EmptyOrganizationState />
        ) : organizationId ? (
          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex flex-wrap items-center justify-end gap-2'>
              <Button
                type='button'
                onClick={() => setCreateOpen(true)}
                disabled={!canManage || actorRolePending}
              >
                <Plus className='size-4' />
                添加成员
              </Button>
            </div>

            <section className='bg-card text-card-foreground min-w-0 rounded-lg border p-4'>
              <DataTable<
                OrganizationMember,
                DataTableListResponse<OrganizationMember>
              >
                columns={columns}
                request={{
                  queryKey: ['organization-members', organizationId, $api],
                  enabled: Boolean(organizationId),
                  queryFn: (state) =>
                    $api.getOrganizationMembers<
                      DataTableListResponse<OrganizationMember>
                    >({
                      path: { organizationId },
                      query: {
                        page: state.page,
                        pageSize: state.pageSize,
                        keyword: state.keyword,
                        role: getRoleFilter(state),
                      },
                    }),
                }}
                urlState={{
                  pageKey: 'page',
                  pageSizeKey: 'pageSize',
                  globalFilterKey: 'keyword',
                  filters: [{ fieldId: 'role', type: 'array' }],
                }}
                toolbar={{
                  searchPlaceholder: '按姓名、邮箱或状态搜索...',
                  filters: roleToolbarFilters,
                  columnLabels: {
                    name: '姓名',
                    email: '邮箱',
                    role: '角色',
                    status: '状态',
                    joinedAt: '加入时间',
                  },
                }}
                enableRowSelection={false}
                minTableWidth={920}
                emptyText='当前组织暂无成员。'
                errorText='成员列表加载失败。'
              />
            </section>
          </div>
        ) : (
          <EmptyOrganizationState />
        )}

        {organizationId && actorRole ? (
          <MemberFormDrawer
            open={createOpen || Boolean(editingMember)}
            onOpenChange={(open) => {
              if (!open) {
                setCreateOpen(false)
                setEditingMember(null)
              }
            }}
            organizationId={organizationId}
            actorRole={actorRole}
            ownerCount={ownerCount}
            member={editingMember}
          />
        ) : null}

        <ConfirmDialog
          open={Boolean(deletingMember)}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingMember(null)
            }
          }}
          title='删除成员'
          desc={
            deletingMember ? (
              <div className='flex flex-col gap-2'>
                <p>确定要删除该成员吗？删除后需要重新邀请才能恢复。</p>
                <div className='bg-muted/20 rounded-md border px-3 py-2 text-sm'>
                  <div>{deletingMember.name || '-'}</div>
                  <div className='text-muted-foreground'>
                    {deletingMember.email}
                  </div>
                </div>
              </div>
            ) : null
          }
          confirmText='删除'
          destructive
          isLoading={deleteMutation.isPending}
          handleConfirm={() => {
            if (deletingMember) {
              void deleteMutation.mutateAsync(deletingMember)
            }
          }}
        />
      </>
    </ContentSection>
  )
}
