import { useMemo, useState, type PropsWithChildren } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Database,
  FileClock,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loading } from '@/components/common/loading'

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
  recentAuditLogs: AuditLogRecord[]
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

function MetricCard({
  title,
  value,
  description,
}: {
  title: string
  value: string | number
  description: string
}) {
  return (
    <Card className='rounded-md'>
      <CardHeader className='pb-2'>
        <CardDescription>{title}</CardDescription>
        <CardTitle className='text-2xl'>{value}</CardTitle>
      </CardHeader>
      <CardContent className='text-muted-foreground text-xs'>
        {description}
      </CardContent>
    </Card>
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
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const pageSize = 10
  const query = useMemo(
    () => ({
      page,
      pageSize,
      keyword: keyword.trim() || undefined,
      status: status === 'ALL' ? undefined : status,
      action: action === 'ALL' ? undefined : action,
      createdFrom: toIsoDateTime(createdFrom),
      createdTo: toIsoDateTime(createdTo),
    }),
    [action, createdFrom, createdTo, keyword, page, status]
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
      <Card className='rounded-md'>
        <CardContent className='flex flex-wrap items-center gap-2 p-3'>
          <Input
            className='h-9 min-w-64 flex-1'
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
          <Input
            className='h-9 w-full sm:w-44'
            type='datetime-local'
            value={createdFrom}
            onChange={(event) => {
              setCreatedFrom(event.target.value)
              setPage(1)
            }}
            aria-label='开始时间'
          />
          <span className='text-muted-foreground hidden text-xs sm:inline'>
            至
          </span>
          <Input
            className='h-9 w-full sm:w-44'
            type='datetime-local'
            value={createdTo}
            onChange={(event) => {
              setCreatedTo(event.target.value)
              setPage(1)
            }}
            aria-label='结束时间'
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-9'
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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

export function BackendManagement() {
  const $api = useAPI()
  const overviewQuery = useQuery({
    queryKey: ['admin-overview', $api],
    queryFn: () => $api.getAdminOverview<AdminOverview>(),
  })
  const overview = overviewQuery.data

  return (
    <SystemPageShell
      title='后台管理'
      description='查看 Plus 层服务、Langfuse 数据库连接、核心资源规模和最近写操作。'
      icon={Database}
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
            <MetricCard
              title='服务状态'
              value={overview.service.status}
              description={overview.service.name}
            />
            <MetricCard
              title='数据库连接'
              value={overview.database.connected ? 'connected' : 'offline'}
              description={
                overview.database.configured ? '已配置连接' : '未配置连接'
              }
            />
            <MetricCard
              title='组织'
              value={overview.metrics.organizations}
              description='Langfuse organizations'
            />
            <MetricCard
              title='项目'
              value={overview.metrics.projects}
              description={`活跃 ${overview.metrics.activeProjects} / 归档 ${overview.metrics.archivedProjects}`}
            />
            <MetricCard
              title='用户'
              value={overview.metrics.users}
              description='Langfuse users'
            />
            <MetricCard
              title='审计日志'
              value={overview.metrics.auditLogs}
              description='PA audit logs'
            />
          </div>

          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='text-base'>最近操作</CardTitle>
              <CardDescription>展示最近 5 条 PA 写操作审计。</CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLogTable logs={overview.recentAuditLogs} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </SystemPageShell>
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
