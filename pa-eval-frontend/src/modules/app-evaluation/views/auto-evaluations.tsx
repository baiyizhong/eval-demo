import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { DataTable } from '@/components/common/data-table'
import { Drawer } from '@/components/common/drawer'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import {
  deleteProjectAutoEvaluationTask,
  listProjectAutoEvaluationTasks,
  rerunProjectAutoEvaluationTask,
} from '../api/auto-evaluation-api'
import { createAutoEvaluationColumns } from '../components/auto-evaluation-columns'
import { AutoEvaluationTaskForm } from '../components/auto-evaluation-task-form'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import {
  autoEvaluationStatusLabels,
  type AutoEvaluationTaskRecord,
} from '../types'

export function ProjectAutoEvaluations() {
  const { projectId = 'project_customer_agent' } = useParams()
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditAutoEvaluation = can('project:auto-evaluation:edit')
  const [createOpen, setCreateOpen] = useState(false)

  const invalidateTasks = useCallback(async () => {
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
  }, [projectId, queryClient])

  const columns = useMemo(
    () =>
      createAutoEvaluationColumns({
        projectId,
        readOnly: !canEditAutoEvaluation,
        onRerun: (task) => {
          if (!canEditAutoEvaluation) return
          void handleRerun($api, projectId, task, invalidateTasks)
        },
        onDelete: (task) => {
          if (!canEditAutoEvaluation) return
          void handleDelete($api, projectId, task, invalidateTasks)
        },
      }),
    [$api, canEditAutoEvaluation, invalidateTasks, projectId]
  )

  const handleRefresh = async () => {
    await invalidateTasks()
    toast.success('自动评测任务已刷新')
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav
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
                      id: 'create',
                      label: '新建自动评测',
                      icon: Plus,
                      iconPosition: 'start' as const,
                      size: 'sm' as const,
                      onClick: () => setCreateOpen(true),
                    },
                  ]
                : []),
            ],
          }}
        />
        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          <DataTable<AutoEvaluationTaskRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-auto-evaluations',
                $api,
                projectId,
                state,
              ],
              queryFn: (state) =>
                listProjectAutoEvaluationTasks($api, projectId, state),
              refetchInterval: 3000,
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: [{ fieldId: 'status', type: 'array' }],
            }}
            toolbar={{
              searchPlaceholder: '搜索任务名称',
              filters: [
                {
                  fieldId: 'status',
                  title: '状态',
                  options: [
                    { label: autoEvaluationStatusLabels.RUNNING, value: 'RUNNING' },
                    {
                      label: autoEvaluationStatusLabels.COMPLETED,
                      value: 'COMPLETED',
                    },
                    { label: autoEvaluationStatusLabels.FAILED, value: 'FAILED' },
                    { label: autoEvaluationStatusLabels.DRAFT, value: 'DRAFT' },
                    { label: autoEvaluationStatusLabels.READY, value: 'READY' },
                    {
                      label: autoEvaluationStatusLabels.CANCELLED,
                      value: 'CANCELLED',
                    },
                  ],
                },
              ],
              columnLabels: {
                name: '任务名称',
                status: '状态',
                evaluator: '评估器',
                dataSource: '数据源',
                sampleRate: '采样率',
                executionResult: '执行结果',
                badcaseCount: 'Badcase',
                lastRunAt: '最近运行',
                createdBy: '创建人',
              },
            }}
            loadingText={
              <Loading
                text='加载自动评测任务中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前项目下暂无匹配的自动评测任务'
            minTableWidth={1280}
          />
        </section>
      </div>
      <Drawer
        open={canEditAutoEvaluation && createOpen}
        onOpenChange={setCreateOpen}
        mode='enhanced'
        title='新建自动评测'
        showOverlay={true}
        showConfirm={false}
        cancelText='关闭'
        contentProps={{ className: 'overflow-y-auto' }}
      >
        <div className='p-4'>
          <AutoEvaluationTaskForm
            projectId={projectId}
            onCompleted={(taskId, mode) => {
              setCreateOpen(false)
              void invalidateTasks()
              if (mode === 'run') {
                navigate(
                  `/projects/${projectId}/evaluation/auto-evaluations/${taskId}`
                )
              }
            }}
          />
        </div>
      </Drawer>
    </Page>
  )
}

async function handleRerun(
  api: Parameters<typeof rerunProjectAutoEvaluationTask>[0],
  projectId: string,
  task: AutoEvaluationTaskRecord,
  onCompleted: () => Promise<unknown>
) {
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
  await rerunProjectAutoEvaluationTask(api, projectId, task.id)
  await onCompleted()
  toast.success('已创建新的自动评测任务并开始运行')
}

async function handleDelete(
  api: Parameters<typeof deleteProjectAutoEvaluationTask>[0],
  projectId: string,
  task: AutoEvaluationTaskRecord,
  onCompleted: () => Promise<unknown>
) {
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
  await deleteProjectAutoEvaluationTask(api, projectId, task.id)
  await onCompleted()
  toast.success('自动评测任务已删除')
}
