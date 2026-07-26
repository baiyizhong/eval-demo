import { useMemo, useState, type PropsWithChildren } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  FileClock,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Outlet } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChartMetricCard } from '@/components/common/charts'
import { ContentSection } from '@/components/common/content-section'
import { DateTimeRangePicker } from '@/components/common/date-time/date-time-range-picker'
import { formatDate } from '@/components/common/date-time/date-time-utils'
import { Drawer } from '@/components/common/drawer'
import { Loading } from '@/components/common/loading'
import { SidebarNav } from '@/components/common/sidebar-nav'
import { Main } from '@/components/layout/main'

type AuditLogRecord = {
  id: string
  actorUserId?: string
  actorEmail: string
  action: string
  resourceType: string
  resourceId: string
  organizationId?: string
  projectId?: string
  method: string
  path: string
  status: 'SUCCESS' | 'FAILED' | string
  statusCode: number
  ipAddress?: string
  userAgent?: string
  txId?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

type PaginatedResult<T> = {
  total: number
  datas: T[]
}

type AdminOverview = {
  service: {
    name: string
    status: string
  }
  database: {
    configured: boolean
    connected: boolean
  }
  metrics: {
    organizations: number
    projects: number
    activeProjects: number
    archivedProjects: number
    users: number
    auditLogs: number
  }
}

type AdminUser = {
  id: string
  name?: string | null
  email?: string | null
  admin: boolean
  createdAt: string
  updatedAt: string
}

type UserOrganizationRole = {
  id: string
  name: string
  role: string
}

type UserProjectRole = {
  id: string
  name: string
  organizationId: string
  organizationName: string
  organizationRole: string
  projectRole: string
  effectiveRole: string
}

type AdminUserRoleBindings = {
  user: AdminUser
  organizations: UserOrganizationRole[]
  projects: UserProjectRole[]
}

type StaticSystemPageProps = {
  title: string
  description: string
  icon: LucideIcon
  items: { label: string; value: string }[]
}

const statusLabels: Record<string, string> = {
  SUCCESS: '成功',
  FAILED: '失败',
}

const actionLabels: Record<string, string> = {
  CREATE: '创建',
  UPDATE: '更新',
  DELETE: '删除',
  ARCHIVE: '归档',
  RESTORE: '恢复',
  RERUN: '重跑',
  SAVE_SCORES: '保存评分',
  ADD_TO_DATASET: '加入数据集',
  CREATE_ANNOTATION_TASK: '创建标注任务',
  FLOWBACK: '数据回流',
  DEMO_SEED: '演示数据初始化',
}

const backendNavItems = [
  {
    title: '系统概览',
    href: '/backend/overview',
    icon: <Database />,
  },
  {
    title: '用户管理',
    href: '/backend/users',
    icon: <Users />,
  },
]

const adminFilterOptions = {
  ALL: undefined,
  ADMIN: true,
  USER: false,
} as const

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

function getActionLabel(action: string) {
  const normalized = action.toUpperCase()
  return actionLabels[normalized] ?? normalized
}

function getStatusBadgeVariant(status: string) {
  return status === 'FAILED' ? 'destructive' : 'secondary'
}

function SystemPageShell({
  title,
  description,
  icon: Icon,
  fullWidth = false,
  showHeader = true,
  children,
}: PropsWithChildren<{
  title: string
  description: string
  icon: LucideIcon
  fullWidth?: boolean
  showHeader?: boolean
}>) {
  return (
    <div
      className={
        fullWidth
          ? 'flex w-full flex-col gap-4 px-6 py-6'
          : 'mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-6'
      }
    >
      {showHeader ? (
        <div className='flex items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <div className='border-border bg-muted flex size-10 shrink-0 items-center justify-center rounded-md border'>
              <Icon className='text-muted-foreground size-5' />
            </div>
            <div className='flex min-w-0 flex-col gap-1'>
              <h1 className='text-2xl font-semibold tracking-normal'>
                {title}
              </h1>
              <p className='text-muted-foreground text-sm'>{description}</p>
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  )
}

function StaticSystemPage({
  title,
  description,
  icon,
  items,
}: StaticSystemPageProps) {
  return (
    <SystemPageShell title={title} description={description} icon={icon}>
      <div className='grid gap-3 md:grid-cols-2'>
        {items.map((item) => (
          <Card key={item.label} className='rounded-md'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium'>
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              {item.value}
            </CardContent>
          </Card>
        ))}
      </div>
    </SystemPageShell>
  )
}

function AuditLogTable({ logs }: { logs: AuditLogRecord[] }) {
  return (
    <div className='rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>操作者</TableHead>
            <TableHead>动作</TableHead>
            <TableHead>资源</TableHead>
            <TableHead>请求</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>txId</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className='whitespace-nowrap'>
                {formatDateTime(log.createdAt)}
              </TableCell>
              <TableCell>
                <div className='flex max-w-48 flex-col gap-1'>
                  <span className='truncate font-medium'>
                    {log.actorEmail || 'anonymous'}
                  </span>
                  {log.ipAddress ? (
                    <span className='text-muted-foreground truncate text-xs'>
                      {log.ipAddress}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant='outline'>{getActionLabel(log.action)}</Badge>
              </TableCell>
              <TableCell>
                <div className='flex max-w-56 flex-col gap-1'>
                  <span className='font-medium'>{log.resourceType}</span>
                  <span className='text-muted-foreground truncate text-xs'>
                    {log.resourceId || '-'}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className='flex max-w-72 flex-col gap-1'>
                  <span className='font-medium'>{log.method}</span>
                  <span className='text-muted-foreground truncate text-xs'>
                    {log.path}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={getStatusBadgeVariant(log.status)}>
                  {statusLabels[log.status] ?? log.status}
                </Badge>
              </TableCell>
              <TableCell className='max-w-44 truncate'>
                {log.txId || log.id}
              </TableCell>
            </TableRow>
          ))}
          {logs.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className='text-muted-foreground h-24 text-center'
              >
                暂无审计记录
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

export function OperationAudit() {
  const $api = useAPI()
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('ALL')
  const [action, setAction] = useState('ALL')
  const [createdRange, setCreatedRange] = useState<string[]>(getTodayAuditRange)
  const pageSize = 10
  const query = useMemo(
    () => ({
      page,
      pageSize,
      keyword: keyword.trim() || undefined,
      status: status === 'ALL' ? undefined : status,
      action: action === 'ALL' ? undefined : action,
      createdFrom: toIsoDateTime(createdRange[0]),
      createdTo: toIsoDateTime(createdRange[1]),
    }),
    [action, createdRange, keyword, page, status]
  )
  const auditQuery = useQuery({
    queryKey: ['audit-logs', $api, query],
    queryFn: () =>
      $api.listAuditLogs<PaginatedResult<AuditLogRecord>>({
        query,
      }),
  })
  const data = auditQuery.data ?? { total: 0, datas: [] }
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))

  return (
    <SystemPageShell
      title='操作审计'
      description='集中查看 PA Eval 的关键写操作、执行结果、资源路径和问题定位 txId。'
      icon={FileClock}
      fullWidth
      showHeader={false}
    >
      <Card className='rounded-md border-none p-0 shadow-none'>
        <CardContent className='flex flex-wrap items-center gap-2 px-0 py-2'>
          <Input
            className='h-9 w-full flex-none sm:w-128'
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value)
              setPage(1)
            }}
            placeholder='搜索操作者、资源、路径或 txId'
          />
          <Select
            value={action}
            onValueChange={(value) => {
              setAction(value)
              setPage(1)
            }}
          >
            <SelectTrigger className='h-9 w-full sm:w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>全部动作</SelectItem>
              <SelectItem value='CREATE'>创建</SelectItem>
              <SelectItem value='UPDATE'>更新</SelectItem>
              <SelectItem value='DELETE'>删除</SelectItem>
              <SelectItem value='ARCHIVE'>归档</SelectItem>
              <SelectItem value='RESTORE'>恢复</SelectItem>
              <SelectItem value='RERUN'>重跑</SelectItem>
              <SelectItem value='SAVE_SCORES'>保存评分</SelectItem>
              <SelectItem value='ADD_TO_DATASET'>加入数据集</SelectItem>
              <SelectItem value='CREATE_ANNOTATION_TASK'>
                创建标注任务
              </SelectItem>
              <SelectItem value='FLOWBACK'>数据回流</SelectItem>
              <SelectItem value='DEMO_SEED'>演示数据初始化</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
          >
            <SelectTrigger className='h-9 w-full sm:w-28'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>全部状态</SelectItem>
              <SelectItem value='SUCCESS'>成功</SelectItem>
              <SelectItem value='FAILED'>失败</SelectItem>
            </SelectContent>
          </Select>
          <DateTimeRangePicker
            className='w-full flex-none sm:w-[25rem]'
            value={createdRange}
            showTime
            timeFormat='HH:mm'
            placeholder='审计时间范围'
            startPlaceholder='开始时间'
            endPlaceholder='结束时间'
            onChange={(nextValue) => {
              setCreatedRange(nextValue)
              setPage(1)
            }}
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='ml-auto h-9'
            onClick={() => auditQuery.refetch()}
          >
            <RefreshCw data-icon='inline-start' />
            刷新
          </Button>
        </CardContent>
      </Card>

      {auditQuery.isLoading ? (
        <Loading text='加载操作审计中...' className='min-h-64' />
      ) : null}
      {auditQuery.isError ? (
        <div className='text-destructive rounded-md border p-4 text-sm'>
          操作审计加载失败，请确认后端服务、登录状态和数据库迁移。
        </div>
      ) : null}
      {!auditQuery.isLoading && !auditQuery.isError ? (
        <>
          <AuditLogTable logs={data.datas} />
          <div className='flex items-center justify-between gap-3 text-sm'>
            <span className='text-muted-foreground'>
              共 {data.total} 条，第 {page} / {totalPages} 页
            </span>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </SystemPageShell>
  )
}

function toIsoDateTime(value: string) {
  if (!value) return undefined
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function getTodayAuditRange() {
  const today = formatDate(new Date())

  return [`${today} 00:00`, `${today} 23:59`]
}

export function BackendManagement() {
  return (
    <Main>
      <div className='flex flex-col gap-1'>
        <h1 className='text-2xl font-bold tracking-normal md:text-3xl'>
          后台管理
        </h1>
        <p className='text-muted-foreground text-sm'>
          查看系统状态、用户和后台权限配置。
        </p>
      </div>
      <Separator className='my-4 lg:my-6' />
      <div className='flex flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:gap-12'>
        <aside className='top-0 lg:sticky lg:w-1/5'>
          <SidebarNav
            items={backendNavItems}
            defaultValue='/backend/overview'
            selectPlaceholder='后台分组'
          />
        </aside>
        <div className='flex w-full overflow-y-hidden p-1'>
          <Outlet />
        </div>
      </div>
    </Main>
  )
}

export function BackendOverview() {
  const $api = useAPI()
  const overviewQuery = useQuery({
    queryKey: ['admin-overview', $api],
    queryFn: () => $api.getAdminOverview<AdminOverview>(),
  })
  const overview = overviewQuery.data

  return (
    <SystemPageShell
      title='系统概览'
      description='查看 Plus 层服务、Langfuse 数据库连接和核心资源规模。'
      icon={Database}
      fullWidth
      showHeader={false}
    >
      {overviewQuery.isLoading ? (
        <Loading text='加载后台状态中...' className='min-h-64' />
      ) : null}
      {overviewQuery.isError ? (
        <div className='text-destructive rounded-md border p-4 text-sm'>
          后台状态加载失败，请确认后端服务、登录状态和数据库迁移。
        </div>
      ) : null}
      {overview ? (
        <>
          <div className='grid gap-3 md:grid-cols-3 xl:grid-cols-6'>
            <ChartMetricCard
              className='rounded-md'
              title='服务状态'
              value={overview.service.status}
              description={overview.service.name}
            />
            <ChartMetricCard
              className='rounded-md'
              title='数据库连接'
              value={overview.database.connected ? 'connected' : 'offline'}
              description={
                overview.database.configured ? '已配置连接' : '未配置连接'
              }
            />
            <ChartMetricCard
              className='rounded-md'
              title='组织'
              value={overview.metrics.organizations}
              description='Langfuse organizations'
            />
            <ChartMetricCard
              className='rounded-md'
              title='项目'
              value={overview.metrics.projects}
              description={`活跃 ${overview.metrics.activeProjects} / 归档 ${overview.metrics.archivedProjects}`}
            />
            <ChartMetricCard
              className='rounded-md'
              title='用户'
              value={overview.metrics.users}
              description='Langfuse users'
            />
            <ChartMetricCard
              className='rounded-md'
              title='审计日志'
              value={overview.metrics.auditLogs}
              description='PA audit logs'
            />
          </div>
        </>
      ) : null}
    </SystemPageShell>
  )
}

export function BackendUsers() {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [adminFilter, setAdminFilter] =
    useState<keyof typeof adminFilterOptions>('ALL')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const pageSize = 20
  const query = useMemo(
    () => ({
      page,
      pageSize,
      keyword: keyword.trim() || undefined,
      admin: adminFilterOptions[adminFilter],
    }),
    [adminFilter, keyword, page]
  )
  const usersQuery = useQuery({
    queryKey: ['admin-users', $api, query],
    queryFn: () =>
      $api.listAdminUsers<PaginatedResult<AdminUser>>({
        query,
      }),
  })
  const patchAdminMutation = useMutation({
    mutationFn: (input: { userId: string; admin: boolean }) =>
      $api.patchAdminUserAdmin<AdminUser>({
        path: { userId: input.userId },
        body: { admin: input.admin },
      }),
    onSuccess: async () => {
      toast.success('Admin 状态已更新')
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: () => {
      toast.error('Admin 状态更新失败')
    },
  })
  const data = usersQuery.data ?? { total: 0, datas: [] }
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))

  const handlePatchAdmin = async (user: AdminUser) => {
    const nextAdmin = !user.admin
    const confirmed = await confirm({
      title: nextAdmin ? '设为 Admin' : '取消 Admin',
      desc: `确认将 ${user.email || user.name || user.id} 的 admin 字段设置为 ${String(nextAdmin)}？这是用户管理页唯一可操作字段。`,
      confirmText: nextAdmin ? '设为 Admin' : '取消 Admin',
      destructive: !nextAdmin,
    })
    if (!confirmed) return
    patchAdminMutation.mutate({ userId: user.id, admin: nextAdmin })
  }

  return (
    <ContentSection title='用户管理' desc='查询所有用户，允许设置超级管理员。'>
      <div className='flex flex-col gap-4'>
        <Card className='rounded-md border-none p-0 shadow-none'>
          <CardContent className='flex flex-wrap items-center gap-2 p-0'>
            <Input
              className='h-9 min-w-64 flex-1'
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setPage(1)
              }}
              placeholder='搜索用户名、邮箱或用户 ID'
            />
            <Select
              value={adminFilter}
              onValueChange={(value) => {
                setAdminFilter(value as keyof typeof adminFilterOptions)
                setPage(1)
              }}
            >
              <SelectTrigger className='h-9 w-full sm:w-32'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>全部用户</SelectItem>
                <SelectItem value='ADMIN'>Admin</SelectItem>
                <SelectItem value='USER'>非 Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-9'
              onClick={() => usersQuery.refetch()}
            >
              <RefreshCw data-icon='inline-start' />
              刷新
            </Button>
          </CardContent>
        </Card>

        {usersQuery.isLoading ? (
          <Loading text='加载用户列表中...' className='min-h-64' />
        ) : null}
        {usersQuery.isError ? (
          <div className='text-destructive rounded-md border p-4 text-sm'>
            用户列表加载失败，请确认当前账号具备系统管理员权限。
          </div>
        ) : null}
        {!usersQuery.isLoading && !usersQuery.isError ? (
          <>
            <AdminUsersTable
              users={data.datas}
              loadingUserId={
                patchAdminMutation.isPending
                  ? patchAdminMutation.variables?.userId
                  : undefined
              }
              onOpenDetail={setSelectedUser}
              onPatchAdmin={(user) => void handlePatchAdmin(user)}
            />
            <div className='flex items-center justify-between gap-3 text-sm'>
              <span className='text-muted-foreground'>
                共 {data.total} 个用户，第 {page} / {totalPages} 页
              </span>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        ) : null}
        <UserRoleBindingsDrawer
          user={selectedUser}
          open={Boolean(selectedUser)}
          onOpenChange={(open) => {
            if (!open) setSelectedUser(null)
          }}
        />
      </div>
    </ContentSection>
  )
}

