import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import {
  deleteProjectAutoEvaluationTask,
  getProjectAutoEvaluationLatestReport,
  getProjectAutoEvaluationTask,
  listProjectAutoEvaluationRuns,
  rerunProjectAutoEvaluationTask,
} from '../api/auto-evaluation-api'
import { AutoEvaluationReportCard } from '../components/auto-evaluation-report-card'
import { AutoEvaluationRunRecords } from '../components/auto-evaluation-run-records'
import { AutoEvaluationStatusBadge } from '../components/auto-evaluation-status-badge'
import { formatDateTime } from '../components/format'

export function ProjectAutoEvaluationDetail() {
  const { projectId = 'project_customer_agent', taskId = '' } = useParams()
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditAutoEvaluation = can('project:auto-evaluation:edit')

  const taskQuery = useQuery({
    queryKey: ['project-auto-evaluation', $api, projectId, taskId],
    queryFn: () => getProjectAutoEvaluationTask($api, projectId, taskId),
    enabled: Boolean(taskId),
    refetchInterval: (query) =>
      query.state.data?.status === 'RUNNING' ? 5000 : false,
  })
  const reportQuery = useQuery({
    queryKey: [
      'project-auto-evaluation-latest-report',
      $api,
      projectId,
      taskId,
    ],
    queryFn: () =>
      getProjectAutoEvaluationLatestReport($api, projectId, taskId),
    enabled: Boolean(taskId),
    refetchInterval: taskQuery.data?.status === 'RUNNING' ? 5000 : false,
  })
  const runsQuery = useQuery({
    queryKey: ['project-auto-evaluation-runs', $api, projectId, taskId],
    queryFn: () => listProjectAutoEvaluationRuns($api, projectId, taskId),
    enabled: Boolean(taskId),
    refetchInterval: taskQuery.data?.status === 'RUNNING' ? 5000 : false,
  })

  const invalidateDetail = useMemo(
    () => async () => {
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'project-auto-evaluation' &&
          query.queryKey.includes(projectId) &&
          query.queryKey.includes(taskId),
      })
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'project-auto-evaluation-latest-report' &&
          query.queryKey.includes(projectId) &&
          query.queryKey.includes(taskId),
      })
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'project-auto-evaluation-runs' &&
          query.queryKey.includes(projectId) &&
          query.queryKey.includes(taskId),
      })
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'project-auto-evaluations' &&
          query.queryKey.includes(projectId),
      })
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'project-auto-evaluation-summary' &&
          query.queryKey.includes(projectId),
      })
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'project-evaluation-reports' &&
          query.queryKey.includes(projectId),
      })
    },
    [projectId, queryClient, taskId]
  )

  const task = taskQuery.data

  const handleRefresh = async () => {
    await invalidateDetail()
    toast.success('自动评测任务状态已刷新')
  }

  const handleRerun = async () => {
    if (!canEditAutoEvaluation) return
    if (!task) return
    if (task.status === 'RUNNING') {
      toast.warning('任务已在运行中')
      return
    }
    const confirmed = await confirm({
      title: '确认重新运行该自动评测任务？',
      desc: `将基于「${task.name}」当前配置重新创建运行记录并生成报告。确定继续吗？`,
      confirmText: '重新运行',
    })
    if (!confirmed) return
    const newTask = await rerunProjectAutoEvaluationTask($api, projectId, task.id)
    await invalidateDetail()
    toast.success('已创建新的自动评测任务并开始运行')
    navigate(`/projects/${projectId}/evaluation/auto-evaluations/${newTask.id}`)
  }

  const handleDelete = async () => {
    if (!canEditAutoEvaluation) return
    if (!task) return
    if (task.status === 'RUNNING') {
      toast.warning('任务运行中，暂不支持删除')
      return
    }
    const confirmed = await confirm({
      title: '删除自动评测任务',
      desc: `删除后将隐藏「${task.name}」及其关联评测报告，不会删除原始数据集。确定继续吗？`,
      confirmText: '删除',
      destructive: true,
    })
    if (!confirmed) return
    await deleteProjectAutoEvaluationTask($api, projectId, task.id)
    await invalidateDetail()
    toast.success('自动评测任务已删除')
    navigate(`/projects/${projectId}/evaluation/auto-evaluations`)
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
        <PageAction
          showBackButton
          onBack={() =>
            navigate(`/projects/${projectId}/evaluation/auto-evaluations`)
          }
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
              ...(canEditAutoEvaluation
                ? [
                    {
                      id: 'rerun',
                      label: '重新运行',
                      icon: RotateCcw,
                      iconPosition: 'start' as const,
                      variant: 'outline' as const,
                      size: 'sm' as const,
                      disabled: !task || task.status === 'RUNNING',
                      onClick: () => void handleRerun(),
                    },
                    {
                      id: 'delete',
                      label: '删除',
                      icon: Trash2,
                      iconPosition: 'start' as const,
                      variant: 'destructive' as const,
                      size: 'sm' as const,
                      disabled: !task,
                      onClick: () => void handleDelete(),
                    },
                  ]
                : []),
            ],
          }}
        />
        {taskQuery.isLoading ? (
          <Loading text='加载自动评测详情中...' full />
        ) : task ? (
          <>
            <section className='grid gap-3 md:grid-cols-4'>
              <MetricCard label='样本数' value={task.dataSource.sampleCount} />
              <MetricCard
                label='已完成'
                value={task.executionStats.completed}
              />
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
                  <Info
                    label='创建时间'
                    value={formatDateTime(task.createdAt)}
                  />
                  <Info
                    label='最近运行'
                    value={
                      task.lastRunAt ? formatDateTime(task.lastRunAt) : '-'
                    }
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
        <CardTitle className='text-muted-foreground text-sm'>{label}</CardTitle>
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
