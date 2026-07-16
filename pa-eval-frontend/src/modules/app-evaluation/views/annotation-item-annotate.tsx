import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, GripVertical } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import {
  addProjectAnnotationItemToDataset,
  getProjectAnnotationQueueItem,
  getProjectAnnotationNavigation,
  getProjectAnnotationQueue,
  saveProjectAnnotationScores,
} from '../api/annotation-api'
import { AnnotationDatasetDialog } from '../components/annotation-dataset-dialog'
import { AnnotationScoreForm } from '../components/annotation-score-form'
import { AnnotationSourcePanel } from '../components/annotation-source-panel'
import type {
  AddAnnotationItemToDatasetInput,
  AnnotationScoreFormInput,
} from '../types'

export function ProjectAnnotationItemAnnotate() {
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const {
    projectId = 'project_customer_agent',
    queueId = '',
    itemId = '',
  } = useParams()
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)
  const [scorePaneWidth, setScorePaneWidth] = useState(400)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  const queryState = useMemo(
    () => ({
      page: Math.max(1, Number(searchParams.get('page') ?? 1) || 1),
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
    queryKey: ['project-annotation-queue', $api, projectId, queueId],
    queryFn: () => getProjectAnnotationQueue($api, projectId, queueId),
    enabled: Boolean(queueId),
  })

  const itemQuery = useQuery({
    queryKey: ['project-annotation-item', $api, projectId, queueId, itemId],
    queryFn: () =>
      getProjectAnnotationQueueItem($api, projectId, queueId, itemId),
    enabled: Boolean(queueId && itemId),
  })

  const navigationQuery = useQuery({
    queryKey: [
      'project-annotation-navigation',
      $api,
      projectId,
      queueId,
      itemId,
      queryState,
      itemQuery.data,
    ],
    queryFn: () =>
      getProjectAnnotationNavigation(
        $api,
        projectId,
        queueId,
        itemId,
        queryState,
        itemQuery.data
      ),
    enabled: Boolean(queueId && itemId && itemQuery.data),
  })

  const invalidateAnnotation = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-navigation'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-item'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-items'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-metrics'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queues'],
        }),
      ]),
    [queryClient]
  )

  const navigation = navigationQuery.data
  const item = itemQuery.data ?? navigation?.current
  const queue = queueQuery.data
  const isInitialLoading =
    !(item && queue) &&
    (itemQuery.isLoading || navigationQuery.isLoading || queueQuery.isLoading)

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
    await saveProjectAnnotationScores($api, projectId, queueId, itemId, input)
    await invalidateAnnotation()

    if (mode === 'saveNext') {
      const nextNavigation = await getProjectAnnotationNavigation(
        $api,
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
    await addProjectAnnotationItemToDataset(
      $api,
      projectId,
      queueId,
      itemId,
      input
    )
    await queryClient.invalidateQueries({
      queryKey: ['project-datasets', projectId],
    })
    toast.success('已加入数据集')
  }

  const startResize = () => {
    const onPointerMove = (event: PointerEvent) => {
      const rect = splitContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const nextWidth = rect.right - event.clientX
      setScorePaneWidth(Math.min(720, Math.max(320, nextWidth)))
    }
    const stopResize = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopResize)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize)
  }

  const splitStyle = {
    '--annotation-score-width': `${scorePaneWidth}px`,
  } as CSSProperties

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() =>
            navigate(
              `/projects/${projectId}/evaluation/annotation-queues/${queueId}`
            )
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
              {navigation ? (
                <span className='text-muted-foreground'>
                  第 {navigation.index + 1} / {navigation.total} 条
                </span>
              ) : null}
              <span className='text-muted-foreground'>{queue?.name}</span>
            </div>
          ) : null}
        </PageAction>

        {isInitialLoading ? (
          <Loading text='加载标注详情中...' className='flex-1' />
        ) : null}

        {item && queue ? (
          <section
            ref={splitContainerRef}
            style={splitStyle}
            className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:grid lg:grid-cols-[minmax(520px,1fr)_8px_minmax(320px,var(--annotation-score-width))] lg:gap-0'
          >
            <AnnotationSourcePanel item={item} />
            <button
              type='button'
              aria-label='调整左右区域宽度'
              className='hover:bg-accent focus-visible:ring-ring hidden cursor-col-resize items-center justify-center border-r border-l bg-muted/30 focus-visible:ring-2 focus-visible:outline-none lg:flex'
              onPointerDown={startResize}
            >
              <GripVertical className='text-muted-foreground' />
            </button>
            <div className='bg-card text-card-foreground flex min-h-0 flex-col overflow-hidden rounded-lg border'>
              <div className='flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5'>
                <h2 className='text-sm font-semibold'>评分指标</h2>
                <span className='text-muted-foreground text-xs'>
                  {queue.scoreConfigs.length} 项
                </span>
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
