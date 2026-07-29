import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listAvailableScenes } from '@/modules/scene-experiments/api/scene-experiment-api'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import type { DataTableQueryState } from '@/components/common/data-table'
import { Page } from '@/components/common/page'
import {
  createProjectScheduledJob,
  deleteProjectScheduledJob,
  listProjectScheduledJobLogs,
  listProjectScheduledJobs,
  pauseProjectScheduledJob,
  resumeProjectScheduledJob,
  runProjectScheduledJob,
  triggerProjectScheduledJob,
  updateProjectScheduledJob,
  type ScheduledJobInput,
} from './api/scheduled-jobs-api'
import { ScheduledExperimentLogTable } from './components/scheduled-experiment-log-columns'
import { ScheduledJobTable } from './components/scheduled-job-columns'
import { ScheduledJobDrawer } from './components/scheduled-job-drawer'
import { ScheduledJobLogTable } from './components/scheduled-job-log-columns'
import {
  ScheduledJobsPageNav,
  type ScheduledJobsTab,
} from './components/scheduled-jobs-page-nav'
import { scheduledJobMockAutoEvaluationTasks } from './mock-data'
import type { ScheduledJobTask } from './types'

export function ScheduledJobs() {
  const { projectId = 'project_customer_agent' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: ScheduledJobsTab =
    tabParam === 'experiment-logs'
      ? 'experiment-logs'
      : tabParam === 'auto-evaluation-logs' || tabParam === 'logs'
        ? 'auto-evaluation-logs'
        : 'tasks'
  const basePath = useMemo(
    () => `/projects/${projectId}/scheduled-jobs`,
    [projectId]
  )
  const setActiveTab = useCallback(
    (tab: ScheduledJobsTab) => {
      setSearchParams({ tab })
    },
    [setSearchParams]
  )

  return (
    <ScheduledJobsProject
      key={projectId}
      activeTab={activeTab}
      basePath={basePath}
      projectId={projectId}
      setActiveTab={setActiveTab}
    />
  )
}

type ScheduledJobsProjectProps = {
  activeTab: ScheduledJobsTab
  basePath: string
  projectId: string
  setActiveTab: (tab: ScheduledJobsTab) => void
}

function ScheduledJobsProject({
  activeTab,
  basePath,
  projectId,
  setActiveTab,
}: ScheduledJobsProjectProps) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditScheduledJobs = can('project:scheduled-job:edit')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledJobTask | null>(null)
  const [drawerFormKey, setDrawerFormKey] = useState(0)

  const scenesQuery = useQuery({
    queryKey: ['scheduled-jobs', $api, projectId, 'available-scenes'],
    queryFn: () => listAvailableScenes($api, projectId),
  })
  const autoEvaluationTaskOptions = useMemo(
    () =>
      scheduledJobMockAutoEvaluationTasks.map((task) => ({
        ...task,
        projectId,
      })),
    [projectId]
  )

  const taskTableRequest = useMemo(
    () => ({
      queryKey: (state: DataTableQueryState) =>
        ['scheduled-job-tasks', $api, projectId, state] as const,
      queryFn: (state: DataTableQueryState) =>
        listProjectScheduledJobs($api, projectId, state),
    }),
    [$api, projectId]
  )
  const logTableRequest = useMemo(
    () => ({
      queryKey: (state: DataTableQueryState) =>
        ['scheduled-job-logs', $api, projectId, state] as const,
      queryFn: (state: DataTableQueryState) =>
        listProjectScheduledJobLogs($api, projectId, state),
    }),
    [$api, projectId]
  )

  const invalidateScheduledJobs = useCallback(async () => {
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'scheduled-jobs' &&
        query.queryKey.includes(projectId),
    })
    await queryClient.invalidateQueries({
      predicate: (query) =>
        (query.queryKey[0] === 'scheduled-job-tasks' ||
          query.queryKey[0] === 'scheduled-job-logs') &&
        query.queryKey.includes(projectId),
    })
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'project-auto-evaluations' &&
        query.queryKey.includes(projectId),
    })
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'project-evaluation-reports' &&
        query.queryKey.includes(projectId),
    })
  }, [projectId, queryClient])

  const refresh = useCallback(() => {
    void invalidateScheduledJobs().then(() => {
      toast.success('定时任务数据已刷新')
    })
  }, [invalidateScheduledJobs])

  const handleCreateTask = () => {
    if (!canEditScheduledJobs) return

    setEditingTask(null)
    setDrawerFormKey((key) => key + 1)
    setDrawerOpen(true)
  }

  const handleEditTask = (task: ScheduledJobTask) => {
    if (!canEditScheduledJobs) return

    setEditingTask(task)
    setDrawerFormKey((key) => key + 1)
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditingTask(null)
  }

  const handleDrawerOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDrawerOpen(true)
      return
    }

    closeDrawer()
  }

  const handleSaveTask = (task: ScheduledJobTask) => {
    if (!canEditScheduledJobs) return

    const isExisting = Boolean(editingTask)
    void saveScheduledJob($api, projectId, task, isExisting).then(async () => {
      await invalidateScheduledJobs()
      toast.success('定时任务已保存')
    })
  }

  const handlePauseTask = (task: ScheduledJobTask) => {
    if (!canEditScheduledJobs) return

    void pauseProjectScheduledJob($api, projectId, task.id).then(async () => {
      await invalidateScheduledJobs()
      toast.success('定时任务已暂停')
    })
  }

  const handleResumeTask = (task: ScheduledJobTask) => {
    if (!canEditScheduledJobs) return

    void resumeProjectScheduledJob($api, projectId, task.id).then(async () => {
      await invalidateScheduledJobs()
      toast.success('定时任务已恢复')
    })
  }

  const handleRunManually = (task: ScheduledJobTask) => {
    if (!canEditScheduledJobs) return

    void runProjectScheduledJob($api, projectId, task.id).then(async () => {
      await invalidateScheduledJobs()
      setActiveTab(
        task.type === 'RUN_EXPERIMENT'
          ? 'experiment-logs'
          : 'auto-evaluation-logs'
      )
      toast.success('已手动执行定时任务')
    })
  }

  const handleTriggerJob = (task: ScheduledJobTask) => {
    if (!canEditScheduledJobs) return

    void triggerProjectScheduledJob($api, projectId, task.id).then(async () => {
      await invalidateScheduledJobs()
      setActiveTab(
        task.type === 'RUN_EXPERIMENT'
          ? 'experiment-logs'
          : 'auto-evaluation-logs'
      )
      toast.success('已触发 JOB 执行')
    })
  }

  const handleDeleteTask = (task: ScheduledJobTask) => {
    if (!canEditScheduledJobs) return

    void confirm({
      title: '删除定时任务',
      desc: `删除后将移除「${task.name}」的调度配置，已生成的自动评测任务和报告仍保留。确定继续吗？`,
      confirmText: '删除',
      destructive: true,
    }).then(async (confirmed) => {
      if (!confirmed) return
      await deleteProjectScheduledJob($api, projectId, task.id)
      await invalidateScheduledJobs()
      toast.success('定时任务已删除')
    })
  }

  return (
    <Page fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <ScheduledJobsPageNav
          activeTab={activeTab}
          basePath={basePath}
          canCreate={canEditScheduledJobs}
          onCreate={handleCreateTask}
          onRefresh={refresh}
        />
        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          {activeTab === 'tasks' ? (
            <ScheduledJobTable
              request={taskTableRequest}
              readOnly={!canEditScheduledJobs}
              onEdit={handleEditTask}
              onPause={handlePauseTask}
              onResume={handleResumeTask}
              onRunManually={handleRunManually}
              onTriggerJob={handleTriggerJob}
              onDelete={handleDeleteTask}
            />
          ) : activeTab === 'auto-evaluation-logs' ? (
            <ScheduledJobLogTable request={logTableRequest} />
          ) : (
            <ScheduledExperimentLogTable projectId={projectId} />
          )}
        </section>
        <ScheduledJobDrawer
          key={drawerFormKey}
          projectId={projectId}
          open={canEditScheduledJobs && drawerOpen}
          task={editingTask}
          autoEvaluationTasks={autoEvaluationTaskOptions}
          scenes={scenesQuery.data?.datas}
          scenesLoading={scenesQuery.isPending}
          onOpenChange={handleDrawerOpenChange}
          onSave={handleSaveTask}
        />
      </div>
    </Page>
  )
}

function toScheduledJobInput(task: ScheduledJobTask): ScheduledJobInput {
  return {
    taskType: task.type,
    binding: task.binding,
    name: task.name,
    description: task.description,
    scoreName: task.scoreName,
    scoreMapping: task.scoreMapping ?? {},
    runMode: task.runMode,
    frequency: task.frequency,
    evaluatorId: task.evaluator.id,
    variableMapping: task.variableMapping,
    dataSource: task.dataSource,
    sampleRate: task.sampleRate,
    reportTemplateId: task.reportTemplateId,
    badcase: task.badcase,
  }
}

function saveScheduledJob(
  api: Parameters<typeof createProjectScheduledJob>[0],
  projectId: string,
  task: ScheduledJobTask,
  isExisting: boolean
) {
  const input = toScheduledJobInput(task)
  if (isExisting) {
    return updateProjectScheduledJob(api, projectId, task.id, input)
  }

  return createProjectScheduledJob(api, projectId, input)
}
