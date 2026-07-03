import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import { createProjectDatasetItemMock } from './mock-dataset-api'
import {
  mockAnnotationQueueItems,
  mockAnnotationQueues,
  mockAnnotationUsers,
  mockScoreConfigs,
} from '../data/mock-annotations'
import type {
  AddAnnotationItemToDatasetInput,
  AnnotationNavigationResult,
  AnnotationQueueExportPayload,
  AnnotationQueueFormInput,
  AnnotationQueueItemRecord,
  AnnotationQueueMetricSummary,
  AnnotationQueueRecord,
  AnnotationScoreFormInput,
  AnnotationScoreRecord,
} from '../types'

let queues = clone(mockAnnotationQueues)
let items = clone(mockAnnotationQueueItems)

const currentUser = mockAnnotationUsers[0]
const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

export function resetProjectAnnotationMocks() {
  queues = clone(mockAnnotationQueues)
  items = clone(mockAnnotationQueueItems)
}

export async function listProjectAnnotationQueuesMock(
  projectId: string,
  query: DataTableQueryState
): Promise<DataTableListResponse<AnnotationQueueRecord>> {
  await delay()

  const keyword = query.keyword.trim().toLowerCase()
  const assignees = query.filters.assigneeIds as string[] | undefined
  const pendingState = query.filters.pendingState as string[] | undefined
  const rows = queues
    .filter((queue) => queue.projectId === projectId)
    .map(hydrateQueue)
    .filter((queue) => {
      if (!keyword) return true
      return [queue.name, queue.description].join(' ').toLowerCase().includes(keyword)
    })
    .filter((queue) => {
      if (!assignees?.length) return true
      return assignees.some((id) => queue.assigneeIds.includes(id))
    })
    .filter((queue) => {
      if (!pendingState?.length) return true
      if (pendingState.includes('hasPending')) return queue.pendingCount > 0
      if (pendingState.includes('completed')) return queue.pendingCount === 0
      return true
    })

  return paginate(rows, query)
}

export async function getProjectAnnotationQueueMock(
  projectId: string,
  queueId: string
): Promise<AnnotationQueueRecord> {
  await delay()
  return hydrateQueue(findQueue(projectId, queueId))
}

export async function getProjectAnnotationQueueMetricSummaryMock(
  projectId: string,
  queueId: string
): Promise<AnnotationQueueMetricSummary> {
  await delay()

  const queueItems = listQueueItems(projectId, queueId)
  const completed = queueItems.filter((item) => item.status === 'COMPLETED').length
  const pending = queueItems.filter((item) => item.status === 'PENDING').length

  return {
    total: queueItems.length,
    pending,
    completed,
    completionRate: queueItems.length
      ? Math.round((completed / queueItems.length) * 100)
      : 0,
    updatedAt: hydrateQueue(findQueue(projectId, queueId)).updatedAt,
  }
}

export async function createProjectAnnotationQueueMock(
  projectId: string,
  input: AnnotationQueueFormInput
): Promise<AnnotationQueueRecord> {
  await delay()

  const now = new Date().toISOString()
  const queue: AnnotationQueueRecord = {
    id: `queue_${Date.now()}`,
    projectId,
    name: input.name,
    description: input.description,
    scoreConfigIds: input.scoreConfigIds,
    assigneeIds: input.assigneeIds,
    completedCount: 0,
    pendingCount: 0,
    scoreConfigs: [],
    assignees: [],
    createdAt: now,
    updatedAt: now,
  }

  queues = [queue, ...queues]
  return hydrateQueue(queue)
}

export async function updateProjectAnnotationQueueMock(
  projectId: string,
  queueId: string,
  input: AnnotationQueueFormInput
): Promise<AnnotationQueueRecord> {
  await delay()

  const index = queues.findIndex(
    (queue) => queue.projectId === projectId && queue.id === queueId
  )
  if (index < 0) throw new Error('人工评测任务不存在或已不可用')

  queues[index] = {
    ...queues[index],
    name: input.name,
    description: input.description,
    scoreConfigIds: input.scoreConfigIds,
    assigneeIds: input.assigneeIds,
    updatedAt: new Date().toISOString(),
  }

  return hydrateQueue(queues[index])
}

