import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { ContentSection } from '@/components/common/content-section'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  DataTable,
  type DataTableListResponse,
  type DataTableQueryState,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { ImportDialog } from '@/components/common/import-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useAPI } from '@/hooks/use-api'
import {
  buildMemberImportResult,
  parseMemberImportCsv,
} from '@/modules/organization-management/data/member-import'
import {
  canManageMembers,
  canRemoveMember,
} from '@/modules/organization-management/data/permissions'
import {
  type ImportOrganizationMembersPayload,
  type ImportOrganizationMembersResult,
  type OrganizationMember,
  type OrganizationRole,
  type PaginatedResult,
} from '@/modules/organization-management/data/schema'
import { useOrganizations } from '@/modules/organization-management/hooks/use-organizations'
import { useCurrentOrganizationRole } from '@/modules/organization-management/hooks/use-current-organization-role'
import { EmptyOrganizationState } from '@/modules/organization-management/components/empty-organization-state'
import { useOrganizationStore } from '@/stores/organization.store'
import { MemberFormDrawer } from './member-form-drawer'
import {
  MemberImportResultDialog,
  type MemberImportResultSummary,
} from './member-import-result-dialog'

const ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
}

const ROLE_BADGE_VARIANTS: Record<
  OrganizationRole,
  'default' | 'secondary' | 'outline'
> = {
  OWNER: 'default',
  ADMIN: 'secondary',
  MEMBER: 'outline',
  VIEWER: 'outline',
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
    <div className='space-y-4'>
      <div className='flex flex-wrap justify-end gap-2'>
        <Skeleton className='h-9 w-24' />
        <Skeleton className='h-9 w-24' />
      </div>
      <div className='rounded-lg border p-4'>
        <div className='space-y-3'>
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
  const [importOpen, setImportOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(
    null
  )
  const [deletingMember, setDeletingMember] =
    useState<OrganizationMember | null>(null)
  const [importResult, setImportResult] =
    useState<MemberImportResultSummary | null>(null)
  const [importResultOpen, setImportResultOpen] = useState(false)

  const queryOrganizations = organizationsData?.datas
  const effectiveOrganizations = queryOrganizations ?? storeOrganizations
  const effectiveCurrentOrganization =
    effectiveOrganizations.find(
      (organization) => organization.id === currentOrganizationId
    ) ?? effectiveOrganizations[0] ?? null
  const organizationId = effectiveCurrentOrganization?.id ?? null
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
    actorMembersQuery.data?.datas.filter((member) => member.role === 'OWNER')
      .length ?? 0
  const canManage = actorRole ? canManageMembers(actorRole) : false

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

  const importMutation = useMutation({
    mutationFn: (payload: ImportOrganizationMembersPayload) => {
      if (!organizationId) {
        throw new Error('缺少组织 ID')
      }

      return $api.importOrganizationMembers<
        ImportOrganizationMembersResult,
        ImportOrganizationMembersPayload
      >({
        path: { organizationId },
        body: payload,
      })
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
          <div className='max-w-56 truncate text-muted-foreground'>
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
          const editBlockedReason = getEditBlockedReason(
            actorRole,
            member,
            ownerCount
          )
          const removeResult = actorRole
            ? canRemoveMember(actorRole, member.role, ownerCount)
            : {
                allowed: false,
                reason: '当前角色不能删除成员',
              }
          const hasAnyAction = !editBlockedReason || removeResult.allowed

          if (!hasAnyAction) {
            return (
              <span className='text-xs text-muted-foreground'>
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
    [actorRole, ownerCount]
  )

  const handleImport = async (file: File) => {
    if (!actorRole) {
      toast.error('当前角色信息加载中，请稍后重试')
      return
    }

    const text = await file.text()
    const parsed = parseMemberImportCsv(text, actorRole)

    if (!organizationId) {
      return
    }

    if (parsed.members.length === 0) {
      setImportResult(
        buildMemberImportResult(parsed, {
          total: 0,
          datas: [],
          failures: [],
        })
      )
      setImportResultOpen(true)
      return
    }

    try {
      const response = await importMutation.mutateAsync({
        members: parsed.members.map((member) => ({
          name: member.name,
          email: member.email,
          role: member.role,
        })),
      })

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['organization-members', organizationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['organization-members-actor', organizationId],
        }),
      ])

      const result = buildMemberImportResult(parsed, response)
      setImportResult(result)
      setImportResultOpen(true)
      toast.success(
        result.failures.length > 0 ? '成员导入已完成' : `已导入 ${result.successCount} 位成员`
      )
    } catch {
      // 请求层会统一提示错误，这里不重复 toast
    }
  }

  return (
    <ContentSection
      title='组织人员'
      desc='管理当前组织成员、角色权限，并支持批量导入结果回看。'
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
                variant='outline'
                onClick={() => setImportOpen(true)}
                disabled={!canManage || actorRolePending}
              >
                <Upload className='size-4' />
                导入成员
              </Button>
              <Button
                type='button'
                onClick={() => setCreateOpen(true)}
                disabled={!canManage || actorRolePending}
              >
                <Plus className='size-4' />
                添加成员
              </Button>
            </div>

            <section className='min-w-0 rounded-lg border bg-card p-4 text-card-foreground'>
              <DataTable<
                OrganizationMember,
                DataTableListResponse<OrganizationMember>
              >
                columns={columns}
                request={{
                  queryKey: ['organization-members', organizationId, $api],
                  enabled: Boolean(organizationId),
                  queryFn: (state) =>
                    $api.getOrganizationMembers<DataTableListResponse<OrganizationMember>>({
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

        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          title='导入组织成员'
          description='请上传 CSV 文件，支持姓名/邮箱/组织角色三列。'
          fileTypes={['text/csv', '.csv']}
          onImport={handleImport}
        />

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
              <div className='space-y-2'>
                <p>确定要删除该成员吗？删除后需要重新邀请才能恢复。</p>
                <div className='rounded-md border bg-muted/20 px-3 py-2 text-sm'>
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

        <MemberImportResultDialog
          open={importResultOpen}
          onOpenChange={setImportResultOpen}
          result={importResult}
        />
      </>
    </ContentSection>
  )
}
