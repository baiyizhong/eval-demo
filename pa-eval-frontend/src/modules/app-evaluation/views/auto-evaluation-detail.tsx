import { useMemo } from 'react'
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { Loading } from '@/components/common/loading'
import {
  deleteProjectAutoEvaluationTaskMock,
  getProjectAutoEvaluationLatestReportMock,
  getProjectAutoEvaluationTaskMock,
  listProjectAutoEvaluationRunsMock,
  refreshProjectAutoEvaluationTaskMock,
  rerunProjectAutoEvaluationTaskMock,
} from '../api/mock-auto-evaluation-api'
import { AutoEvaluationReportCard } from '../components/auto-evaluation-report-card'
import { AutoEvaluationRunRecords } from '../components/auto-evaluation-run-records'
import { AutoEvaluationStatusBadge } from '../components/auto-evaluation-status-badge'
import { formatDateTime } from '../components/format'

export function ProjectAutoEvaluationDetail() {
  const { projectId = 'project_customer_agent', taskId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const taskQuery = useQuery({
    queryKey: ['project-auto-evaluation', projectId, taskId],
    queryFn: () => getProjectAutoEvaluationTaskMock(projectId, taskId),
    enabled: Boolean(taskId),
  })
  const reportQuery = useQuery({
    queryKey: ['project-auto-evaluation-latest-report', projectId, taskId],
    queryFn: () => getProjectAutoEvaluationLatestReportMock(projectId, taskId),
    enabled: Boolean(taskId),
  })
  const runsQuery = useQuery({
    queryKey: ['project-auto-evaluation-runs', projectId, taskId],
    queryFn: () => listProjectAutoEvaluationRunsMock(projectId, taskId),
    enabled: Boolean(taskId),
  })

  const invalidateDetail = useMemo(
    () => async () => {
      await queryClient.invalidateQueries({
        queryKey: ['project-auto-evaluation', projectId, taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['project-auto-evaluation-latest-report', projectId, taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['project-auto-evaluation-runs', projectId, taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['project-auto-evaluations', projectId],
      })
    },
    [projectId, queryClient, taskId]
  )

  const task = taskQuery.data

  const handleRefresh = async () => {
    await refreshProjectAutoEvaluationTaskMock(projectId, taskId)
    await invalidateDetail()
    toast.success('自动评测任务状态已刷新')
  }

  const handleRerun = async () => {
    if (!task) return
    const confirmed = await confirm({
      title: '确认重新运行该自动评测任务？',
      desc: '重新运行会基于当前 mock 配置生成新的运行记录，运行期间暂不可查看最新报告。',
      confirmText: '重新运行',
    })
    if (!confirmed) return
    await rerunProjectAutoEvaluationTaskMock(projectId, task.id)
    await invalidateDetail()
    toast.success(`已重新运行自动评测任务：${task.name}`)
  }

  const handleDelete = async () => {
    if (!task) return
    if (task.status === 'RUNNING') {
      toast.warning('任务运行中，暂不支持删除')
      return
    }
    const confirmed = await confirm({
      title: '删除自动评测任务',
      desc: `删除后仅移除「${task.name}」这条前端 mock 任务，不会删除真实 trace、score 或 dataset 数据。确定继续吗？`,
      confirmText: '删除',
      destructive: true,
    })
    if (!confirmed) return
    await deleteProjectAutoEvaluationTaskMock(projectId, task.id)
    await queryClient.invalidateQueries({
      queryKey: ['project-auto-evaluations', projectId],
    })
    toast.success(`已删除自动评测任务：${task.name}`)
    navigate(`/projects/${projectId}/evaluation/auto-evaluations`)
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
        <PageAction
          showBackButton
          onBack={() => navigate(`/projects/${projectId}/evaluation/auto-evaluations`)}
          buttonGroups={{
            buttons: [
              {
                id: 'refresh',
                label: '刷新',
                icon: RefreshCw,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => void handleRefresh(),
              },
              {
                id: 'rerun',
                label: '重新运行',
                icon: RotateCcw,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                disabled: !task || task.status === 'RUNNING',
                onClick: () => void handleRerun(),
              },
              {
                id: 'delete',
                label: '删除',
                icon: Trash2,
                iconPosition: 'start',
                variant: 'destructive',
                size: 'sm',
                disabled: !task,
                onClick: () => void handleDelete(),
              },
            ],
          }}
        />
        {taskQuery.isLoading ? (
          <Loading text='加载自动评测详情中...' full />
        ) : task ? (
          <>
            <section className='grid gap-3 md:grid-cols-4'>
              <MetricCard label='样本数' value={task.dataSource.sampleCount} />
              <MetricCard label='已完成' value={task.executionStats.completed} />
              <MetricCard label='失败' value={task.executionStats.failed} />
              <MetricCard label='Badcase' value={task.badcaseCount} />
            </section>
            <section className='grid gap-4 xl:grid-cols-[1fr_420px]'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    {task.name}
                    <AutoEvaluationStatusBadge status={task.status} />
                  </CardTitle>
                </CardHeader>
                <CardContent className='grid gap-4 md:grid-cols-2'>
                  <Info label='任务描述' value={task.description} />
                  <Info label='Score Name' value={task.scoreName} />
                  <Info label='评估器' value={task.evaluator.name} />
                  <Info label='数据源' value={task.dataSource.name} />
                  <Info label='采样率' value={`${task.sampleRate}%`} />
                  <Info label='创建人' value={task.createdBy} />
                  <Info label='创建时间' value={formatDateTime(task.createdAt)} />
                  <Info
                    label='最近运行'
                    value={task.lastRunAt ? formatDateTime(task.lastRunAt) : '-'}
                  />
                </CardContent>
              </Card>
              <AutoEvaluationReportCard
                projectId={projectId}
                task={task}
                report={reportQuery.data ?? null}
              />
            </section>
            <AutoEvaluationRunRecords runs={runsQuery.data ?? []} />
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>自动评测任务不存在</CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>
    </Page>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm text-muted-foreground'>{label}</CardTitle>
      </CardHeader>
      <CardContent className='text-2xl font-semibold'>{value}</CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className='text-sm'>{value}</span>
    </div>
  )
}
