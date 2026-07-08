import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ListChecks, Search, SlidersHorizontal } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { useAPI } from '@/hooks/use-api'
import {
  buildAnnotationBatchFilters,
  addProjectAnnotationItemToDataset,
  getProjectAnnotationQueue,
  getProjectAnnotationQueueMetricSummary,
  listProjectAnnotationUsers,
  listProjectAnnotationQueueItems,
  previewProjectAnnotationBatch,
  saveProjectAnnotationBatchScores,
  saveProjectAnnotationScores,
} from '../api/annotation-api'
import { AnnotationDatasetDialog } from '../components/annotation-dataset-dialog'
import { AnnotationScoreForm } from '../components/annotation-score-form'
import { AnnotationSourcePanel } from '../components/annotation-source-panel'
import { AnnotationObjectTypeBadge } from '../components/annotation-object-type-badge'
import { AnnotationStatusBadge } from '../components/annotation-status-badge'
import { formatDateTime } from '../components/format'
import {
  getBooleanScoreOptions,
  getCategoricalScoreOptions,
  normalizeAnnotationScoreFormInput,
  parseBooleanScoreInput,
} from '../components/annotation-score-values'
import {
  scoreDataTypeLabels,
  type AnnotationBatchFiltersInput,
  type AnnotationBatchSaveResult,
  type AnnotationItemStatus,
  type AnnotationObjectType,
  type AnnotationQueueItemRecord,
  type AnnotationScoreFormInput,
  type ProjectUserRecord,
  type ScoreConfigRecord,
} from '../types'

type BatchMode = 'single' | 'batch'
type StatusView = AnnotationItemStatus | 'ALL'
type ObjectTypeView = AnnotationObjectType | 'ALL'
type ScoreStateView = 'ALL' | 'WITH' | 'WITHOUT'
type MetadataOperator = NonNullable<
  AnnotationBatchFiltersInput['metadataFilter']
>['operator']
type MetadataFilterInput = NonNullable<
  AnnotationBatchFiltersInput['metadataFilters']
>[number]
type DraftScore = AnnotationScoreFormInput['scores'][number]

