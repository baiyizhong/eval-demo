import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { DataTable } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import {
  createProjectAnnotationQueue,
  deleteProjectAnnotationQueue,
  listProjectScoreConfigsForAnnotation,
  listProjectAnnotationQueues,
  listProjectAnnotationUsers,
  updateProjectAnnotationQueue,
} from '../api/annotation-api'
import { AnnotationExportDialog } from '../components/annotation-export-dialog'
import { createAnnotationQueueColumns } from '../components/annotation-queue-columns'
import { AnnotationQueueFormDrawer } from '../components/annotation-queue-form-drawer'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import type { AnnotationQueueFormInput, AnnotationQueueRecord } from '../types'
import {
  buildQueueToolbarFilters,
  queueToolbarFilters,
  queueUrlFilters,
} from './annotation-queue-filters'

export function ProjectAnnotationQueues() {
  const { projectId = 'project_customer_agent' } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditAnnotation = can('project:annotation:edit')
  const [formOpen, setFormOpen] = useState(false)
  const [editingQueue, setEditingQueue] =
    useState<AnnotationQueueRecord | null>(null)
  const [exportingQueue, setExportingQueue] =
    useState<AnnotationQueueRecord | null>(null)

  const invalidateQueues = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues'],
      }),
    [queryClient]
  )

  const columns = useMemo(
    () =>
      createAnnotationQueueColumns({
        projectId,
        canEdit: canEditAnnotation,
        readOnly: !canEditAnnotation,
        onEdit: (queue) => {
          if (!canEditAnnotation) return
          setEditingQueue(queue)
          setFormOpen(true)
        },
        onDelete: (queue) => {
          if (!canEditAnnotation) return
          void handleDeleteQueue($api, projectId, queue, invalidateQueues)
        },
        onExport: (queue) => {
          setExportingQueue(queue)
        },
      }),
    [$api, canEditAnnotation, invalidateQueues, projectId]
  )

  const scoreConfigsQuery = useQuery({
    queryKey: ['project-score-configs', $api, projectId],
    queryFn: () => listProjectScoreConfigsForAnnotation($api, projectId),
    enabled: formOpen,
  })
  const usersQuery = useQuery({
    queryKey: ['project-annotation-users', $api, projectId],
    queryFn: () => listProjectAnnotationUsers($api, projectId),
  })
  const toolbarFilters = useMemo(
    () => buildQueueToolbarFilters(usersQuery.data ?? []),
    [usersQuery.data]
  )

  const handleSubmitQueue = async (input: AnnotationQueueFormInput) => {
    if (!canEditAnnotation) return

    if (editingQueue) {
      await updateProjectAnnotationQueue(
        $api,
        projectId,
        editingQueue.id,
        input
      )
      toast.success('人工标注任务已更新')
    } else {
      await createProjectAnnotationQueue($api, projectId, input)
      toast.success('人工标注任务已创建')
    }
    await invalidateQueues()
  }

  const handleRefresh = async () => {
    await invalidateQueues()
    toast.success('人工标注任务已刷新')
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
              ...(canEditAnnotation
                ? [
                    {
                      id: 'create',
                      label: '新建人工标注任务',
                      icon: Plus,
                      iconPosition: 'start' as const,
                      size: 'sm' as const,
                      onClick: () => {
                        setEditingQueue(null)
                        setFormOpen(true)
                      },
                    },
                  ]
                : []),
            ],
          }}
        />
        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          <DataTable<AnnotationQueueRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-annotation-queues',
                $api,
                projectId,
                state,
              ],
              queryFn: (state) =>
                listProjectAnnotationQueues($api, projectId, state),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: queueUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '按任务名称或描述搜索',
              filters: toolbarFilters.length
                ? toolbarFilters
                : queueToolbarFilters,
              columnLabels: {
                name: '任务名称',
                description: '任务描述',
                completedCount: '已完成数量',
                pendingCount: '待处理数量',
                scoreConfigs: '评分指标',
                assignees: '候选处理人',
                createdAt: '创建时间',
              },
            }}
            loadingText={
              <Loading
                text='加载人工标注任务中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前项目下暂无匹配的人工标注任务'
            minTableWidth={1280}
          />
        </section>
      </div>
      <AnnotationQueueFormDrawer
        open={canEditAnnotation && formOpen}
        queue={editingQueue}
        scoreConfigs={scoreConfigsQuery.data ?? []}
        users={usersQuery.data ?? []}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmitQueue}
      />
      <AnnotationExportDialog
        open={Boolean(exportingQueue)}
        onOpenChange={(open) => {
          if (!open) setExportingQueue(null)
        }}
        api={$api}
        projectId={projectId}
        queueId={exportingQueue?.id ?? ''}
        scope='filtered'
        filters={{}}
      />
    </Page>
  )
}

async function handleDeleteQueue(
  $api: Parameters<typeof deleteProjectAnnotationQueue>[0],
  projectId: string,
  queue: AnnotationQueueRecord,
  onDeleted: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '删除人工标注任务',
    desc: `删除后将移除「${queue.name}」及其队列数据，不会删除源对象、历史评分或数据集项。确定继续吗？`,
    confirmText: '删除',
    destructive: true,
  })

  if (!confirmed) return

  await deleteProjectAnnotationQueue($api, projectId, queue.id)
  await onDeleted()
  toast.success(`已删除人工标注任务：${queue.name}`)
}
