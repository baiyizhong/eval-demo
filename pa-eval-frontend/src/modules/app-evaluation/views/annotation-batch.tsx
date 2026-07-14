import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MixerHorizontalIcon } from '@radix-ui/react-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import {
  getProjectAnnotationQueueItemFilterCounts,
  getProjectAnnotationQueue,
  listProjectAnnotationUsers,
  listProjectAnnotationQueueItems,
  saveProjectAnnotationBatchScores,
  saveProjectAnnotationScores,
} from '../api/annotation-api'
import { AnnotationObjectTypeBadge } from '../components/annotation-object-type-badge'
import { AnnotationScoreForm } from '../components/annotation-score-form'
import { AnnotationStatusBadge } from '../components/annotation-status-badge'
import { formatDateTime } from '../components/format'
import {
  type AnnotationItemStatus,
  type AnnotationQueueItemRecord,
  type AnnotationQueueRecord,
  type AnnotationScoreFormInput,
  type ProjectUserRecord,
  type ScoreConfigRecord,
} from '../types'

type StatusView = AnnotationItemStatus | 'ALL'
type FilterOperator = 'contains' | 'equals' | 'exists'
type BatchFilterTarget = 'metadata' | 'input' | 'output'
type BatchFilterCondition = {
  key: string
  operator: FilterOperator
  value: string
}
type BatchColumnKey =
  | 'sourceDataId'
  | 'type'
  | 'status'
  | 'assignee'
  | 'createdAt'
  | 'input'
  | 'output'
  | 'metadata'

const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [10, 20, 50]
const ASSIGNEE_ALL_VALUE = 'ALL'
const BATCH_COLUMN_LABELS: Record<BatchColumnKey, string> = {
  sourceDataId: '源数据 ID',
  type: '类型',
  status: '状态',
  assignee: '预设处理人',
  createdAt: '创建时间',
  input: 'Input',
  output: 'Output',
  metadata: 'Metadata',
}
const DEFAULT_BATCH_COLUMN_VISIBILITY: Record<BatchColumnKey, boolean> = {
  sourceDataId: true,
  type: true,
  status: true,
  assignee: true,
  createdAt: true,
  input: true,
  output: true,
  metadata: true,
}
const MOCK_BATCH_CREATED_AT = '2026-07-08T08:00:00.000Z'
const mockAnnotationUser: ProjectUserRecord = {
  id: 'user_admin',
  name: '测试用户',
  email: 'admin@example.com',
  role: 'ADMIN',
}
const mockScoreConfigs: ScoreConfigRecord[] = [
  {
    id: 'score_accuracy',
    projectId: 'project_customer_agent',
    name: 'accuracy',
    dataType: 'BOOLEAN',
    description: '回答是否准确',
    categories: [],
    archived: false,
    createdAt: MOCK_BATCH_CREATED_AT,
    updatedAt: MOCK_BATCH_CREATED_AT,
  },
  {
    id: 'score_relevance',
    projectId: 'project_customer_agent',
    name: 'relevance',
    dataType: 'NUMERIC',
    description: '相关性评分',
    minValue: 0,
    maxValue: 10,
    categories: [],
    archived: false,
    createdAt: MOCK_BATCH_CREATED_AT,
    updatedAt: MOCK_BATCH_CREATED_AT,
  },
]
const mockAnnotationQueues: AnnotationQueueRecord[] = [
  {
    id: 'queue_mock_batch',
    projectId: 'project_customer_agent',
    name: '客服质检队列',
    description: '人工复核客服 Trace',
    scoreConfigIds: mockScoreConfigs.map((config) => config.id),
    assigneeIds: [mockAnnotationUser.id],
    assignmentStrategy: 'average',
    assignmentWeights: { [mockAnnotationUser.id]: 1 },
    completedCount: 1,
    pendingCount: 1,
    scoreConfigs: mockScoreConfigs,
    assignees: [mockAnnotationUser],
    createdAt: MOCK_BATCH_CREATED_AT,
    updatedAt: MOCK_BATCH_CREATED_AT,
  },
]
const mockAnnotationQueueItems: AnnotationQueueItemRecord[] = [
  {
    id: 'ann_item_mock',
    projectId: 'project_customer_agent',
    queueId: 'queue_mock_batch',
    objectId: 'trace_mock_batch',
    objectType: 'TRACE',
    status: 'PENDING',
    scores: [],
    completedAt: '',
    completedBy: null,
    assignee: mockAnnotationUser,
    createdAt: MOCK_BATCH_CREATED_AT,
    updatedAt: MOCK_BATCH_CREATED_AT,
    source: {
      objectId: 'trace_mock_batch',
      objectType: 'TRACE',
      title: '批量待标注样本',
      input: { question: '如何重置密码？' },
      output: { answer: '请在账户设置中重置密码' },
      metadata: { channel: 'web', source: 'batch_mock' },
      traceId: 'trace_mock_batch',
      observationId: '',
      sessionId: 'session_mock_batch',
      userId: 'mock_customer',
      latencyMs: 920,
      costUsd: 0.002,
      createdAt: MOCK_BATCH_CREATED_AT,
    },
  },
]

