import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { Loading } from '@/components/common/loading'
import {
  addProjectAnnotationItemToDatasetMock,
  getProjectAnnotationNavigationMock,
  getProjectAnnotationQueueMock,
  saveProjectAnnotationScoresMock,
} from '../api/mock-annotation-api'
import { AnnotationDatasetDialog } from '../components/annotation-dataset-dialog'
import { AnnotationScoreForm } from '../components/annotation-score-form'
import { AnnotationSourcePanel } from '../components/annotation-source-panel'
import type {
  AddAnnotationItemToDatasetInput,
  AnnotationScoreFormInput,
} from '../types'

export function ProjectAnnotationItemAnnotate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const {
    projectId = 'project_customer_agent',
    queueId = '',
    itemId = '',
  } = useParams()
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)

  const queryState = useMemo(
    () => ({
      page: 1,
      pageSize: Number(searchParams.get('pageSize') ?? 10),
      keyword: searchParams.get('keyword') ?? '',
      filters: {
        status: searchParams.getAll('status'),
        objectType: searchParams.getAll('objectType'),
        completedBy: searchParams.getAll('completedBy'),
      },
      sorting: [],
    }),
    [searchParams]
  )

  const queueQuery = useQuery({
    queryKey: ['project-annotation-queue', projectId, queueId],
    queryFn: () => getProjectAnnotationQueueMock(projectId, queueId),
    enabled: Boolean(queueId),
  })

  const navigationQuery = useQuery({
    queryKey: [
      'project-annotation-navigation',
      projectId,
      queueId,
      itemId,
      queryState,
    ],
    queryFn: () =>
      getProjectAnnotationNavigationMock(projectId, queueId, itemId, queryState),
    enabled: Boolean(queueId && itemId),
  })

  const invalidateAnnotation = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-navigation', projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-items', projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-metrics', projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queues', projectId],
        }),
      ]),
    [projectId, queueId, queryClient]
  )

  const navigation = navigationQuery.data
  const item = navigation?.current
  const queue = queueQuery.data

  const goToItem = (nextItemId: string) => {
    navigate({
      pathname: `/projects/${projectId}/evaluation/annotation-queues/${queueId}/items/${nextItemId}/annotate`,
      search: searchParams.toString(),
    })
  }

  const handleSubmit = async (
    input: AnnotationScoreFormInput,
    mode: 'save' | 'saveNext'
  ) => {
    await saveProjectAnnotationScoresMock(projectId, queueId, itemId, input)
    await invalidateAnnotation()

    if (mode === 'saveNext') {
      const nextNavigation = await getProjectAnnotationNavigationMock(
        projectId,
        queueId,
        itemId,
        queryState
      )
      if (nextNavigation.next) {
        toast.success('评分已保存，已进入下一条')
        goToItem(nextNavigation.next.id)
      } else {
        toast.success('当前结果集已完成，请返回队列选择新的筛选条件或任务')
      }
      return
    }

    toast.success('评分已保存')
  }

  const handleAddToDataset = async (input: AddAnnotationItemToDatasetInput) => {
    await addProjectAnnotationItemToDatasetMock(projectId, queueId, itemId, input)
    await queryClient.invalidateQueries({
      queryKey: ['project-datasets', projectId],
    })
    toast.success('已加入数据集')
  }

  return (
    <Page fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() =>
            navigate(`/projects/${projectId}/evaluation/annotation-queues/${queueId}`)
          }
          buttonGroups={{
            buttons: [
              {
                id: 'previous',
                label: '上一条',
                icon: ArrowLeft,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                disabled: !navigation?.previous,
                onClick: () => {
                  if (navigation?.previous) goToItem(navigation.previous.id)
                },
              },
              {
                id: 'next',
                label: '下一条',
                icon: ArrowRight,
                iconPosition: 'end',
                variant: 'outline',
                size: 'sm',
                disabled: !navigation?.next,
                onClick: () => {
                  if (navigation?.next) goToItem(navigation.next.id)
                },
              },
            ],
          }}
        >
          {item ? (
            <div className='flex min-w-0 flex-wrap items-center gap-2 text-sm'>
              <span className='font-medium'>{item.id}</span>
              <span className='text-muted-foreground'>
                第 {navigation.index + 1} / {navigation.total} 条
              </span>
              <span className='text-muted-foreground'>{queue?.name}</span>
            </div>
          ) : null}
        </PageAction>

        {navigationQuery.isLoading || queueQuery.isLoading ? (
          <Loading text='加载标注详情中...' className='flex-1' />
        ) : null}

        {item && queue ? (
          <section className='grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,.85fr)]'>
            <AnnotationSourcePanel item={item} />
            <div className='flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground'>
              <div className='shrink-0 border-b p-4'>
                <div className='text-muted-foreground text-xs'>人工标注表单</div>
                <h2 className='text-base font-semibold'>评分指标</h2>
              </div>
              <AnnotationScoreForm
                item={item}
                scoreConfigs={queue.scoreConfigs}
                onAddToDataset={() => setDatasetDialogOpen(true)}
                onSubmit={handleSubmit}
              />
            </div>
          </section>
        ) : null}
      </div>
      {item ? (
        <AnnotationDatasetDialog
          open={datasetDialogOpen}
          projectId={projectId}
          queueId={queueId}
          item={item}
          onOpenChange={setDatasetDialogOpen}
          onSubmit={handleAddToDataset}
        />
      ) : null}
    </Page>
  )
}