export async function deleteProjectAnnotationQueueMock(
  projectId: string,
  queueId: string
): Promise<void> {
  await delay()

  queues = queues.filter(
    (queue) => queue.projectId !== projectId || queue.id !== queueId
  )
  items = items.filter(
    (item) => item.projectId !== projectId || item.queueId !== queueId
  )
}

export async function listProjectAnnotationQueueItemsMock(
  projectId: string,
  queueId: string,
  query: DataTableQueryState
): Promise<DataTableListResponse<AnnotationQueueItemRecord>> {
  await delay()
  return paginate(filterQueueItems(projectId, queueId, query), query)
}

export async function getProjectAnnotationQueueItemMock(
  projectId: string,
  queueId: string,
  itemId: string
): Promise<AnnotationQueueItemRecord> {
  await delay()
  return findQueueItem(projectId, queueId, itemId)
}

export async function getProjectAnnotationNavigationMock(
  projectId: string,
  queueId: string,
  itemId: string,
  query: DataTableQueryState
): Promise<AnnotationNavigationResult> {
  await delay()

  const rows = filterQueueItems(projectId, queueId, {
    ...query,
    page: 1,
    pageSize: Number.MAX_SAFE_INTEGER,
  })
  const index = rows.findIndex((item) => item.id === itemId)
  if (index < 0) throw new Error('当前筛选条件下找不到该标注数据')

  return {
    current: rows[index],
    previous: rows[index - 1] ?? null,
    next: rows[index + 1] ?? null,
    index,
    total: rows.length,
  }
}