export function ProjectAnnotationBatch() {
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projectId = 'project_customer_agent', queueId = '' } = useParams()
  const [page, setPage] = useState(
    readPositiveNumber(searchParams.get('page'), 1)
  )
  const [pageSize, setPageSize] = useState(
    readPositiveNumber(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)
  )
  const [statusView, setStatusView] = useState<StatusView>(
    toStatusView(searchParams.get('status'))
  )
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(
    searchParams.get('assigneeIds') ?? ''
  )
  const [metadataFilters, setMetadataFilters] = useState<
    BatchFilterCondition[]
  >(
    () =>
      readFilterConditions(searchParams.get('metadataFilters')) ??
      readLegacyMetadataCondition(searchParams)
  )
  const [inputFilters, setInputFilters] = useState<BatchFilterCondition[]>(
    () => readFilterConditions(searchParams.get('inputFilters')) ?? []
  )
  const [outputFilters, setOutputFilters] = useState<BatchFilterCondition[]>(
    () => readFilterConditions(searchParams.get('outputFilters')) ?? []
  )
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const [columnVisibility, setColumnVisibility] = useState(
    DEFAULT_BATCH_COLUMN_VISIBILITY
  )
  const [selectedItemId, setSelectedItemId] = useState(
    searchParams.get('item') ?? ''
  )
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [completedItemIds, setCompletedItemIds] = useState<string[]>([])
  const [batchScoreConfigId, setBatchScoreConfigId] = useState('')
  const [scorePaneWidth, setScorePaneWidth] = useState(400)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  const queryState = useMemo(
    () => ({
      page,
      pageSize,
      keyword: '',
      filters: {
        status: statusView === 'ALL' ? [] : [statusView],
        ...(selectedAssigneeId ? { assigneeIds: [selectedAssigneeId] } : {}),
        ...(compactFilterConditions(metadataFilters).length
          ? { metadataFilters: compactFilterConditions(metadataFilters) }
          : {}),
        ...(compactFilterConditions(inputFilters).length
          ? { inputFilters: compactFilterConditions(inputFilters) }
          : {}),
        ...(compactFilterConditions(outputFilters).length
          ? { outputFilters: compactFilterConditions(outputFilters) }
          : {}),
      },
      sorting: [],
    }),
    [
      inputFilters,
      metadataFilters,
      outputFilters,
      page,
      pageSize,
      selectedAssigneeId,
      statusView,
    ]
  )
  const searchString = searchParams.toString()

  useEffect(() => {
    const nextParams = buildBatchSearchParams({
      page,
      pageSize,
      statusView,
      metadataFilters,
      inputFilters,
      outputFilters,
      assigneeId: selectedAssigneeId,
      selectedItemId,
    })
    if (nextParams.toString() !== searchString) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [
    inputFilters,
    metadataFilters,
    outputFilters,
    page,
    pageSize,
    searchString,
    selectedAssigneeId,
    selectedItemId,
    setSearchParams,
    statusView,
  ])

  const queueQuery = useQuery({
    queryKey: ['project-annotation-queue', $api, projectId, queueId],
    queryFn: () => getProjectAnnotationQueue($api, projectId, queueId),
    enabled: Boolean(queueId),
  })
  const itemsQuery = useQuery({
    queryKey: [
      'project-annotation-batch-items',
      $api,
      projectId,
      queueId,
      queryState,
    ],
    queryFn: () =>
      listProjectAnnotationQueueItems($api, projectId, queueId, queryState),
    enabled: Boolean(queueId),
  })
  const usersQuery = useQuery({
    queryKey: ['project-annotation-users', $api, projectId],
    queryFn: () => listProjectAnnotationUsers($api, projectId),
  })
  const filterCountsQuery = useQuery({
    queryKey: [
      'project-annotation-batch-filter-counts',
      $api,
      projectId,
      queueId,
      queryState,
    ],
    queryFn: () =>
      getProjectAnnotationQueueItemFilterCounts(
        $api,
        projectId,
        queueId,
        queryState
      ),
    enabled: Boolean(queueId),
  })

  const mockQueue = useMemo(
    () => createMockBatchQueue(projectId, queueId),
    [projectId, queueId]
  )
  const mockBatchItems = useMemo(
    () => createMockBatchItems(projectId, queueId),
    [projectId, queueId]
  )
  const filteredMockItems = useMemo(
    () =>
      filterMockBatchItems(
        mockBatchItems,
        statusView,
        selectedAssigneeId,
        metadataFilters,
        inputFilters,
        outputFilters
      ),
    [
      inputFilters,
      metadataFilters,
      mockBatchItems,
      outputFilters,
      selectedAssigneeId,
      statusView,
    ]
  )
  const useMockFallback =
    !queueQuery.data &&
    !itemsQuery.isLoading &&
    (itemsQuery.data?.total ?? 0) === 0
  const itemDatas = useMockFallback
    ? filteredMockItems.slice((page - 1) * pageSize, page * pageSize)
    : itemsQuery.data?.datas
  const hideLocallyCompletedItems = statusView === 'PENDING'
  const items = useMemo(
    () =>
      hideLocallyCompletedItems
        ? (itemDatas ?? []).filter(
            (item) => !completedItemIds.includes(item.id)
          )
        : (itemDatas ?? []),
    [completedItemIds, hideLocallyCompletedItems, itemDatas]
  )
  const selectedItemIdsOnPage = useMemo(
    () =>
      selectedItemIds.filter((itemId) =>
        items.some((item) => item.id === itemId)
      ),
    [items, selectedItemIds]
  )
  const selectedItemsOnPage = useMemo(
    () => items.filter((item) => selectedItemIds.includes(item.id)),
    [items, selectedItemIds]
  )
  const isBatchScoring = selectedItemsOnPage.length > 0
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null
  const queue = queueQuery.data ?? mockQueue
  const effectiveBatchScoreConfigId =
    batchScoreConfigId || queue.scoreConfigs[0]?.id || ''
  const assigneeOptions = useMemo(
    () =>
      createBatchAssigneeOptions({
        users: usersQuery.data ?? (useMockFallback ? mockQueue.assignees : []),
        itemAssignees: items
          .map((item) => item.assignee)
          .filter((user): user is ProjectUserRecord => Boolean(user)),
        assigneeCounts: filterCountsQuery.data?.assigneeIds,
        selectedAssigneeId,
      }),
    [
      filterCountsQuery.data?.assigneeIds,
      items,
      mockQueue.assignees,
      selectedAssigneeId,
      useMockFallback,
      usersQuery.data,
    ]
  )
  const localCompletedCount = hideLocallyCompletedItems
    ? completedItemIds.filter((itemId) =>
        (useMockFallback ? filteredMockItems : (itemDatas ?? [])).some(
          (item) => item.id === itemId
        )
      ).length
    : 0
  const totalItems = Math.max(
    0,
    (useMockFallback
      ? filteredMockItems.length
      : (itemsQuery.data?.total ?? 0)) - localCompletedCount
  )
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize))

  const handleSubmit = async (
    input: AnnotationScoreFormInput,
    submitMode: 'save' | 'saveNext'
  ) => {
    if (!selectedItem) return
    const submittedInput =
      isBatchScoring && effectiveBatchScoreConfigId
        ? {
            scores: input.scores.filter(
              (score) => score.configId === effectiveBatchScoreConfigId
            ),
          }
        : input
    let targetIds = isBatchScoring
      ? selectedItemsOnPage.map((item) => item.id)
      : [selectedItem.id]
    if (!useMockFallback && isBatchScoring) {
      const result = await saveProjectAnnotationBatchScores(
        $api,
        projectId,
        queueId,
        {
          filters: {
            status: ['PENDING'],
            itemIds: targetIds,
          },
          scores: submittedInput.scores,
          expectedPendingCount: targetIds.length,
          confirmLargeBatch: targetIds.length > 100,
        }
      )
      targetIds = result.successItemIds
      if (result.failureCount) {
        toast.warning(
          `已保存 ${result.successCount} 条，${result.failureCount} 条失败`
        )
      }
    } else if (!useMockFallback) {
      await saveProjectAnnotationScores(
        $api,
        projectId,
        queueId,
        selectedItem.id,
        submittedInput
      )
    }
    const targetSet = new Set(targetIds)
    const remainingItems = items.filter((item) => !targetSet.has(item.id))
    setCompletedItemIds((current) => [...new Set([...current, ...targetIds])])
    setSelectedItemIds((current) =>
      current.filter((itemId) => !targetSet.has(itemId))
    )
    setSelectedItemId(remainingItems[0]?.id ?? '')
    if (!remainingItems.length && page < pageCount) {
      setPage((current) => Math.min(pageCount, current + 1))
    }
    if (!useMockFallback) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-batch-items'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-batch-filter-counts'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queue', $api, projectId, queueId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-annotation-queues'],
        }),
      ])
    }
    if (isBatchScoring) {
      toast.success(`已批量保存 ${targetIds.length} 条标注结果`)
      return
    }
    if (submitMode === 'saveNext' && remainingItems.length) {
      toast.success('评分已保存，已进入下一条')
      return
    }
    toast.success(
      remainingItems.length ? '评分已保存' : '当前筛选条件下已全部完成'
    )
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
        >
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <span className='truncate text-sm font-medium'>
              {queue?.name ?? '批量标注工作台'}
            </span>
            <span className='text-muted-foreground text-sm'>
              批量标注工作台
            </span>
          </div>
        </PageAction>

        <section
          ref={splitContainerRef}
          style={splitStyle}
          className='bg-card text-card-foreground flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border lg:grid lg:grid-cols-[minmax(520px,1fr)_8px_minmax(320px,var(--annotation-score-width))]'
        >
          <aside className='flex min-h-0 flex-col border-b lg:border-r lg:border-b-0'>
            <div className='grid gap-3 border-b p-3'>
              <div className='flex items-center justify-between gap-3'>
                <label className='flex min-w-0 items-center gap-2 text-sm'>
                  <Checkbox
                    checked={
                      items.length > 0 &&
                      selectedItemIdsOnPage.length === items.length
                        ? true
                        : selectedItemIdsOnPage.length > 0
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={(checked) =>
                      setSelectedItemIds((current) =>
                        checked === true
                          ? [
                              ...new Set([
                                ...current,
                                ...items.map((item) => item.id),
                              ]),
                            ]
                          : current.filter(
                              (itemId) =>
                                !items.some((item) => item.id === itemId)
                            )
                      )
                    }
                    aria-label='全选当前列表数据'
                  />
                  <span className='text-muted-foreground truncate'>
                    本页 {items.length} 条，已选 {selectedItemIdsOnPage.length}{' '}
                    条
                  </span>
                </label>
                <span className='text-muted-foreground text-xs'>
                  共 {totalItems} 条
                </span>
              </div>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select
                    value={statusView}
                    onValueChange={(value) => {
                      setStatusView(value as StatusView)
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className='h-8 w-32'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='PENDING'>待标注</SelectItem>
                      <SelectItem value='COMPLETED'>已完成</SelectItem>
                      <SelectItem value='ALL'>全部</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={selectedAssigneeId || ASSIGNEE_ALL_VALUE}
                    disabled={!assigneeOptions.length}
                    onValueChange={(value) => {
                      setSelectedAssigneeId(
                        value === ASSIGNEE_ALL_VALUE ? '' : value
                      )
                      setSelectedItemId('')
                      setSelectedItemIds([])
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className='h-8 w-36'>
                      <SelectValue placeholder='预设处理人' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ASSIGNEE_ALL_VALUE}>
                        全部预设处理人
                      </SelectItem>
                      {assigneeOptions.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <BatchAdvancedFilterPopover
                    open={advancedFiltersOpen}
                    metadataFilters={metadataFilters}
                    inputFilters={inputFilters}
                    outputFilters={outputFilters}
                    onOpenChange={setAdvancedFiltersOpen}
                    onMetadataFiltersChange={(filters) => {
                      setMetadataFilters(filters)
                      setPage(1)
                    }}
                    onInputFiltersChange={(filters) => {
                      setInputFilters(filters)
                      setPage(1)
                    }}
                    onOutputFiltersChange={(filters) => {
                      setOutputFilters(filters)
                      setPage(1)
                    }}
                    onReset={() => {
                      setMetadataFilters([])
                      setInputFilters([])
                      setOutputFilters([])
                      setPage(1)
                    }}
                  />
                </div>
                <BatchViewOptions
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                />
              </div>
            </div>
            <div className='min-h-0 flex-1 overflow-auto'>
              {itemsQuery.isLoading ? (
                <Loading text='加载标注数据中...' className='min-h-40' />
              ) : null}
              <Table className='min-w-[1080px]'>
                <TableHeader className='bg-card sticky top-0 z-10'>
                  <TableRow>
                    <TableHead className='w-10'>
                      <Checkbox
                        checked={
                          items.length > 0 &&
                          selectedItemIdsOnPage.length === items.length
                            ? true
                            : selectedItemIdsOnPage.length > 0
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={(checked) =>
                          setSelectedItemIds((current) =>
                            checked === true
                              ? [
                                  ...new Set([
                                    ...current,
                                    ...items.map((item) => item.id),
                                  ]),
                                ]
                              : current.filter(
                                  (itemId) =>
                                    !items.some((item) => item.id === itemId)
                                )
                          )
                        }
                        aria-label='全选当前页标注数据'
                      />
                    </TableHead>
                    {columnVisibility.sourceDataId ? (
                      <TableHead className='w-[210px]'>源数据 ID</TableHead>
                    ) : null}
                    {columnVisibility.type ? (
                      <TableHead className='w-[92px]'>类型</TableHead>
                    ) : null}
                    {columnVisibility.status ? (
                      <TableHead className='w-[92px]'>状态</TableHead>
                    ) : null}
                    {columnVisibility.assignee ? (
                      <TableHead className='w-[120px]'>预设处理人</TableHead>
                    ) : null}
                    {columnVisibility.createdAt ? (
                      <TableHead className='w-[132px]'>创建时间</TableHead>
                    ) : null}
                    {columnVisibility.input ? (
                      <TableHead>Input</TableHead>
                    ) : null}
                    {columnVisibility.output ? (
                      <TableHead>Output</TableHead>
                    ) : null}
                    {columnVisibility.metadata ? (
                      <TableHead className='w-[220px]'>Metadata</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <AnnotationItemTableRows
                      key={item.id}
                      item={item}
                      selected={item.id === selectedItem?.id}
                      checked={selectedItemIds.includes(item.id)}
                      columnVisibility={columnVisibility}
                      onCheckedChange={(checked) =>
                        setSelectedItemIds((current) =>
                          checked
                            ? [...new Set([...current, item.id])]
                            : current.filter((itemId) => itemId !== item.id)
                        )
                      }
                      onSelect={() => setSelectedItemId(item.id)}
                    />
                  ))}
                </TableBody>
              </Table>
              {!itemsQuery.isLoading && !items.length ? (
                <div className='text-muted-foreground p-6 text-center text-sm'>
                  当前筛选条件下暂无标注数据
                </div>
              ) : null}
            </div>
            <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-3 text-sm'>
              <div className='text-muted-foreground'>
                第 {page} / {pageCount} 页
              </div>
              <div className='flex items-center gap-2'>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className='h-8 w-28'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option} 条/页
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft data-icon='inline-start' />
                  上一页
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={page >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  下一页
                  <ChevronRight data-icon='inline-end' />
                </Button>
              </div>
            </div>
          </aside>

          <button
            type='button'
            aria-label='调整左右区域宽度'
            className='hover:bg-accent focus-visible:ring-ring bg-muted/30 hidden cursor-col-resize items-center justify-center border-r border-l focus-visible:ring-2 focus-visible:outline-none lg:flex'
            onPointerDown={startResize}
          >
            <GripVertical className='text-muted-foreground' />
          </button>

          <main className='flex min-h-0 flex-col overflow-hidden'>
            {queueQuery.isLoading ? (
              <Loading text='加载批量标注工作台...' className='flex-1' />
            ) : selectedItem && queue ? (
              <section className='flex min-h-0 flex-1 flex-col overflow-hidden'>
                <div className='flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5'>
                  <div className='min-w-0'>
                    <h2 className='text-sm font-semibold'>评分指标</h2>
                    <div className='text-muted-foreground mt-0.5 truncate text-xs'>
                      {isBatchScoring
                        ? `已选择 ${selectedItemsOnPage.length} 条待标注数据`
                        : `当前数据：${selectedItem.source.title || selectedItem.objectId}`}
                    </div>
                  </div>
                  <span className='text-muted-foreground shrink-0 text-xs'>
                    {isBatchScoring
                      ? '批量保存后选中数据会移出左侧列表'
                      : '保存后自动移出左侧列表'}
                  </span>
                </div>
                {isBatchScoring && queue.scoreConfigs.length ? (
                  <div className='flex shrink-0 items-center gap-3 border-b px-3 py-2.5'>
                    <Label className='shrink-0 text-xs'>本次批量保存指标</Label>
                    <Select
                      value={effectiveBatchScoreConfigId}
                      onValueChange={setBatchScoreConfigId}
                    >
                      <SelectTrigger className='h-8 w-full max-w-xs'>
                        <SelectValue placeholder='选择指标' />
                      </SelectTrigger>
                      <SelectContent>
                        {queue.scoreConfigs.map((config) => (
                          <SelectItem key={config.id} value={config.id}>
                            {config.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <AnnotationScoreForm
                  item={selectedItem}
                  scoreConfigs={queue.scoreConfigs}
                  showAddToDataset={false}
                  saveLabel={isBatchScoring ? '批量保存' : '保存'}
                  showSaveNext={!isBatchScoring}
                  submitHint={
                    isBatchScoring
                      ? `将批量保存已选中的 ${selectedItemsOnPage.length} 条样本`
                      : ''
                  }
                  onAddToDataset={() => undefined}
                  onSubmit={handleSubmit}
                />
              </section>
            ) : (
              <div className='text-muted-foreground flex flex-1 items-center justify-center text-sm'>
                请选择一条待标注数据
              </div>
            )}
          </main>
        </section>
      </div>
    </Page>
  )
}

function buildBatchSearchParams({
  page,
  pageSize,
  statusView,
  metadataFilters,
  inputFilters,
  outputFilters,
  assigneeId,
  selectedItemId,
}: {
  page: number
  pageSize: number
  statusView: StatusView
  metadataFilters: BatchFilterCondition[]
  inputFilters: BatchFilterCondition[]
  outputFilters: BatchFilterCondition[]
  assigneeId: string
  selectedItemId: string
}) {
  const params = new URLSearchParams()
  const compactMetadataFilters = compactFilterConditions(metadataFilters)
  const compactInputFilters = compactFilterConditions(inputFilters)
  const compactOutputFilters = compactFilterConditions(outputFilters)
  if (page > 1) params.set('page', String(page))
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(pageSize))
  if (statusView !== 'PENDING') params.set('status', statusView)
  if (assigneeId) params.set('assigneeIds', assigneeId)
  if (compactMetadataFilters.length) {
    params.set('metadataFilters', JSON.stringify(compactMetadataFilters))
  }
  if (compactInputFilters.length) {
    params.set('inputFilters', JSON.stringify(compactInputFilters))
  }
  if (compactOutputFilters.length) {
    params.set('outputFilters', JSON.stringify(compactOutputFilters))
  }
  if (selectedItemId) params.set('item', selectedItemId)
  return params
}

function createBatchAssigneeOptions({
  users,
  itemAssignees,
  assigneeCounts,
  selectedAssigneeId,
}: {
  users: ProjectUserRecord[]
  itemAssignees: ProjectUserRecord[]
  assigneeCounts?: Record<string, number>
  selectedAssigneeId: string
}) {
  const options = new Map<string, { id: string; label: string }>()
  const addUser = (user: Pick<ProjectUserRecord, 'id' | 'name' | 'email'>) => {
    if (!user.id || options.has(user.id)) return
    options.set(user.id, {
      id: user.id,
      label: user.name || user.email || user.id,
    })
  }

  const usersById = new Map(users.map((user) => [user.id, user]))
  const itemAssigneesById = new Map(
    itemAssignees.map((user) => [user.id, user])
  )

  Object.keys(assigneeCounts ?? {}).forEach((assigneeId) => {
    addUser(
      usersById.get(assigneeId) ??
        itemAssigneesById.get(assigneeId) ?? {
          id: assigneeId,
          name: '',
          email: '',
        }
    )
  })
  if (!assigneeCounts) {
    itemAssignees.forEach(addUser)
  }
  if (selectedAssigneeId && !options.has(selectedAssigneeId)) {
    addUser(
      usersById.get(selectedAssigneeId) ?? {
        id: selectedAssigneeId,
        name: '',
        email: '',
      }
    )
  }

  return Array.from(options.values())
}

function toStatusView(value: string | null): StatusView {
  if (value === 'COMPLETED' || value === 'ALL') return value
  return 'PENDING'
}

function readPositiveNumber(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function readFilterConditions(value: string | null) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return null
    return parsed
      .map((item): BatchFilterCondition | null => {
        if (!item || typeof item !== 'object') return null
        const source = item as Partial<BatchFilterCondition>
        const operator = toFilterOperator(source.operator)
        return {
          key: typeof source.key === 'string' ? source.key : '',
          operator,
          value: typeof source.value === 'string' ? source.value : '',
        }
      })
      .filter((item): item is BatchFilterCondition => Boolean(item))
  } catch {
    return null
  }
}

function readLegacyMetadataCondition(searchParams: URLSearchParams) {
  const key = searchParams.get('metadataKey') ?? ''
  const value = searchParams.get('metadataValue') ?? ''
  if (!key.trim()) return []
  return [
    {
      key,
      operator: value.trim() ? 'contains' : 'exists',
      value,
    } satisfies BatchFilterCondition,
  ]
}

function toFilterOperator(value: unknown): FilterOperator {
  return value === 'equals' || value === 'exists' ? value : 'contains'
}

function compactFilterConditions(filters: BatchFilterCondition[]) {
  return filters
    .map((filter) => ({
      key: filter.key.trim(),
      operator: filter.operator,
      value: filter.operator === 'exists' ? '' : filter.value.trim(),
    }))
    .filter((filter) => filter.key || filter.value)
}

function createMockBatchQueue(
  projectId: string,
  queueId: string
): AnnotationQueueRecord {
  const baseQueue = mockAnnotationQueues[0]
  const scoreConfigs = mockScoreConfigs.map((config) => ({
    ...config,
    projectId,
  }))

  return {
    ...baseQueue,
    id: queueId || baseQueue.id,
    projectId,
    name: baseQueue.name,
    description: baseQueue.description,
    scoreConfigIds: scoreConfigs.map((config) => config.id),
    pendingCount: 112,
    completedCount: 16,
    scoreConfigs,
    assignees: baseQueue.assignees,
    assignmentStrategy: baseQueue.assignmentStrategy,
    assignmentWeights: baseQueue.assignmentWeights,
  }
}

function createMockBatchItems(
  projectId: string,
  queueId: string
): AnnotationQueueItemRecord[] {
  return Array.from({ length: 128 }, (_, index) => {
    const baseItem =
      mockAnnotationQueueItems[index % mockAnnotationQueueItems.length]
    const number = String(index + 1).padStart(3, '0')
    const status: AnnotationItemStatus = index < 112 ? 'PENDING' : 'COMPLETED'
    const objectId = `trace_pa_eval_batch_${number}`
    const createdAt = `2026-07-07T${String(9 + Math.floor(index / 12)).padStart(
      2,
      '0'
    )}:${String((index * 5) % 60).padStart(2, '0')}:00.000Z`

    return {
      ...baseItem,
      id: `annitem_mock_batch_${number}`,
      projectId,
      queueId: queueId || baseItem.queueId,
      objectId,
      status,
      scores: status === 'COMPLETED' ? baseItem.scores : [],
      completedAt:
        status === 'COMPLETED'
          ? `2026-07-08T10:${number.slice(1)}:00.000Z`
          : '',
      completedBy: status === 'COMPLETED' ? baseItem.completedBy : null,
      createdAt,
      updatedAt: createdAt,
      source: {
        ...baseItem.source,
        objectId,
        title: `批量待标注样本 ${number}`,
        input: {
          userMessage: `用户咨询订单 ${number} 的处理进度，并补充了较长的上下文说明，需要人工判断回复是否覆盖关键信息。`,
          context: {
            scene: index % 2 === 0 ? '物流异常' : '退款进度',
            ticketId: `ticket_${number}`,
          },
        },
        output: {
          assistantMessage:
            index % 3 === 0
              ? '已说明当前处理状态，但缺少明确的下一步承诺和异常原因解释。'
              : '已解释处理流程、预计时间，并给出可追踪的后续动作。',
          confidence: Number((0.72 + (index % 20) * 0.01).toFixed(2)),
        },
        metadata: {
          channel: index % 2 === 0 ? 'web' : 'app',
          intent: index % 3 === 0 ? 'logistics_exception' : 'refund',
          priority: index % 5 === 0 ? 'high' : 'normal',
          region: ['华东', '华南', '华北'][index % 3],
          source: 'batch_mock',
        },
        traceId: objectId,
        observationId: `obs_pa_eval_batch_${number}`,
        sessionId: `session_pa_eval_batch_${String(
          Math.ceil((index + 1) / 4)
        ).padStart(3, '0')}`,
        userId: `mock_customer_${number}`,
        latencyMs: 1000 + index * 17,
        costUsd: Number((0.002 + index * 0.00003).toFixed(5)),
        createdAt,
      },
    }
  })
}

function filterMockBatchItems(
  items: AnnotationQueueItemRecord[],
  statusView: StatusView,
  selectedAssigneeId: string,
  metadataFilters: BatchFilterCondition[],
  inputFilters: BatchFilterCondition[],
  outputFilters: BatchFilterCondition[]
) {
  const compactMetadataFilters = compactFilterConditions(metadataFilters)
  const compactInputFilters = compactFilterConditions(inputFilters)
  const compactOutputFilters = compactFilterConditions(outputFilters)

  return items.filter((item) => {
    if (statusView !== 'ALL' && item.status !== statusView) return false
    if (selectedAssigneeId && item.assignee?.id !== selectedAssigneeId) {
      return false
    }
    return (
      matchesFilterConditions(item.source.metadata, compactMetadataFilters) &&
      matchesFilterConditions(item.source.input, compactInputFilters) &&
      matchesFilterConditions(item.source.output, compactOutputFilters)
    )
  })
}

function matchesFilterConditions(
  source: unknown,
  filters: ReturnType<typeof compactFilterConditions>
) {
  if (!filters.length) return true
  const sourceText = stringifyBrief(source).toLowerCase()
  const sourceRecord =
    source && typeof source === 'object'
      ? (source as Record<string, unknown>)
      : undefined

  return filters.every((filter) => {
    const key = filter.key.trim()
    const value = filter.value.trim().toLowerCase()
    const candidate =
      key && sourceRecord && key in sourceRecord
        ? stringifyBrief(sourceRecord[key])
        : sourceText

    if (filter.operator === 'exists') {
      return key ? Boolean(candidate) && candidate !== '' : Boolean(sourceText)
    }
    if (!value) return true
    if (filter.operator === 'equals') {
      return candidate.toLowerCase() === value
    }
    return candidate.toLowerCase().includes(value)
  })
}

function AnnotationItemTableRows({
  item,
  selected,
  checked,
  columnVisibility,
  onCheckedChange,
  onSelect,
}: {
  item: AnnotationQueueItemRecord
  selected: boolean
  checked: boolean
  columnVisibility: Record<BatchColumnKey, boolean>
  onCheckedChange: (checked: boolean) => void
  onSelect: () => void
}) {
  const inputText = stringifyBrief(item.source.input)
  const outputText = stringifyBrief(item.source.output)
  const metadataText = stringifyBrief(item.source.metadata)

  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      className='h-11 cursor-pointer'
      onClick={onSelect}
    >
      <TableCell onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-label={`选择 ${item.source.title || item.objectId}`}
        />
      </TableCell>
      {columnVisibility.sourceDataId ? (
        <SummaryTableCell
          label='源数据 ID'
          value={item.objectId}
          className='max-w-[220px]'
        />
      ) : null}
      {columnVisibility.type ? (
        <TableCell>
          <AnnotationObjectTypeBadge objectType={item.objectType} />
        </TableCell>
      ) : null}
      {columnVisibility.status ? (
        <TableCell>
          <AnnotationStatusBadge status={item.status} />
        </TableCell>
      ) : null}
      {columnVisibility.assignee ? (
        <TableCell className='max-w-[140px]'>
          <span className='truncate text-sm'>
            {item.assignee?.name || item.assignee?.email || '-'}
          </span>
        </TableCell>
      ) : null}
      {columnVisibility.createdAt ? (
        <TableCell className='text-muted-foreground text-xs'>
          {formatDateTime(item.createdAt)}
        </TableCell>
      ) : null}
      {columnVisibility.input ? (
        <SummaryTableCell label='Input' value={inputText} />
      ) : null}
      {columnVisibility.output ? (
        <SummaryTableCell label='Output' value={outputText} />
      ) : null}
      {columnVisibility.metadata ? (
        <SummaryTableCell
          label='Metadata'
          value={metadataText}
          className='max-w-[260px]'
        />
      ) : null}
    </TableRow>
  )
}

function BatchAdvancedFilterPopover({
  open,
  metadataFilters,
  inputFilters,
  outputFilters,
  onOpenChange,
  onMetadataFiltersChange,
  onInputFiltersChange,
  onOutputFiltersChange,
  onReset,
}: {
  open: boolean
  metadataFilters: BatchFilterCondition[]
  inputFilters: BatchFilterCondition[]
  outputFilters: BatchFilterCondition[]
  onOpenChange: (open: boolean) => void
  onMetadataFiltersChange: (filters: BatchFilterCondition[]) => void
  onInputFiltersChange: (filters: BatchFilterCondition[]) => void
  onOutputFiltersChange: (filters: BatchFilterCondition[]) => void
  onReset: () => void
}) {
  const [draftMetadataFilters, setDraftMetadataFilters] =
    useState(metadataFilters)
  const [draftInputFilters, setDraftInputFilters] = useState(inputFilters)
  const [draftOutputFilters, setDraftOutputFilters] = useState(outputFilters)
  const activeCount =
    compactFilterConditions(metadataFilters).length +
    compactFilterConditions(inputFilters).length +
    compactFilterConditions(outputFilters).length

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftMetadataFilters(metadataFilters)
      setDraftInputFilters(inputFilters)
      setDraftOutputFilters(outputFilters)
    }
    onOpenChange(nextOpen)
  }

  const resetDraftFilters = () => {
    setDraftMetadataFilters([])
    setDraftInputFilters([])
    setDraftOutputFilters([])
    onReset()
  }

  const applyDraftFilters = () => {
    onMetadataFiltersChange(draftMetadataFilters)
    onInputFiltersChange(draftInputFilters)
    onOutputFiltersChange(draftOutputFilters)
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type='button' variant='outline' size='sm'>
          <SlidersHorizontal data-icon='inline-start' />
          高级筛选{activeCount ? ` ${activeCount}` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[720px] max-w-[calc(100vw-2rem)] p-4'
      >
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h3 className='text-sm font-medium'>高级筛选</h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              按 Metadata、Input、Output 的 key/value 组合过滤当前待标注数据。
            </p>
          </div>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={resetDraftFilters}
          >
            重置
          </Button>
        </div>
        <div className='mt-4 flex max-h-[520px] flex-col gap-4 overflow-auto pr-1'>
          <BatchFilterEditor
            title='Metadata'
            target='metadata'
            filters={draftMetadataFilters}
            onChange={setDraftMetadataFilters}
          />
          <BatchFilterEditor
            title='Input'
            target='input'
            filters={draftInputFilters}
            onChange={setDraftInputFilters}
          />
          <BatchFilterEditor
            title='Output'
            target='output'
            filters={draftOutputFilters}
            onChange={setDraftOutputFilters}
          />
        </div>
        <div className='mt-4 flex justify-end gap-2 border-t pt-3'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button type='button' size='sm' onClick={applyDraftFilters}>
            应用
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function BatchFilterEditor({
  title,
  target,
  filters,
  onChange,
}: {
  title: string
  target: BatchFilterTarget
  filters: BatchFilterCondition[]
  onChange: (filters: BatchFilterCondition[]) => void
}) {
  const updateFilter = (
    index: number,
    patch: Partial<BatchFilterCondition>
  ) => {
    onChange(
      filters.map((filter, currentIndex) =>
        currentIndex === index ? { ...filter, ...patch } : filter
      )
    )
  }
  const addLabel =
    target === 'metadata'
      ? '添加 Metadata 条件'
      : target === 'input'
        ? '添加 Input 条件'
        : '添加 Output 条件'

  return (
    <section className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <Label className='text-sm'>{title}</Label>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() =>
            onChange([...filters, { key: '', operator: 'contains', value: '' }])
          }
        >
          <Plus data-icon='inline-start' />
          {addLabel}
        </Button>
      </div>
      {filters.length ? (
        <div className='flex flex-col gap-2'>
          {filters.map((filter, index) => (
            <div
              key={`${target}-${index}`}
              className='grid grid-cols-[minmax(120px,1fr)_120px_minmax(140px,1fr)_auto] gap-2'
            >
              <Input
                value={filter.key}
                onChange={(event) =>
                  updateFilter(index, { key: event.target.value })
                }
                placeholder={target === 'metadata' ? 'key' : 'key（可选）'}
              />
              <Select
                value={filter.operator}
                onValueChange={(operator) =>
                  updateFilter(index, {
                    operator: operator as FilterOperator,
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
                value={filter.value}
                disabled={filter.operator === 'exists'}
                onChange={(event) =>
                  updateFilter(index, { value: event.target.value })
                }
                placeholder='value'
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={() =>
                  onChange(
                    filters.filter((_, currentIndex) => currentIndex !== index)
                  )
                }
              >
                <Trash2 />
                <span className='sr-only'>删除 {title} 条件</span>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className='text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs'>
          暂未添加{title}条件
        </div>
      )}
    </section>
  )
}

function BatchViewOptions({
  columnVisibility,
  onColumnVisibilityChange,
}: {
  columnVisibility: Record<BatchColumnKey, boolean>
  onColumnVisibilityChange: (
    visibility: Record<BatchColumnKey, boolean>
  ) => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' className='h-8'>
          <MixerHorizontalIcon className='size-4' />
          视图
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[160px]'>
        <DropdownMenuLabel>切换列显示</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(BATCH_COLUMN_LABELS) as BatchColumnKey[]).map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={columnVisibility[key]}
            onCheckedChange={(value) =>
              onColumnVisibilityChange({
                ...columnVisibility,
                [key]: Boolean(value),
              })
            }
          >
            {BATCH_COLUMN_LABELS[key]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SummaryTableCell({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <TableCell className={cn('max-w-[240px]', className)}>
      <HoverCard openDelay={250} closeDelay={100}>
        <HoverCardTrigger asChild>
          <button
            type='button'
            className='hover:text-foreground text-muted-foreground block w-full truncate text-left text-xs'
            onClick={(event) => event.stopPropagation()}
          >
            {value || '-'}
          </button>
        </HoverCardTrigger>
        <HoverCardContent align='start' className='w-[520px] p-3'>
          <div className='text-xs font-medium'>{label}</div>
          <pre className='mt-2 max-h-80 overflow-auto font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'>
            {value || '-'}
          </pre>
        </HoverCardContent>
      </HoverCard>
    </TableCell>
  )
}

function stringifyBrief(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
