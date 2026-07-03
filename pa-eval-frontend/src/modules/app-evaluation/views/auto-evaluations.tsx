import { useCallback, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Page } from '@/components/common/page'
import { DataTable } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  deleteProjectAutoEvaluationTaskMock,
  getProjectAutoEvaluationTaskSummaryMock,
  listProjectAutoEvaluationTasksMock,
  refreshProjectAutoEvaluationTasksMock,
  rerunProjectAutoEvaluationTaskMock,
} from '../api/mock-auto-evaluation-api'
import { createAutoEvaluationColumns } from '../components/auto-evaluation-columns'
import {
  AutoEvaluationSummaryCards,
  type AutoEvaluationSummaryFilter,
} from '../components/auto-evaluation-summary-cards'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import type { AutoEvaluationTaskRecord } from '../types'

export function ProjectAutoEvaluations() {
  const { projectId = 'project_customer_agent' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeFilter, setActiveFilter] =
    useState<AutoEvaluationSummaryFilter>('all')

  const invalidateTasks = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['project-auto-evaluations', projectId],
      }),
    [projectId, queryClient]
  )

  const summaryQuery = useQuery({
    queryKey: ['project-auto-evaluations', projectId, 'summary'],
    queryFn: () => getProjectAutoEvaluationTaskSummaryMock(projectId),
  })

  const columns = useMemo(
    () =>
      createAutoEvaluationColumns({
        projectId,
        onRerun: (task) => {
          void handleRerun(projectId, task, invalidateTasks)
        },
        onDelete: (task) => {
          void handleDelete(projectId, task, invalidateTasks)
        },
      }),
    [invalidateTasks, projectId]
  )

  const handleRefresh = async () => {
    const refreshed = await refreshProjectAutoEvaluationTasksMock(projectId)
    await invalidateTasks()
    await queryClient.invalidateQueries({
      queryKey: ['project-auto-evaluations', projectId, 'summary'],
    })
    toast.success(refreshed ? '已刷新运行中的自动评测任务' : '暂无运行中的任务')
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
                projectId,
                activeFilter,
                state,
              ],
              queryFn: (state) =>
                listProjectAutoEvaluationTasksMock(
                  projectId,
                  state,
                  activeFilter
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
    desc: '重新运行会基于当前 mock 配置生成新的运行记录，运行期间暂不可查看最新报告。',
    confirmText: '重新运行',
  })

  if (!confirmed) return
  await rerunProjectAutoEvaluationTaskMock(projectId, task.id)
  await onCompleted()
  toast.success(`已重新运行自动评测任务：${task.name}`)
}

async function handleDelete(
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
    desc: `删除后仅移除「${task.name}」这条前端 mock 任务，不会删除真实 trace、score 或 dataset 数据。确定继续吗？`,
    confirmText: '删除',
    destructive: true,
  })

  if (!confirmed) return
  await deleteProjectAutoEvaluationTaskMock(projectId, task.id)
  await onCompleted()
  toast.success(`已删除自动评测任务：${task.name}`)
}