function AdminUsersTable({
  users,
  loadingUserId,
  onOpenDetail,
  onPatchAdmin,
}: {
  users: AdminUser[]
  loadingUserId?: string
  onOpenDetail: (user: AdminUser) => void
  onPatchAdmin: (user: AdminUser) => void
}) {
  return (
    <div className='rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>用户</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>Admin</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead>更新时间</TableHead>
            <TableHead className='text-end'>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className='flex max-w-56 flex-col gap-1'>
                  <span className='truncate font-medium'>
                    {user.name || '-'}
                  </span>
                  <span className='text-muted-foreground truncate text-xs'>
                    {user.id}
                  </span>
                </div>
              </TableCell>
              <TableCell className='max-w-64 truncate'>
                {user.email || '-'}
              </TableCell>
              <TableCell>
                <Badge variant={user.admin ? 'default' : 'secondary'}>
                  {user.admin ? 'true' : 'false'}
                </Badge>
              </TableCell>
              <TableCell className='whitespace-nowrap'>
                {formatDateTime(user.createdAt)}
              </TableCell>
              <TableCell className='whitespace-nowrap'>
                {formatDateTime(user.updatedAt)}
              </TableCell>
              <TableCell>
                <div className='flex justify-end gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => onOpenDetail(user)}
                  >
                    详情
                  </Button>
                  <Button
                    type='button'
                    variant={user.admin ? 'destructive' : 'default'}
                    size='sm'
                    disabled={loadingUserId === user.id}
                    onClick={() => onPatchAdmin(user)}
                  >
                    {user.admin ? '取消 Admin' : '设为 Admin'}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className='text-muted-foreground h-24 text-center'
              >
                暂无用户
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

function UserRoleBindingsDrawer({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const $api = useAPI()
  const roleBindingsQuery = useQuery({
    queryKey: ['admin-user-role-bindings', $api, user?.id],
    enabled: open && Boolean(user?.id),
    queryFn: () =>
      $api.getAdminUserRoleBindings<AdminUserRoleBindings>({
        path: { userId: user?.id ?? '' },
      }),
  })
  const data = roleBindingsQuery.data

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={`用户详情 - ${user?.email || user?.name || user?.id || ''}`}
      mode='enhanced'
      showConfirm={false}
      cancelText='关闭'
    >
      {roleBindingsQuery.isLoading ? (
        <Loading text='加载用户角色中...' className='min-h-64' />
      ) : null}
      {roleBindingsQuery.isError ? (
        <div className='text-destructive rounded-md border p-4 text-sm'>
          用户角色加载失败，请稍后重试。
        </div>
      ) : null}
      {data ? (
        <div className='flex flex-col gap-5'>
          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='text-base'>基础信息</CardTitle>
              <CardDescription>来自 Langfuse users 表。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid gap-3 text-sm sm:grid-cols-2'>
                <InfoItem label='用户 ID' value={data.user.id} />
                <InfoItem label='名称' value={data.user.name || '-'} />
                <InfoItem label='邮箱' value={data.user.email || '-'} />
                <InfoItem
                  label='Admin'
                  value={data.user.admin ? 'true' : 'false'}
                />
                <InfoItem
                  label='创建时间'
                  value={formatDateTime(data.user.createdAt)}
                />
                <InfoItem
                  label='更新时间'
                  value={formatDateTime(data.user.updatedAt)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='text-base'>组织角色</CardTitle>
              <CardDescription>用户在组织维度的角色。</CardDescription>
            </CardHeader>
            <CardContent>
              <RoleOrganizationsTable organizations={data.organizations} />
            </CardContent>
          </Card>

          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='text-base'>项目角色</CardTitle>
              <CardDescription>
                展示项目角色、组织角色以及最终生效角色。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoleProjectsTable projects={data.projects} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </Drawer>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className='truncate font-medium'>{value}</span>
    </div>
  )
}

function RoleOrganizationsTable({
  organizations,
}: {
  organizations: UserOrganizationRole[]
}) {
  return (
    <div className='rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>组织</TableHead>
            <TableHead>组织 ID</TableHead>
            <TableHead>组织角色</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((organization) => (
            <TableRow key={organization.id}>
              <TableCell className='font-medium'>{organization.name}</TableCell>
              <TableCell className='max-w-56 truncate'>
                {organization.id}
              </TableCell>
              <TableCell>
                <Badge variant='outline'>{organization.role}</Badge>
              </TableCell>
            </TableRow>
          ))}
          {organizations.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className='text-muted-foreground h-20 text-center'
              >
                暂无组织角色
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

function RoleProjectsTable({ projects }: { projects: UserProjectRole[] }) {
  return (
    <div className='rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>项目</TableHead>
            <TableHead>所属组织</TableHead>
            <TableHead>组织角色</TableHead>
            <TableHead>项目角色</TableHead>
            <TableHead>生效角色</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell>
                <div className='flex max-w-56 flex-col gap-1'>
                  <span className='truncate font-medium'>{project.name}</span>
                  <span className='text-muted-foreground truncate text-xs'>
                    {project.id}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className='flex max-w-56 flex-col gap-1'>
                  <span className='truncate'>{project.organizationName}</span>
                  <span className='text-muted-foreground truncate text-xs'>
                    {project.organizationId}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant='outline'>{project.organizationRole}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant='outline'>{project.projectRole}</Badge>
              </TableCell>
              <TableCell>
                <Badge>{project.effectiveRole}</Badge>
              </TableCell>
            </TableRow>
          ))}
          {projects.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className='text-muted-foreground h-20 text-center'
              >
                暂无项目角色
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

export function HelpDocs() {
  return (
    <StaticSystemPage
      title='帮助文档'
      description='汇总项目、数据集、人工评测和自动评测的使用入口。'
      icon={HelpCircle}
      items={[
        {
          label: '项目流程',
          value: '先选择组织和项目，再进入观测、数据集或评测模块。',
        },
        {
          label: '评测闭环',
          value: 'Trace 可进入数据集，数据集可驱动评测，报告问题样本可回流。',
        },
        {
          label: '后台入口',
          value: '后台管理展示服务状态，操作审计展示所有关键写操作。',
        },
        {
          label: '文档维护',
          value: '产品和技术设计文档位于 docs/prd 与 docs/superpowers。',
        },
      ]}
    />
  )
}

export function PermissionRequest() {
  return (
    <StaticSystemPage
      title='申请权限'
      description='提交组织或项目访问申请前，请确认目标组织和角色。'
      icon={ShieldCheck}
      items={[
        { label: '组织角色', value: 'OWNER、ADMIN、MEMBER、VIEWER。' },
        {
          label: '项目角色',
          value: '组织角色为 None 时，需要显式项目角色才能访问项目。',
        },
        {
          label: '处理方式',
          value: '当前由组织管理员在成员管理中添加或调整权限。',
        },
        {
          label: '审计记录',
          value: '权限变更会通过后端写操作自动进入操作审计。',
        },
      ]}
    />
  )
}
