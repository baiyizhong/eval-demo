import { useCallback, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Page } from '@/components/common/page'
import {
  DataTable,
  type DataTableFilterBinding,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  createProjectAnnotationQueueMock,
  deleteProjectAnnotationQueueMock,
  listProjectAnnotationQueuesMock,
  updateProjectAnnotationQueueMock,
} from '../api/mock-annotation-api'
import { AnnotationQueueFormDrawer } from '../components/annotation-queue-form-drawer'
import { createAnnotationQueueColumns } from '../components/annotation-queue-columns'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import type { AnnotationQueueFormInput, AnnotationQueueRecord } from '../types'

const queueUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'assigneeIds', type: 'array' },
  { fieldId: 'pendingState', type: 'array' },
]

const queueToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'pendingState',
    title: '处理状态',
    options: [
      { label: '包含待处理', value: 'hasPending' },
      { label: '全部完成', value: 'completed' },
    ],
  },
  {
    columnId: 'assigneeIds',
    title: '处理人',
    options: [
      { label: '张三', value: 'user_annotator_a' },
      { label: '李四', value: 'user_annotator_b' },
    ],
  },
]

export function ProjectAnnotationQueues() {
  const { projectId = 'project_customer_agent' } = useParams()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingQueue, setEditingQueue] =
    useState<AnnotationQueueRecord | null>(null)

  const invalidateQueues = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['project-annotation-queues', projectId],
      }),
    [projectId, queryClient]
  )

  const columns = useMemo(
    () =>
      createAnnotationQueueColumns({
        projectId,
        onEdit: (queue) => {
          setEditingQueue(queue)
          setFormOpen(true)
        },
        onDelete: (queue) => {
          void handleDeleteQueue(projectId, queue, invalidateQueues)
        },
      }),
    [invalidateQueues, projectId]
  )

  const handleSubmitQueue = async (input: AnnotationQueueFormInput) => {
    if (editingQueue) {
      await updateProjectAnnotationQueueMock(projectId, editingQueue.id, input)
      toast.success('人工评测任务已更新')
    } else {
      await createProjectAnnotationQueueMock(projectId, input)
      toast.success('人工评测任务已创建')
    }
    await invalidateQueues()
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav
          buttonGroups={{
            buttons: [
              {
                id: 'create',
                label: '新建人工评测任务',
                icon: Plus,
                iconPosition: 'start',
                size: 'sm',
                onClick: () => {
                  setEditingQueue(null)
                  setFormOpen(true)
                },
              },
            ],
          }}
        />
        <section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable<AnnotationQueueRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-annotation-queues',
                projectId,
                state,
              ],
              queryFn: (state) => listProjectAnnotationQueuesMock(projectId, state),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: queueUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '按任务名称或描述搜索',
              filters: queueToolbarFilters,
              columnLabels: {
                name: '任务名称',
                description: '任务描述',
                completedCount: '已完成数量',
                pendingCount: '待处理数量',
                scoreConfigs: '评分指标',
                assignees: '处理人',
                createdAt: '创建时间',
              },
            }}
            loadingText={
              <Loading
                text='加载人工评测任务中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前项目下暂无匹配的人工评测任务'
            minTableWidth={1280}
          />
        </section>
      </div>
      <AnnotationQueueFormDrawer
        open={formOpen}
        queue={editingQueue}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmitQueue}
      />
    </Page>
  )
}

async function handleDeleteQueue(
  projectId: string,
  queue: AnnotationQueueRecord,
  onDeleted: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '删除人工评测任务',
    desc: `删除后将移除「${queue.name}」及其 mock 队列数据，不会删除源对象、历史评分或数据集项。确定继续吗？`,
    confirmText: '删除',
    destructive: true,
  })

  if (!confirmed) return

  await deleteProjectAnnotationQueueMock(projectId, queue.id)
  await onDeleted()
  toast.success(`已删除人工评测任务：${queue.name}`)
}
