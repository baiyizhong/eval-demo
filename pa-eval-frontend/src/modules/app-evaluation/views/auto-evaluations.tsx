import { useCallback, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { confirm } from '@/lib/confirm'
import { Page } from '@/components/common/page'
import { DataTable } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  deleteProjectAutoEvaluationTask,
  getProjectAutoEvaluationTaskSummary,
  listProjectAutoEvaluationTasks,
} from '../api/auto-evaluation-api'
import { createAutoEvaluationColumns } from '../components/auto-evaluation-columns'
import {
  AutoEvaluationSummaryCards,
  type AutoEvaluationSummaryFilter,
} from '../components/auto-evaluation-summary-cards'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import type { AutoEvaluationTaskRecord } from '../types'

export function ProjectAutoEvaluations() {
  const { projectId = 'project_customer_agent' } = useParams()
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeFilter, setActiveFilter] =
    useState<AutoEvaluationSummaryFilter>('all')

  const invalidateTasks = useCallback(
    async () => {
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
    },
    [projectId, queryClient]
  )

  const summaryQuery = useQuery({
    queryKey: ['project-auto-evaluations', $api, projectId, 'summary'],
    queryFn: () => getProjectAutoEvaluationTaskSummary($api, projectId),
  })

  const columns = useMemo(
    () =>
      createAutoEvaluationColumns({
        projectId,
        onRerun: (task) => {
          void handleRerun(task)
        },
        onDelete: (task) => {
          void handleDelete($api, projectId, task, invalidateTasks)
        },
      }),
    [$api, invalidateTasks, projectId]
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
              {
                id: 'create',
                label: '新建自动评测',
                icon: Plus,
                iconPosition: 'start',
                size: 'sm',
                onClick: () =>
                  navigate(
                    `/projects/${projectId}/evaluation/auto-evaluations/new`
                  ),
              },
            ],
          }}
        />
        <AutoEvaluationSummaryCards
          summary={
            summaryQuery.data ?? {
              total: 0,
              running: 0,
              completed: 0,
              failed: 0,
              notStarted: 0,
              badcase: 0,
            }
          }
          active={activeFilter}
          onChange={setActiveFilter}
        />
        <section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable<AutoEvaluationTaskRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-auto-evaluations',
                $api,
                projectId,
                activeFilter,
                state,
              ],
              queryFn: (state) =>
                listProjectAutoEvaluationTasks(
                  $api,
                  projectId,
                  state
                ),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
            }}
            toolbar={{
              searchPlaceholder: '搜索任务名称',
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
    </Page>
  )
}

async function handleRerun(
  task: AutoEvaluationTaskRecord
) {
  if (task.status === 'RUNNING') {
    toast.warning('任务已在运行中')
    return
  }

  await confirm({
    title: '确认重新运行该自动评测任务？',
    desc: '当前真实自动评测任务暂未接入重新运行接口。',
    confirmText: '知道了',
  })
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
