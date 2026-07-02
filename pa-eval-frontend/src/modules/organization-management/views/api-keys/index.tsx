import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ContentSection } from '@/components/common/content-section'
import {
  DataTable,
  type DataTableListResponse,
} from '@/components/common/data-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useAPI } from '@/hooks/use-api'
import { EmptyOrganizationState } from '@/modules/organization-management/components/empty-organization-state'
import { canManageMembers } from '@/modules/organization-management/data/permissions'
import {
  type OrganizationApiKey,
  type PaginatedResult,
} from '@/modules/organization-management/data/schema'
import { useCurrentOrganizationRole } from '@/modules/organization-management/hooks/use-current-organization-role'
import { useOrganizations } from '@/modules/organization-management/hooks/use-organizations'
import { useOrganizationStore } from '@/stores/organization.store'
import { CreateApiKeyDialog } from './create-api-key-dialog'

function formatDateTime(value?: string | null) {
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

function OrganizationApiKeysLoading() {
  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Skeleton className='h-9 w-28' />
      </div>
      <div className='rounded-lg border p-4'>
        <div className='space-y-3'>
          <Skeleton className='h-8 w-56' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      </div>
    </div>
  )
}

export function SettingsOrganizationApiKeys() {
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
  const [deletingApiKey, setDeletingApiKey] = useState<OrganizationApiKey | null>(
    null
  )

  const queryOrganizations = organizationsData?.datas
  const effectiveOrganizations = queryOrganizations ?? storeOrganizations
  const effectiveCurrentOrganization =
    effectiveOrganizations.find(
      (organization) => organization.id === currentOrganizationId
    ) ?? effectiveOrganizations[0] ?? null
  const organizationId = effectiveCurrentOrganization?.id ?? null
  const { actorRole, isPending: actorRolePending } =
    useCurrentOrganizationRole(organizationId)
  const canManageApiKeys = actorRole ? canManageMembers(actorRole) : false
  const isLoading = organizationsPending || (!isLoaded && !queryOrganizations)
  const isEmpty = !isLoading && effectiveOrganizations.length === 0

  const deleteMutation = useMutation({
    mutationFn: (apiKey: OrganizationApiKey) =>
      $api.deleteOrganizationApiKey<void>({
        path: {
          organizationId: apiKey.organizationId,
          apiKeyId: apiKey.id,
        },
      }),
    onSuccess: async () => {
      if (organizationId) {
        await queryClient.invalidateQueries({
          queryKey: ['organization-api-keys', organizationId],
        })
      }
      toast.success('API Key 已删除')
      setDeletingApiKey(null)
    },
  })

  const columns = useMemo<ColumnDef<OrganizationApiKey>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '名称',
        cell: ({ row }) => (
          <div className='max-w-48 truncate font-medium'>{row.original.name}</div>
        ),
      },
      {
        accessorKey: 'publicKey',
        header: 'Public Key',
        cell: ({ row }) => (
          <span className='font-mono text-xs text-muted-foreground'>
            {row.original.publicKey ?? '-'}
          </span>
        ),
      },
      {
        id: 'secretKeyMasked',
        header: 'Secret Key',
        cell: ({ row }) => (
          <span className='font-mono text-xs text-muted-foreground'>
            {row.original.secretKeyMasked ?? row.original.maskedKey ?? '-'}
          </span>
        ),
      },
      {
        accessorKey: 'createdBy',
        header: '创建人',
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.createdBy ?? '-'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '创建时间',
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: 'lastUsedAt',
        header: '最近使用',
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDateTime(row.original.lastUsedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='size-8'>
                <MoreHorizontal className='size-4' />
                <span className='sr-only'>打开 API Key 操作</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                className='text-destructive focus:text-destructive'
                disabled={!canManageApiKeys}
                onClick={() => setDeletingApiKey(row.original)}
              >
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [canManageApiKeys]
  )

  return (
    <ContentSection
      title='API Key 管理'
      desc='为当前组织创建和回收 API Key；Secret Key 只会在创建成功后展示一次。'
    >
      <>
        {isLoading ? (
          <OrganizationApiKeysLoading />
        ) : isEmpty ? (
          <EmptyOrganizationState />
        ) : organizationId ? (
          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex justify-end'>
              <Button
                type='button'
                onClick={() => setCreateOpen(true)}
                disabled={!canManageApiKeys || actorRolePending}
              >
                <Plus className='size-4' />
                创建 API Key
              </Button>
            </div>

            <section className='min-w-0 rounded-lg border bg-card p-4 text-card-foreground'>
              <DataTable<OrganizationApiKey, DataTableListResponse<OrganizationApiKey>>
                columns={columns}
                request={{
                  queryKey: ['organization-api-keys', organizationId, $api],
                  enabled: Boolean(organizationId) && canManageApiKeys,
                  queryFn: (state) =>
                    $api.getOrganizationApiKeys<
                      PaginatedResult<OrganizationApiKey>
                    >({
                      path: { organizationId },
                      query: {
                        page: state.page,
                        pageSize: state.pageSize,
                        keyword: state.keyword,
                      },
                    }),
                }}
                urlState={{
                  pageKey: 'page',
                  pageSizeKey: 'pageSize',
                  globalFilterKey: 'keyword',
                }}
                toolbar={{
                  searchPlaceholder: '按名称、Public Key 或创建人搜索...',
                  columnLabels: {
                    name: '名称',
                    publicKey: 'Public Key',
                    secretKeyMasked: 'Secret Key',
                    createdBy: '创建人',
                    createdAt: '创建时间',
                    lastUsedAt: '最近使用',
                  },
                }}
                enableRowSelection={false}
                minTableWidth={980}
                emptyText='当前组织暂无 API Key。'
                errorText='API Key 列表加载失败。'
              />
              {!canManageApiKeys && !actorRolePending ? (
                <p className='mt-3 text-sm text-muted-foreground'>
                  仅 Owner / Admin 可查看和管理 API Key。
                </p>
              ) : null}
            </section>
          </div>
        ) : (
          <EmptyOrganizationState />
        )}

        {organizationId ? (
          <CreateApiKeyDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            organizationId={organizationId}
          />
        ) : null}

        <ConfirmDialog
          open={Boolean(deletingApiKey)}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingApiKey(null)
            }
          }}
          title='删除 API Key'
          desc={
            deletingApiKey ? (
              <p>
                删除后，使用 <strong>{deletingApiKey.name}</strong> 的集成将立即失效。
              </p>
            ) : (
              '删除后相关集成将立即失效。'
            )
          }
          confirmText='删除'
          destructive
          isLoading={deleteMutation.isPending}
          handleConfirm={() => {
            if (deletingApiKey && canManageApiKeys) {
              void deleteMutation.mutateAsync(deletingApiKey)
            }
          }}
        />
      </>
    </ContentSection>
  )
}