export async function saveProjectAnnotationScoresMock(
  projectId: string,
  queueId: string,
  itemId: string,
  input: AnnotationScoreFormInput
): Promise<AnnotationQueueItemRecord> {
  await delay()

  const index = items.findIndex(
    (item) =>
      item.projectId === projectId &&
      item.queueId === queueId &&
      item.id === itemId
  )
  if (index < 0) throw new Error('标注数据不存在或已不可用')

  const now = new Date().toISOString()
  const scores: AnnotationScoreRecord[] = input.scores.map((score) => {
    const config = mockScoreConfigs.find((item) => item.id === score.configId)
    if (!config) throw new Error('评分指标不存在')

    const existing = items[index].scores.find(
      (item) => item.configId === score.configId
    )

    return {
      id: existing?.id ?? `score_${Date.now()}_${score.configId}`,
      configId: score.configId,
      name: config.name,
      dataType: config.dataType,
      value: score.value,
      stringValue: score.stringValue,
      comment: score.comment,
      authorUserId: currentUser.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  })

  items[index] = {
    ...items[index],
    status: 'COMPLETED',
    scores,
    completedAt: items[index].completedAt || now,
    completedBy: currentUser,
    updatedAt: now,
  }
  touchQueue(projectId, queueId)
  return items[index]
}

export async function deleteProjectAnnotationQueueItemsMock(
  projectId: string,
  queueId: string,
  itemIds: string[]
): Promise<void> {
  await delay()

  items = items.filter(
    (item) =>
      item.projectId !== projectId ||
      item.queueId !== queueId ||
      !itemIds.includes(item.id)
  )
  touchQueue(projectId, queueId)
}

export async function exportProjectAnnotationQueueMock(
  projectId: string,
  queueId: string,
  query: DataTableQueryState
): Promise<AnnotationQueueExportPayload> {
  await delay()

  return {
    queue: hydrateQueue(findQueue(projectId, queueId)),
    items: filterQueueItems(projectId, queueId, {
      ...query,
      page: 1,
      pageSize: Number.MAX_SAFE_INTEGER,
    }),
  }
}

export async function exportProjectAnnotationQueueItemsMock(
  projectId: string,
  queueId: string,
  itemIds: string[]
): Promise<AnnotationQueueExportPayload> {
  await delay()

  return {
    queue: hydrateQueue(findQueue(projectId, queueId)),
    items: listQueueItems(projectId, queueId).filter((item) =>
      itemIds.includes(item.id)
    ),
  }
}

export async function addProjectAnnotationItemToDatasetMock(
  projectId: string,
  queueId: string,
  itemId: string,
  input: AddAnnotationItemToDatasetInput
) {
  await delay()

  const item = findQueueItem(projectId, queueId, itemId)
  return createProjectDatasetItemMock(projectId, input.datasetId, {
    input: input.input,
    expectedOutput: input.expectedOutput,
    metadata: {
      ...input.metadata,
      source: 'manual_annotation',
      annotationQueueId: queueId,
      annotationQueueItemId: itemId,
      annotatorUserId: currentUser.id,
      scoreIds: item.scores.map((score) => score.id),
    },
    sourceTraceId: item.source.traceId,
    sourceObservationId: item.source.observationId,
  })
}

function filterQueueItems(
  projectId: string,
  queueId: string,
  query: DataTableQueryState
) {
  const keyword = query.keyword.trim().toLowerCase()
  const statuses = query.filters.status as string[] | undefined
  const objectTypes = query.filters.objectType as string[] | undefined
  const annotators = query.filters.completedBy as string[] | undefined

  return listQueueItems(projectId, queueId).filter((item) => {
    if (statuses?.length && !statuses.includes(item.status)) return false
    if (objectTypes?.length && !objectTypes.includes(item.objectType)) return false
    if (annotators?.length && !annotators.includes(item.completedBy?.id ?? '')) {
      return false
    }
    if (!keyword) return true

    return stringifySearch([
      item.id,
      item.objectId,
      item.objectType,
      item.source.title,
      item.source.input,
      item.source.output,
      item.source.metadata,
    ])
      .toLowerCase()
      .includes(keyword)
  })
}

function hydrateQueue(queue: AnnotationQueueRecord): AnnotationQueueRecord {
  const queueItems = items.filter(
    (item) => item.projectId === queue.projectId && item.queueId === queue.id
  )

  return {
    ...queue,
    completedCount: queueItems.filter((item) => item.status === 'COMPLETED').length,
    pendingCount: queueItems.filter((item) => item.status === 'PENDING').length,
    scoreConfigs: mockScoreConfigs.filter((config) =>
      queue.scoreConfigIds.includes(config.id)
    ),
    assignees: mockAnnotationUsers.filter((user) =>
      queue.assigneeIds.includes(user.id)
    ),
  }
}

function findQueue(projectId: string, queueId: string) {
  const queue = queues.find(
    (item) => item.projectId === projectId && item.id === queueId
  )
  if (!queue) throw new Error('人工评测任务不存在或已不可用')
  return queue
}

function findQueueItem(projectId: string, queueId: string, itemId: string) {
  const item = items.find(
    (row) =>
      row.projectId === projectId &&
      row.queueId === queueId &&
      row.id === itemId
  )
  if (!item) throw new Error('标注数据不存在或已不可用')
  return item
}

function listQueueItems(projectId: string, queueId: string) {
  return items.filter(
    (item) => item.projectId === projectId && item.queueId === queueId
  )
}

function touchQueue(projectId: string, queueId: string) {
  const index = queues.findIndex(
    (queue) => queue.projectId === projectId && queue.id === queueId
  )

  if (index >= 0) {
    queues[index] = { ...queues[index], updatedAt: new Date().toISOString() }
  }
}

function paginate<T>(
  rows: T[],
  query: DataTableQueryState
): DataTableListResponse<T> {
  const start = (query.page - 1) * query.pageSize

  return {
    total: rows.length,
    datas: rows.slice(start, start + query.pageSize),
  }
}

function stringifySearch(values: unknown[]) {
  return values.map((value) => JSON.stringify(value)).join(' ')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
