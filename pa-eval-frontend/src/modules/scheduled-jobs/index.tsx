import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
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
import { ScheduledJobTable } from './components/scheduled-job-columns'
import { ScheduledJobDrawer } from './components/scheduled-job-drawer'
import { ScheduledJobLogTable } from './components/scheduled-job-log-columns'
import {
  ScheduledJobsPageNav,
  type ScheduledJobsTab,
} from './components/scheduled-jobs-page-nav'
import type {
  ScheduledJobDatasetOption,
  ScheduledJobEvaluator,
  ScheduledJobReportTemplateOption,
  ScheduledJobTask,
} from './types'

export function ScheduledJobs() {
  const { projectId = 'project_customer_agent' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab: ScheduledJobsTab =
    searchParams.get('tab') === 'logs' ? 'logs' : 'tasks'
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledJobTask | null>(null)
  const [drawerFormKey, setDrawerFormKey] = useState(0)

  const tableQuery = useMemo(
    () => ({
      page: 1,
      pageSize: 200,
      keyword: '',
      sorting: [],
      filters: {},
    }),
    []
  )

  const tasksQuery = useQuery({
    queryKey: ['scheduled-jobs', $api, projectId, 'tasks', tableQuery],
    queryFn: () => listProjectScheduledJobs($api, projectId, tableQuery),
    refetchInterval: 3000,
  })
  const logsQuery = useQuery({
    queryKey: ['scheduled-jobs', $api, projectId, 'logs', tableQuery],
    queryFn: () => listProjectScheduledJobLogs($api, projectId, tableQuery),
    refetchInterval: 3000,
  })
  const evaluatorsQuery = useQuery({
    queryKey: ['scheduled-jobs', $api, projectId, 'evaluators'],
    queryFn: async () => {
      const response = await $api.getEvaluators<{
        datas: Array<Record<string, unknown>>
      }>({
        query: { page: 1, pageSize: 100, type: 'WORKFLOW' },
      })
      return response.datas.map(toScheduledJobEvaluator)
    },
  })
  const datasetsQuery = useQuery({
    queryKey: ['scheduled-jobs', $api, projectId, 'datasets'],
    queryFn: async () => {
      const response = await $api.getProjectDatasets<{
        datas: Array<Record<string, unknown>>
      }>({
        path: { projectId },
        query: { page: 1, pageSize: 100 },
      })
      return response.datas.map((dataset) =>
        toScheduledJobDataset(dataset, projectId)
      )
    },
  })
  const reportTemplatesQuery = useQuery({
    queryKey: ['scheduled-jobs', $api, projectId, 'report-templates'],
    queryFn: async () => {
      const response = await $api.getEvaluationReportTemplates<{
        datas: Array<Record<string, unknown>>
      }>({
        path: { projectId },
        query: { page: 1, pageSize: 100 },
      })
      return response.datas.map(toScheduledJobReportTemplate)
    },
  })
  const tasks = tasksQuery.data?.datas ?? []
  const logs = logsQuery.data?.datas ?? []

  const invalidateScheduledJobs = useCallback(async () => {
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'scheduled-jobs' &&
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
    setEditingTask(null)
    setDrawerFormKey((key) => key + 1)
    setDrawerOpen(true)
  }

  const handleEditTask = (task: ScheduledJobTask) => {
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
    const isExisting = tasks.some((row) => row.id === task.id)
    void saveScheduledJob($api, projectId, task, isExisting).then(async () => {
      await invalidateScheduledJobs()
      toast.success('定时任务已保存')
    })
  }

  const handlePauseTask = (task: ScheduledJobTask) => {
    void pauseProjectScheduledJob($api, projectId, task.id).then(async () => {
      await invalidateScheduledJobs()
      toast.success('定时任务已暂停')
    })
  }

  const handleResumeTask = (task: ScheduledJobTask) => {
    void resumeProjectScheduledJob($api, projectId, task.id).then(async () => {
      await invalidateScheduledJobs()
      toast.success('定时任务已恢复')
    })
  }

  const handleRunManually = (task: ScheduledJobTask) => {
    void runProjectScheduledJob($api, projectId, task.id).then(async () => {
      await invalidateScheduledJobs()
      setActiveTab('logs')
      toast.success('已手动执行定时任务')
    })
  }

  const handleTriggerJob = (task: ScheduledJobTask) => {
    void triggerProjectScheduledJob($api, projectId, task.id).then(async () => {
      await invalidateScheduledJobs()
      setActiveTab('logs')
      toast.success('已触发 JOB 执行')
    })
  }

  const handleDeleteTask = (task: ScheduledJobTask) => {
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
          onCreate={handleCreateTask}
          onRefresh={refresh}
        />
        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          {activeTab === 'tasks' ? (
            <ScheduledJobTable
              tasks={tasks}
              onEdit={handleEditTask}
              onPause={handlePauseTask}
              onResume={handleResumeTask}
              onRunManually={handleRunManually}
              onTriggerJob={handleTriggerJob}
              onDelete={handleDeleteTask}
            />
          ) : (
            <ScheduledJobLogTable logs={logs} />
          )}
        </section>
        <ScheduledJobDrawer
          key={drawerFormKey}
          projectId={projectId}
          open={drawerOpen}
          task={editingTask}
          evaluators={evaluatorsQuery.data}
          datasets={datasetsQuery.data}
          reportTemplates={reportTemplatesQuery.data}
          onOpenChange={handleDrawerOpenChange}
          onSave={handleSaveTask}
        />
      </div>
    </Page>
  )
}

function toScheduledJobEvaluator(
  item: Record<string, unknown>
): ScheduledJobEvaluator {
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    provider: item.provider === 'N8N' ? 'N8N' : 'DIFY',
    description: String(item.description ?? ''),
    variables: Array.isArray(item.variables)
      ? item.variables.map((variable) => String(variable))
      : [],
    updatedAt: String(item.updatedAt ?? ''),
  }
}

function toScheduledJobDataset(
  item: Record<string, unknown>,
  projectId: string
): ScheduledJobDatasetOption {
  return {
    id: String(item.id ?? ''),
    projectId: String(item.projectId ?? projectId),
    name: String(item.name ?? ''),
    description: String(item.description ?? ''),
    estimatedCount: Number(item.itemCount ?? item.estimatedCount ?? 0),
    updatedAt: String(item.updatedAt ?? ''),
  }
}

function toScheduledJobReportTemplate(
  item: Record<string, unknown>
): ScheduledJobReportTemplateOption {
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    description: String(item.description ?? ''),
    isDefault: Boolean(item.isDefault),
  }
}

function toScheduledJobInput(task: ScheduledJobTask): ScheduledJobInput {
  return {
    taskType: task.type,
    name: task.name,
    description: task.description,
    scoreName: task.scoreName,
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