export function ProjectAnnotationBatch() {
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projectId = 'project_customer_agent', queueId = '' } = useParams()
  const [mode, setMode] = useState<BatchMode>(
    searchParams.get('mode') === 'batch' ? 'batch' : 'single'
  )
  const [keyword, setKeyword] = useState(searchParams.get('keyword') ?? '')
  const [statusView, setStatusView] = useState<StatusView>(
    toStatusView(searchParams.get('status'))
  )
  const [objectTypeView, setObjectTypeView] = useState<ObjectTypeView>(
    toObjectTypeView(searchParams.get('objectType'))
  )
  const [completedByView, setCompletedByView] = useState(
    searchParams.get('completedBy') ?? 'ALL'
  )
  const [scoreStateView, setScoreStateView] = useState<ScoreStateView>(
    toScoreStateView(searchParams.get('scoreState'))
  )
  const [createdAtFrom, setCreatedAtFrom] = useState(
    searchParams.get('createdAtFrom') ?? ''
  )
  const [createdAtTo, setCreatedAtTo] = useState(
    searchParams.get('createdAtTo') ?? ''
  )
  const [completedAtFrom, setCompletedAtFrom] = useState(
    searchParams.get('completedAtFrom') ?? ''
  )
  const [completedAtTo, setCompletedAtTo] = useState(
    searchParams.get('completedAtTo') ?? ''
  )
  const [metadataFilters, setMetadataFilters] = useState<MetadataFilterInput[]>(
    () => parseMetadataFiltersParam(searchParams.get('metadataFilters'))
  )
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(
    Boolean(
      searchParams.get('createdAtFrom') ||
        searchParams.get('createdAtTo') ||
        searchParams.get('completedAtFrom') ||
        searchParams.get('completedAtTo') ||
        searchParams.get('metadataFilters')
    )
  )
  const [selectedItemId, setSelectedItemId] = useState(searchParams.get('item') ?? '')
  const [retryItemIds, setRetryItemIds] = useState<string[]>(
    searchParams.getAll('itemIds')
  )
  const [datasetItem, setDatasetItem] =
    useState<AnnotationQueueItemRecord | null>(null)
  const [lastBatchResult, setLastBatchResult] =
    useState<AnnotationBatchSaveResult | null>(null)
  const keywordInputRef = useRef<HTMLInputElement>(null)

  const queryState = useMemo(
    () => ({
      page: 1,
      pageSize: 5000,
      keyword,
      filters: {
        status: statusView === 'ALL' ? [] : [statusView],
        objectType: objectTypeView === 'ALL' ? [] : [objectTypeView],
        completedBy:
          completedByView === 'ALL' ? [] : [completedByView],
        ...(createdAtFrom ? { createdAtFrom: toIsoDateTime(createdAtFrom) } : {}),
        ...(createdAtTo ? { createdAtTo: toIsoDateTime(createdAtTo) } : {}),
        ...(completedAtFrom
          ? { completedAtFrom: toIsoDateTime(completedAtFrom) }
          : {}),
        ...(completedAtTo ? { completedAtTo: toIsoDateTime(completedAtTo) } : {}),
        ...(scoreStateView === 'WITH' ? { hasScores: true } : {}),
        ...(scoreStateView === 'WITHOUT' ? { hasScores: false } : {}),
        ...(metadataFilters.length ? { metadataFilters } : {}),
        ...(retryItemIds.length ? { itemIds: retryItemIds } : {}),
      },
      sorting: [],
    }),
    [
      completedAtFrom,
      completedAtTo,
      completedByView,
      createdAtFrom,
      createdAtTo,
      keyword,
      metadataFilters,
      objectTypeView,
      retryItemIds,
      scoreStateView,
      statusView,
    ]
  )
  const batchFilters = useMemo(
    () => buildAnnotationBatchFilters(queryState),
    [queryState]
  )
  const searchString = searchParams.toString()

  useEffect(() => {
    const nextParams = buildBatchSearchParams({
      mode,
      keyword,
      statusView,
      objectTypeView,
      completedByView,
      scoreStateView,
      createdAtFrom,
      createdAtTo,
      completedAtFrom,
      completedAtTo,
      metadataFilters,
      selectedItemId,
      retryItemIds,
    })
    if (nextParams.toString() !== searchString) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [
    completedAtFrom,
    completedAtTo,
    completedByView,
    createdAtFrom,
    createdAtTo,
    keyword,
    metadataFilters,
    mode,
    objectTypeView,
    retryItemIds,
    scoreStateView,
    searchString,
    selectedItemId,
    setSearchParams,
    statusView,
  ])

  const queueQuery = useQuery({
    queryKey: ['project-annotation-queue', $api, projectId, queueId],
    queryFn: () => getProjectAnnotationQueue($api, projectId, queueId),
    enabled: Boolean(queueId),
  })
  const metricQuery = useQuery({
    queryKey: ['project-annotation-queue-metrics', $api, projectId, queueId],
    queryFn: () =>
      getProjectAnnotationQueueMetricSummary($api, projectId, queueId),
    enabled: Boolean(queueId),
  })
  const usersQuery = useQuery({
    queryKey: ['project-annotation-users', $api, projectId],
    queryFn: () => listProjectAnnotationUsers($api, projectId),
  })
  const itemsQuery = useQuery({
    queryKey: ['project-annotation-batch-items', $api, projectId, queueId, queryState],
    queryFn: () =>
      listProjectAnnotationQueueItems($api, projectId, queueId, queryState),
    enabled: Boolean(queueId),
  })
  const previewQuery = useQuery({
    queryKey: [
      'project-annotation-batch-preview',
      $api,
      projectId,
      queueId,
      batchFilters,
    ],
    queryFn: () =>
      previewProjectAnnotationBatch($api, projectId, queueId, {
        filters: batchFilters,
        limit: 5,
      }),
    enabled: Boolean(queueId),
  })

  const invalidateWorkspace = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-annotation-batch'] }),
        queryClient.invalidateQueries({ queryKey: ['project-annotation-batch-items'] }),
        queryClient.invalidateQueries({ queryKey: ['project-annotation-batch-preview'] }),
        queryClient.invalidateQueries({ queryKey: ['project-annotation-queue'] }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue-metrics'],
        }),
        queryClient.invalidateQueries({ queryKey: ['project-annotation-queues'] }),
      ]),
    [queryClient]
  )

  const itemDatas = itemsQuery.data?.datas
  const items = useMemo(() => itemDatas ?? [], [itemDatas])
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null
  const queue = queueQuery.data
  const metrics = metricQuery.data
  const preview = previewQuery.data
  const users = usersQuery.data ?? []

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (!items.length) return
      const currentIndex = Math.max(
        0,
        items.findIndex((item) => item.id === selectedItem?.id)
      )
      const nextIndex =
        direction > 0
          ? Math.min(items.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1)
      setSelectedItemId(items[nextIndex].id)
      setMode('single')
    },
    [items, selectedItem?.id]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault()
        moveSelection(1)
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        moveSelection(-1)
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setMode((current) => (current === 'batch' ? 'single' : 'batch'))
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        keywordInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moveSelection])

  const handleSingleSubmit = async (
    input: AnnotationScoreFormInput,
    submitMode: 'save' | 'saveNext'
  ) => {
    if (!selectedItem) return
    await saveProjectAnnotationScores(
      $api,
      projectId,
      queueId,
      selectedItem.id,
      input
    )
    await invalidateWorkspace()
    if (submitMode === 'saveNext') {
      const nextPending = findNextPendingItem(items, selectedItem.id)
      if (nextPending) {
        setSelectedItemId(nextPending.id)
        toast.success('评分已保存，已进入下一条')
      } else {
        toast.success('当前筛选条件下已全部完成')
      }
      return
    }
    toast.success('评分已保存')
  }

  const handleSkip = () => {
    const nextPending = findNextPendingItem(items, selectedItem?.id ?? '')
    if (nextPending) {
      setSelectedItemId(nextPending.id)
      toast.info('已跳过当前数据')
      return
    }
    toast.info('当前筛选条件下没有下一条待标注数据')
  }

  const handleBatchSubmit = async (
    input: AnnotationScoreFormInput,
    confirmLargeBatch: boolean
  ): Promise<AnnotationBatchSaveResult | null> => {
    const pendingCount = preview?.pendingCount ?? 0
    if (!pendingCount) {
      toast.error('当前筛选条件下没有待标注数据')
      return null
    }
    const confirmed = await confirm({
      title: '确认批量标注',
      desc: (
        <div className='grid gap-2 text-sm'>
          <div>本次将统一写入当前筛选命中的待标注数据。</div>
          <div>待标注：{pendingCount} 条</div>
          <div>已完成跳过：{preview?.completedCount ?? 0} 条</div>
          <div>评分指标：{input.scores.length} 个</div>
          <div className='text-muted-foreground'>
            {preview?.filterSummary ?? '当前筛选条件'}
          </div>
        </div>
      ),
      confirmText: confirmLargeBatch ? '确认提交大批次' : '确认提交',
    })
    if (!confirmed) return null
    const result = await saveProjectAnnotationBatchScores(
      $api,
      projectId,
      queueId,
      {
        filters: batchFilters,
        scores: input.scores,
        expectedPendingCount: pendingCount,
        confirmLargeBatch,
      }
    )
    await invalidateWorkspace()
    setLastBatchResult(result)
    if (result.failureCount) {
      toast.warning(
        `批量标注完成 ${result.successCount} 条，失败 ${result.failureCount} 条`
      )
      return result
    }
    if (result.successCount) {
      toast.success(`批量标注完成 ${result.successCount} 条，已刷新下一批`)
    } else {
      toast.info('当前批次已全部完成')
    }
    return result
  }

  const handleAddToDataset = async (input: Parameters<typeof addProjectAnnotationItemToDataset>[4]) => {
    if (!datasetItem) return
    await addProjectAnnotationItemToDataset(
      $api,
      projectId,
      queueId,
      datasetItem.id,
      input
    )
    await invalidateWorkspace()
    toast.success('已加入数据集')
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() =>
            navigate(`/projects/${projectId}/evaluation/annotation-queues`)
          }
          actions={
            <ToggleGroup
              type='single'
              value={mode}
              onValueChange={(value) => {
                if (value === 'single' || value === 'batch') setMode(value)
              }}
              variant='outline'
              size='sm'
            >
              <ToggleGroupItem value='single'>单条标注</ToggleGroupItem>
              <ToggleGroupItem value='batch'>批量标注</ToggleGroupItem>
            </ToggleGroup>
          }
        >
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <span className='truncate text-sm font-medium'>
              {queue?.name ?? '批量标注工作台'}
            </span>
            <span className='text-muted-foreground text-sm'>批量标注工作台</span>
          </div>
        </PageAction>

        <section className='grid gap-3 md:grid-cols-4'>
          <ProgressCard title='总量' value={metrics?.total ?? 0} />
          <ProgressCard title='待标注' value={metrics?.pending ?? 0} />
          <ProgressCard title='已完成' value={metrics?.completed ?? 0} />
          <ProgressCard title='当前筛选命中' value={preview?.totalCount ?? 0} />
        </section>

        <section className='bg-card text-card-foreground flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border lg:grid lg:grid-cols-[minmax(340px,40%)_minmax(0,1fr)]'>
          <aside className='flex min-h-0 flex-col border-b lg:border-r lg:border-b-0'>
            <div className='grid gap-2 border-b p-3'>
              <div className='relative'>
                <Search className='text-muted-foreground absolute top-2.5 left-2.5 size-4' />
                <Input
                  ref={keywordInputRef}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  className='pl-8'
                  placeholder='搜索源对象、输入输出、metadata'
                />
              </div>
              <div className='grid grid-cols-2 gap-2 xl:grid-cols-4'>
                <Select
                  value={statusView}
                  onValueChange={(value) => setStatusView(value as StatusView)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='PENDING'>待标注</SelectItem>
                    <SelectItem value='COMPLETED'>已完成</SelectItem>
                    <SelectItem value='ALL'>全部</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={objectTypeView}
                  onValueChange={(value) =>
                    setObjectTypeView(value as ObjectTypeView)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>全部类型</SelectItem>
                    <SelectItem value='TRACE'>追踪</SelectItem>
                    <SelectItem value='OBSERVATION'>观测</SelectItem>
                    <SelectItem value='SESSION'>会话</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={completedByView} onValueChange={setCompletedByView}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>全部人员</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {formatUserName(user)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={scoreStateView}
                  onValueChange={(value) =>
                    setScoreStateView(value as ScoreStateView)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>全部评分</SelectItem>
                    <SelectItem value='WITH'>有评分</SelectItem>
                    <SelectItem value='WITHOUT'>无评分</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='justify-start px-2'
                onClick={() => setShowAdvancedFilters((current) => !current)}
              >
                <SlidersHorizontal data-icon='inline-start' />
                高级筛选
              </Button>
              {showAdvancedFilters ? (
                <AdvancedFilters
                  createdAtFrom={createdAtFrom}
                  createdAtTo={createdAtTo}
                  completedAtFrom={completedAtFrom}
                  completedAtTo={completedAtTo}
                  metadataFilters={metadataFilters}
                  onCreatedAtFromChange={setCreatedAtFrom}
                  onCreatedAtToChange={setCreatedAtTo}
                  onCompletedAtFromChange={setCompletedAtFrom}
                  onCompletedAtToChange={setCompletedAtTo}
                  onMetadataFiltersChange={setMetadataFilters}
                  onClear={() => {
                    setCreatedAtFrom('')
                    setCreatedAtTo('')
                    setCompletedAtFrom('')
                    setCompletedAtTo('')
                    setMetadataFilters([])
                  }}
                />
              ) : null}
              {retryItemIds.length ? (
                <div className='bg-muted/40 flex items-center justify-between rounded-md border px-2 py-1 text-xs'>
                  <span>正在重试失败项 {retryItemIds.length} 条</span>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => setRetryItemIds([])}
                  >
                    退出重试
                  </Button>
                </div>
              ) : null}
              <Button
                type='button'
                variant={mode === 'batch' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setMode('batch')}
              >
                <ListChecks data-icon='inline-start' />
                按当前筛选批量标注
              </Button>
            </div>
            <div className='min-h-0 flex-1 overflow-auto'>
              {itemsQuery.isLoading ? (
                <Loading text='加载标注数据中...' className='min-h-40' />
              ) : null}
              {items.map((item) => (
                <button
                  key={item.id}
                  type='button'
                  className={
                    item.id === selectedItem?.id
                      ? 'bg-accent text-accent-foreground flex w-full flex-col gap-2 border-b p-3 text-left'
                      : 'hover:bg-accent/50 flex w-full flex-col gap-2 border-b p-3 text-left'
                  }
                  onClick={() => {
                    setSelectedItemId(item.id)
                    setMode('single')
                  }}
                >
                  <div className='flex min-w-0 items-center gap-2'>
                    <AnnotationObjectTypeBadge objectType={item.objectType} />
                    <AnnotationStatusBadge status={item.status} />
                    <span className='text-muted-foreground truncate text-xs'>
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <div className='truncate text-sm font-medium'>
                    {item.source.title || item.objectId}
                  </div>
                  <div className='text-muted-foreground line-clamp-2 text-xs'>
                    {summarizeSource(item)}
                  </div>
                </button>
              ))}
              {!itemsQuery.isLoading && !items.length ? (
                <div className='text-muted-foreground p-6 text-center text-sm'>
                  当前筛选条件下暂无标注数据
                </div>
              ) : null}
            </div>
          </aside>

          <main className='flex min-h-0 flex-col overflow-hidden'>
            {queueQuery.isLoading ? (
              <Loading text='加载批量标注工作台...' className='flex-1' />
            ) : mode === 'batch' && queue ? (
              <BatchAnnotationPanel
                scoreConfigs={queue.scoreConfigs}
                filters={batchFilters}
                preview={preview}
                lastResult={lastBatchResult}
                loading={previewQuery.isLoading}
                onSubmit={handleBatchSubmit}
                onRetryFailures={(itemIds) => {
                  setRetryItemIds(itemIds)
                  setStatusView('PENDING')
                  setMode('batch')
                  toast.info(`已筛选 ${itemIds.length} 条失败项，可重新提交`)
                }}
                onContinueNextBatch={() => {
                  setRetryItemIds([])
                  setLastBatchResult(null)
                  void invalidateWorkspace()
                }}
              />
            ) : selectedItem && queue ? (
              <section className='grid min-h-0 flex-1 grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]'>
                <AnnotationSourcePanel item={selectedItem} />
                <div className='flex min-h-0 flex-col overflow-hidden border-l'>
                  <div className='flex shrink-0 items-center justify-between border-b px-3 py-2.5'>
                    <h2 className='text-sm font-semibold'>评分指标</h2>
                    <div className='flex items-center gap-2'>
                      <span className='text-muted-foreground text-xs'>
                        保存并下一条；J/K 切换，B 批量，F 搜索
                      </span>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={handleSkip}
                      >
                        跳过
                      </Button>
                    </div>
                  </div>
                  <AnnotationScoreForm
                    item={selectedItem}
                    scoreConfigs={queue.scoreConfigs}
                    onAddToDataset={() => setDatasetItem(selectedItem)}
                    onSubmit={handleSingleSubmit}
                  />
                </div>
              </section>
            ) : (
              <div className='text-muted-foreground flex flex-1 items-center justify-center text-sm'>
                请选择一条待标注数据
              </div>
            )}
          </main>
        </section>
      </div>
      {datasetItem ? (
        <AnnotationDatasetDialog
          open={Boolean(datasetItem)}
          projectId={projectId}
          queueId={queueId}
          item={datasetItem}
          onOpenChange={(open) => {
            if (!open) setDatasetItem(null)
          }}
          onSubmit={handleAddToDataset}
        />
      ) : null}
    </Page>
  )
}

function AdvancedFilters({
  createdAtFrom,
  createdAtTo,
  completedAtFrom,
  completedAtTo,
  metadataFilters,
  onCreatedAtFromChange,
  onCreatedAtToChange,
  onCompletedAtFromChange,
  onCompletedAtToChange,
  onMetadataFiltersChange,
  onClear,
}: {
  createdAtFrom: string
  createdAtTo: string
  completedAtFrom: string
  completedAtTo: string
  metadataFilters: MetadataFilterInput[]
  onCreatedAtFromChange: (value: string) => void
  onCreatedAtToChange: (value: string) => void
  onCompletedAtFromChange: (value: string) => void
  onCompletedAtToChange: (value: string) => void
  onMetadataFiltersChange: (value: MetadataFilterInput[]) => void
  onClear: () => void
}) {
  const updateMetadataFilter = (
    index: number,
    patch: Partial<MetadataFilterInput>
  ) => {
    onMetadataFiltersChange(
      metadataFilters.map((filter, currentIndex) =>
        currentIndex === index ? { ...filter, ...patch } : filter
      )
    )
  }

  return (
    <div className='bg-muted/30 grid gap-2 rounded-md border p-2'>
      <div className='grid grid-cols-2 gap-2'>
        <Input
          type='datetime-local'
          value={createdAtFrom}
          onChange={(event) => onCreatedAtFromChange(event.target.value)}
          aria-label='加入时间开始'
        />
        <Input
          type='datetime-local'
          value={createdAtTo}
          onChange={(event) => onCreatedAtToChange(event.target.value)}
          aria-label='加入时间结束'
        />
        <Input
          type='datetime-local'
          value={completedAtFrom}
          onChange={(event) => onCompletedAtFromChange(event.target.value)}
          aria-label='完成时间开始'
        />
        <Input
          type='datetime-local'
          value={completedAtTo}
          onChange={(event) => onCompletedAtToChange(event.target.value)}
          aria-label='完成时间结束'
        />
      </div>
      <div className='grid gap-2'>
        {metadataFilters.map((filter, index) => (
          <div
            key={index}
            className='grid grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)_auto] gap-2'
          >
            <Input
              value={filter.key}
              onChange={(event) =>
                updateMetadataFilter(index, { key: event.target.value })
              }
              placeholder='metadata key'
            />
            <Select
              value={filter.operator}
              onValueChange={(value) =>
                updateMetadataFilter(index, {
                  operator: value as MetadataOperator,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='contains'>包含</SelectItem>
                <SelectItem value='equals'>等于</SelectItem>
                <SelectItem value='exists'>存在</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={filter.value ?? ''}
              disabled={filter.operator === 'exists'}
              onChange={(event) =>
                updateMetadataFilter(index, { value: event.target.value })
              }
              placeholder='metadata value'
            />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() =>
                onMetadataFiltersChange(
                  metadataFilters.filter((_, currentIndex) => currentIndex !== index)
                )
              }
            >
              删除
            </Button>
          </div>
        ))}
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() =>
            onMetadataFiltersChange([
              ...metadataFilters,
              { key: '', operator: 'contains', value: '' },
            ])
          }
        >
          添加 metadata 条件
        </Button>
      </div>
      <div className='flex justify-end'>
        <Button type='button' variant='ghost' size='sm' onClick={onClear}>
          清空高级筛选
        </Button>
      </div>
    </div>
  )
}

function BatchAnnotationPanel({
  scoreConfigs,
  filters,
  preview,
  lastResult,
  loading,
  onSubmit,
  onRetryFailures,
  onContinueNextBatch,
}: {
  scoreConfigs: ScoreConfigRecord[]
  filters: AnnotationBatchFiltersInput
  preview:
    | {
        pendingCount: number
        completedCount: number
        totalCount: number
        samples: AnnotationQueueItemRecord[]
        filterSummary: string
      }
    | undefined
  lastResult: AnnotationBatchSaveResult | null
  loading: boolean
  onSubmit: (
    input: AnnotationScoreFormInput,
    confirmLargeBatch: boolean
  ) => Promise<AnnotationBatchSaveResult | null>
  onRetryFailures: (itemIds: string[]) => void
  onContinueNextBatch: () => void
}) {
  const [selectedConfigIds, setSelectedConfigIds] = useState<Set<string>>(
    () => new Set()
  )
  const [draftScores, setDraftScores] = useState<Record<string, DraftScore>>({})

  const selectedScores = scoreConfigs
    .filter((config) => selectedConfigIds.has(config.id))
    .map((config) => draftScores[config.id] ?? emptyDraftScore(config.id))
  const pendingCount = preview?.pendingCount ?? 0
  const confirmLargeBatch = pendingCount > 100

  const submit = async () => {
    if (!selectedScores.length) {
      toast.error('请至少选择一个评分指标')
      return
    }
    const missingConfig = scoreConfigs.find(
      (config) =>
        selectedConfigIds.has(config.id) &&
        !isDraftScoreFilled(config, draftScores[config.id] ?? emptyDraftScore(config.id))
    )
    if (missingConfig) {
      toast.error(`请填写「${missingConfig.name}」的评分值`)
      return
    }
    if (!pendingCount) {
      toast.error('当前筛选条件下没有待标注数据')
      return
    }
    await onSubmit(
      normalizeAnnotationScoreFormInput({ scores: selectedScores }, scoreConfigs),
      confirmLargeBatch
    )
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='border-b p-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h2 className='text-sm font-semibold'>批量标注</h2>
            <p className='text-muted-foreground mt-1 text-xs'>
              已完成数据默认不覆盖，仅对当前筛选命中的待标注数据写入统一评分。
            </p>
          </div>
          <Button type='button' size='sm' disabled={loading} onClick={submit}>
            <CheckCircle2 data-icon='inline-start' />
            一键应用到本批次
          </Button>
        </div>
      </div>
      <div className='grid min-h-0 flex-1 gap-4 overflow-auto p-4 xl:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]'>
        <div className='space-y-4'>
          <section className='rounded-md border p-3'>
            <h3 className='text-sm font-semibold'>批次预览</h3>
            <div className='mt-3 grid gap-2 text-sm'>
              <PreviewLine label='当前筛选' value={preview?.filterSummary ?? '-'} />
              <PreviewLine label='命中总量' value={preview?.totalCount ?? 0} />
              <PreviewLine label='待标注命中' value={preview?.pendingCount ?? 0} />
              <PreviewLine label='已完成跳过' value={preview?.completedCount ?? 0} />
              <PreviewLine
                label='筛选条件'
                value={JSON.stringify(filters, null, 0) || '{}'}
              />
            </div>
          </section>
          <section className='rounded-md border p-3'>
            <h3 className='text-sm font-semibold'>样本预览</h3>
            <div className='mt-3 space-y-2'>
              {preview?.samples.map((item) => (
                <div key={item.id} className='rounded-md border p-2'>
                  <div className='truncate text-sm font-medium'>
                    {item.source.title || item.objectId}
                  </div>
                  <div className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
                    {summarizeSource(item)}
                  </div>
                </div>
              ))}
              {!preview?.samples.length ? (
                <div className='text-muted-foreground text-sm'>暂无待标注样本</div>
              ) : null}
            </div>
          </section>
          {lastResult ? (
            <section className='rounded-md border p-3'>
              <h3 className='text-sm font-semibold'>上次提交结果</h3>
              <div className='mt-3 grid gap-2 text-sm'>
                <PreviewLine label='成功' value={lastResult.successCount} />
                <PreviewLine label='失败' value={lastResult.failureCount} />
                <PreviewLine label='跳过' value={lastResult.skippedCount} />
              </div>
              <div className='mt-3 flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={onContinueNextBatch}
                >
                  继续下一批
                </Button>
                {lastResult.failures.length ? (
                  <Button
                    type='button'
                    size='sm'
                    onClick={() =>
                      onRetryFailures(
                        lastResult.failures.map((failure) => failure.itemId)
                      )
                    }
                  >
                    重试失败项
                  </Button>
                ) : null}
              </div>
              {lastResult.failures.length ? (
                <div className='mt-3 space-y-2'>
                  {lastResult.failures.slice(0, 8).map((failure) => (
                    <div
                      key={failure.itemId}
                      className='bg-destructive/5 rounded-md border p-2 text-xs'
                    >
                      <div className='font-medium'>{failure.itemId}</div>
                      <div className='text-muted-foreground mt-1'>
                        {failure.reason}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <section className='rounded-md border'>
          <div className='border-b px-3 py-2.5'>
            <h3 className='text-sm font-semibold'>统一评分内容</h3>
          </div>
          <div className='divide-y'>
            {scoreConfigs.map((config) => (
              <BatchScoreRow
                key={config.id}
                config={config}
                selected={selectedConfigIds.has(config.id)}
                draft={draftScores[config.id] ?? emptyDraftScore(config.id)}
                onSelectedChange={(selected) => {
                  const next = new Set(selectedConfigIds)
                  if (selected) next.add(config.id)
                  else next.delete(config.id)
                  setSelectedConfigIds(next)
                }}
                onDraftChange={(draft) =>
                  setDraftScores((current) => ({
                    ...current,
                    [config.id]: draft,
                  }))
                }
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function BatchScoreRow({
  config,
  selected,
  draft,
  onSelectedChange,
  onDraftChange,
}: {
  config: ScoreConfigRecord
  selected: boolean
  draft: DraftScore
  onSelectedChange: (selected: boolean) => void
  onDraftChange: (draft: DraftScore) => void
}) {
  return (
    <div className='grid gap-2 p-3'>
      <label className='flex items-center gap-2 text-sm font-medium'>
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelectedChange(value === true)}
        />
        <span>{config.name}</span>
        <span className='text-muted-foreground text-xs'>
          {scoreDataTypeLabels[config.dataType]}
        </span>
      </label>
      <div className='grid gap-2 md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]'>
        <BatchScoreValue
          config={config}
          draft={draft}
          disabled={!selected || Boolean(config.archived)}
          onDraftChange={onDraftChange}
        />
        <Input
          value={draft.comment}
          disabled={!selected}
          placeholder='统一备注（可选）'
          onChange={(event) =>
            onDraftChange({ ...draft, comment: event.target.value })
          }
        />
      </div>
    </div>
  )
}

function BatchScoreValue({
  config,
  draft,
  disabled,
  onDraftChange,
}: {
  config: ScoreConfigRecord
  draft: DraftScore
  disabled: boolean
  onDraftChange: (draft: DraftScore) => void
}) {
  if (config.dataType === 'NUMERIC') {
    return (
      <Input
        type='number'
        min={config.minValue}
        max={config.maxValue}
        disabled={disabled}
        value={typeof draft.value === 'number' ? draft.value : ''}
        placeholder='评分值'
        onChange={(event) =>
          onDraftChange({
            ...draft,
            value: event.target.value ? Number(event.target.value) : null,
            stringValue: '',
          })
        }
      />
    )
  }

  if (config.dataType === 'BOOLEAN') {
    return (
      <ToggleGroup
        type='single'
        variant='outline'
        size='sm'
        spacing={0}
        disabled={disabled}
        value={draft.value === true ? '1' : draft.value === false ? '0' : ''}
        onValueChange={(value) => {
          if (!value) return
          onDraftChange({
            ...draft,
            value: parseBooleanScoreInput(value),
            stringValue: '',
          })
        }}
        className='grid grid-cols-2'
      >
        {getBooleanScoreOptions().map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  if (config.dataType === 'CATEGORICAL') {
    const options = getCategoricalScoreOptions(config)
    return (
      <Select
        disabled={disabled || !options.length}
        value={typeof draft.value === 'number' ? String(draft.value) : ''}
        onValueChange={(value) => {
          const option = options.find((item) => item.value === value)
          onDraftChange({
            ...draft,
            value: Number(value),
            stringValue: option?.label ?? '',
          })
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder='选择分类' />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <Textarea
      value={draft.stringValue}
      disabled={disabled}
      maxLength={500}
      className='min-h-16'
      placeholder='文本评分'
      onChange={(event) =>
        onDraftChange({ ...draft, value: 0, stringValue: event.target.value })
      }
    />
  )
}

function PreviewLine({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className='flex justify-between gap-3'>
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span className='min-w-0 truncate font-medium'>{value}</span>
    </div>
  )
}

function ProgressCard({ title, value }: { title: string; value: number }) {
  return (
    <div className='bg-card text-card-foreground rounded-lg border p-3'>
      <div className='text-muted-foreground text-xs'>{title}</div>
      <div className='mt-1 text-xl font-semibold'>{value}</div>
    </div>
  )
}

function findNextPendingItem(items: AnnotationQueueItemRecord[], currentId: string) {
  const currentIndex = items.findIndex((item) => item.id === currentId)
  if (currentIndex < 0) {
    return items.find((item) => item.status === 'PENDING')
  }
  return items
    .slice(currentIndex + 1)
    .find((item) => item.status === 'PENDING')
}

function isDraftScoreFilled(config: ScoreConfigRecord, draft: DraftScore) {
  if (config.dataType === 'TEXT') return Boolean(draft.stringValue.trim())
  if (config.dataType === 'BOOLEAN') return typeof draft.value === 'boolean'
  return draft.value !== null && draft.value !== undefined
}

function toIsoDateTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  )
}

function buildBatchSearchParams({
  mode,
  keyword,
  statusView,
  objectTypeView,
  completedByView,
  scoreStateView,
  createdAtFrom,
  createdAtTo,
  completedAtFrom,
  completedAtTo,
  metadataFilters,
  selectedItemId,
  retryItemIds,
}: {
  mode: BatchMode
  keyword: string
  statusView: StatusView
  objectTypeView: ObjectTypeView
  completedByView: string
  scoreStateView: ScoreStateView
  createdAtFrom: string
  createdAtTo: string
  completedAtFrom: string
  completedAtTo: string
  metadataFilters: MetadataFilterInput[]
  selectedItemId: string
  retryItemIds: string[]
}) {
  const params = new URLSearchParams()
  if (mode !== 'single') params.set('mode', mode)
  if (keyword.trim()) params.set('keyword', keyword.trim())
  if (statusView !== 'PENDING') params.set('status', statusView)
  if (objectTypeView !== 'ALL') params.set('objectType', objectTypeView)
  if (completedByView !== 'ALL') params.set('completedBy', completedByView)
  if (scoreStateView !== 'ALL') params.set('scoreState', scoreStateView)
  if (createdAtFrom) params.set('createdAtFrom', createdAtFrom)
  if (createdAtTo) params.set('createdAtTo', createdAtTo)
  if (completedAtFrom) params.set('completedAtFrom', completedAtFrom)
  if (completedAtTo) params.set('completedAtTo', completedAtTo)
  if (metadataFilters.length) {
    params.set(
      'metadataFilters',
      JSON.stringify(
        metadataFilters.filter((filter) => filter.key.trim()).map((filter) => ({
          key: filter.key.trim(),
          operator: filter.operator,
          ...(filter.value?.trim() ? { value: filter.value.trim() } : {}),
        }))
      )
    )
  }
  if (selectedItemId) params.set('item', selectedItemId)
  retryItemIds.forEach((itemId) => params.append('itemIds', itemId))
  return params
}

function parseMetadataFiltersParam(value: string | null): MetadataFilterInput[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        key: typeof item.key === 'string' ? item.key : '',
        operator: toMetadataOperator(item.operator),
        value: typeof item.value === 'string' ? item.value : '',
      }))
  } catch {
    return []
  }
}

function toStatusView(value: string | null): StatusView {
  if (value === 'COMPLETED' || value === 'ALL') return value
  return 'PENDING'
}

function toObjectTypeView(value: string | null): ObjectTypeView {
  if (value === 'TRACE' || value === 'OBSERVATION' || value === 'SESSION') {
    return value
  }
  return 'ALL'
}

function toScoreStateView(value: string | null): ScoreStateView {
  if (value === 'WITH' || value === 'WITHOUT') return value
  return 'ALL'
}

function toMetadataOperator(value: unknown): MetadataOperator {
  if (value === 'equals' || value === 'exists') return value
  return 'contains'
}

function formatUserName(user: ProjectUserRecord) {
  return user.name || user.email || user.id
}

function summarizeSource(item: AnnotationQueueItemRecord) {
  return [
    item.source.userId,
    stringifyBrief(item.source.input),
    stringifyBrief(item.source.output),
  ]
    .filter(Boolean)
    .join(' / ')
}

function stringifyBrief(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function emptyDraftScore(configId: string): DraftScore {
  return {
    configId,
    value: null,
    stringValue: '',
    comment: '',
  }
}
