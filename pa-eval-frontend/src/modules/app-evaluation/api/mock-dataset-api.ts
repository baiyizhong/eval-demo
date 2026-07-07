import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import { mockDatasetItems, mockDatasets } from '../data/mock-datasets.ts'
import type {
  DatasetExportPayload,
  DatasetFormInput,
  DatasetImportResult,
  DatasetItemFormInput,
  DatasetItemRecord,
  DatasetMetricSummary,
  DatasetRecord,
  DatasetTypeFilter,
} from '../types'

let datasets = clone(mockDatasets)
let datasetItems = clone(mockDatasetItems)

const delay = (ms = 160) => new Promise((resolve) => setTimeout(resolve, ms))

export function resetProjectDatasetMocks() {
  datasets = clone(mockDatasets)
  datasetItems = clone(mockDatasetItems)
}

export async function listProjectDatasetsMock(
  projectId: string,
  query: DataTableQueryState,
  type: DatasetTypeFilter = 'all'
): Promise<DataTableListResponse<DatasetRecord>> {
  await delay()

  const keyword = query.keyword.trim().toLowerCase()
  const rows = datasets
    .filter((dataset) => dataset.projectId === projectId)
    .filter((dataset) => type === 'all' || dataset.type === type)
    .filter((dataset) => {
      if (!keyword) return true
      return dataset.name.toLowerCase().includes(keyword)
    })
    .map(withItemCount)

  return paginate(rows, query)
}

export async function getProjectDatasetMock(
  projectId: string,
  datasetId: string
): Promise<DatasetRecord> {
  await delay()
  return withItemCount(findDataset(projectId, datasetId))
}

export async function getProjectDatasetMetricSummaryMock(
  projectId: string,
  datasetId: string
): Promise<DatasetMetricSummary> {
  await delay()

  const dataset = withItemCount(findDataset(projectId, datasetId))
  const items = listDatasetItems(projectId, datasetId)
  const active = items.filter((item) => item.status === 'ACTIVE').length
  const archived = items.filter((item) => item.status === 'ARCHIVED').length

  return {
    total: items.length,
    active,
    archived,
    updatedAt: dataset.updatedAt,
    specific: buildSpecificMetrics(dataset, items),
  }
}

export async function createProjectDatasetMock(
  projectId: string,
  input: DatasetFormInput
): Promise<DatasetRecord> {
  await delay()

  const now = new Date().toISOString()
  const dataset: DatasetRecord = {
    id: `dataset_${Date.now()}`,
    projectId,
    name: input.name,
    description: input.description,
    type: input.type,
    metadata: { ...input.metadata, type: input.type },
    inputSchema: input.inputSchema,
    expectedOutputSchema: input.expectedOutputSchema,
    itemCount: 0,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  datasets = [dataset, ...datasets]
  return dataset
}

export async function updateProjectDatasetMock(
  projectId: string,
  datasetId: string,
  input: DatasetFormInput
): Promise<DatasetRecord> {
  await delay()

  const index = datasets.findIndex(
    (dataset) => dataset.projectId === projectId && dataset.id === datasetId
  )

  if (index < 0) {
    throw new Error('数据集不存在或已不可用')
  }

  const next: DatasetRecord = {
    ...datasets[index],
    name: input.name,
    description: input.description,
    type: input.type,
    metadata: { ...input.metadata, type: input.type },
    inputSchema: input.inputSchema,
    expectedOutputSchema: input.expectedOutputSchema,
    updatedAt: new Date().toISOString(),
  }

  datasets[index] = next
  return withItemCount(next)
}

export async function deleteProjectDatasetMock(
  projectId: string,
  datasetId: string
): Promise<void> {
  await delay()

  datasets = datasets.filter(
    (dataset) => dataset.projectId !== projectId || dataset.id !== datasetId
  )
  datasetItems = datasetItems.filter(
    (item) => item.projectId !== projectId || item.datasetId !== datasetId
  )
}

export async function importProjectDatasetItemsMock(
  projectId: string,
  datasetId: string,
  file: File
): Promise<DatasetImportResult> {
  await delay()

  findDataset(projectId, datasetId)
  const now = new Date().toISOString()
  const imported: DatasetItemRecord = {
    id: `item_import_${Date.now()}`,
    projectId,
    datasetId,
    status: 'ACTIVE',
    input: { fileName: file.name, sample: 'mock import input' },
    expectedOutput: { answer: 'mock import expected output' },
    metadata: { importFileName: file.name },
    sourceTraceId: '',
    sourceObservationId: '',
    createdAt: now,
    updatedAt: now,
  }

  datasetItems = [imported, ...datasetItems]
  touchDataset(projectId, datasetId)

  return {
    datasetId,
    successCount: 1,
    failureCount: 0,
    failures: [],
  }
}

export async function exportProjectDatasetMock(
  projectId: string,
  datasetId: string
): Promise<DatasetExportPayload> {
  await delay()

  return {
    dataset: withItemCount(findDataset(projectId, datasetId)),
    items: listDatasetItems(projectId, datasetId),
  }
}

export async function listProjectDatasetItemsMock(
  projectId: string,
  datasetId: string,
  query: DataTableQueryState
): Promise<DataTableListResponse<DatasetItemRecord>> {
  await delay()

  const keyword = query.keyword.trim().toLowerCase()
  const statuses = query.filters.status as string[] | undefined
  const rows = listDatasetItems(projectId, datasetId).filter((item) => {
    if (statuses?.length && !statuses.includes(item.status)) return false
    if (!keyword) return true
    return stringifySearch([
      item.id,
      item.input,
      item.expectedOutput,
      item.metadata,
    ])
      .toLowerCase()
      .includes(keyword)
  })

  return paginate(rows, query)
}

export async function createProjectDatasetItemMock(
  projectId: string,
  datasetId: string,
  input: DatasetItemFormInput
): Promise<DatasetItemRecord> {
  await delay()

  findDataset(projectId, datasetId)
  const now = new Date().toISOString()
  const item: DatasetItemRecord = {
    id: `item_${Date.now()}`,
    projectId,
    datasetId,
    status: input.status ?? 'ACTIVE',
    input: input.input,
    expectedOutput: input.expectedOutput,
    metadata: input.metadata,
    sourceTraceId: input.sourceTraceId ?? '',
    sourceObservationId: input.sourceObservationId ?? '',
    createdAt: now,
    updatedAt: now,
  }

  datasetItems = [item, ...datasetItems]
  touchDataset(projectId, datasetId)
  return item
}

export async function updateProjectDatasetItemMock(
  projectId: string,
  datasetId: string,
  itemId: string,
  input: DatasetItemFormInput
): Promise<DatasetItemRecord> {
  await delay()

  const index = datasetItems.findIndex(
    (item) =>
      item.projectId === projectId &&
      item.datasetId === datasetId &&
      item.id === itemId
  )

  if (index < 0) {
    throw new Error('数据项不存在或已不可用')
  }

  const next: DatasetItemRecord = {
    ...datasetItems[index],
    status: input.status ?? datasetItems[index].status,
    input: input.input,
    expectedOutput: input.expectedOutput,
    metadata: input.metadata,
    sourceTraceId: input.sourceTraceId ?? datasetItems[index].sourceTraceId,
    sourceObservationId:
      input.sourceObservationId ?? datasetItems[index].sourceObservationId,
    updatedAt: new Date().toISOString(),
  }

  datasetItems[index] = next
  touchDataset(projectId, datasetId)
  return next
}

export async function archiveProjectDatasetItemMock(
  projectId: string,
  datasetId: string,
  itemId: string
): Promise<DatasetItemRecord> {
  await delay()

  const item = findDatasetItem(projectId, datasetId, itemId)
  return updateProjectDatasetItemMock(projectId, datasetId, itemId, {
    status: 'ARCHIVED',
    input: item.input,
    expectedOutput: item.expectedOutput,
    metadata: item.metadata,
    sourceTraceId: item.sourceTraceId,
    sourceObservationId: item.sourceObservationId,
  })
}

export async function exportProjectDatasetItemsMock(
  projectId: string,
  datasetId: string,
  itemIds: string[]
): Promise<DatasetExportPayload> {
  await delay()

  return {
    dataset: withItemCount(findDataset(projectId, datasetId)),
    items: listDatasetItems(projectId, datasetId).filter((item) =>
      itemIds.includes(item.id)
    ),
  }
}

function findDataset(projectId: string, datasetId: string) {
  const dataset = datasets.find(
    (item) => item.projectId === projectId && item.id === datasetId
  )

  if (!dataset) {
    throw new Error('数据集不存在或已不可用')
  }

  return dataset
}

function findDatasetItem(projectId: string, datasetId: string, itemId: string) {
  const item = datasetItems.find(
    (row) =>
      row.projectId === projectId &&
      row.datasetId === datasetId &&
      row.id === itemId
  )

  if (!item) {
    throw new Error('数据项不存在或已不可用')
  }

  return item
}

function listDatasetItems(projectId: string, datasetId: string) {
  return datasetItems.filter(
    (item) => item.projectId === projectId && item.datasetId === datasetId
  )
}

function withItemCount(dataset: DatasetRecord): DatasetRecord {
  return {
    ...dataset,
    itemCount: listDatasetItems(dataset.projectId, dataset.id).length,
  }
}

function touchDataset(projectId: string, datasetId: string) {
  const index = datasets.findIndex(
    (dataset) => dataset.projectId === projectId && dataset.id === datasetId
  )

  if (index >= 0) {
    datasets[index] = {
      ...datasets[index],
      updatedAt: new Date().toISOString(),
    }
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

function buildSpecificMetrics(
  dataset: DatasetRecord,
  items: DatasetItemRecord[]
) {
  if (dataset.type === 'evaluation') {
    const expectedFilled = items.filter((item) => item.expectedOutput).length
    return [
      {
        label: '期望输出完整率',
        value: items.length
          ? `${Math.round((expectedFilled / items.length) * 100)}%`
          : '-',
      },
      { label: 'Schema 通过率', value: items.length ? '96%' : '-' },
    ]
  }

  if (dataset.type === 'badcase') {
    const high = items.filter(
      (item) => item.metadata.priority === 'high'
    ).length
    return [
      { label: '待处理数量', value: String(items.length) },
      { label: '高优先级数量', value: String(high) },
    ]
  }

  if (dataset.type === 'golden') {
    const tags = new Set(
      items.flatMap((item) =>
        Array.isArray(item.metadata.tags) ? item.metadata.tags : []
      )
    )
    return [
      { label: '有效样本数', value: String(items.length) },
      { label: '覆盖标签数', value: String(tags.size) },
    ]
  }

  const anomalyTypes = new Set(
    items
      .map((item) => item.metadata.anomalyType)
      .filter((value): value is string => typeof value === 'string')
  )
  return [
    { label: '异常类型数', value: String(anomalyTypes.size) },
    {
      label: '高优先级数量',
      value: String(
        items.filter((item) => item.metadata.priority === 'high').length
      ),
    },
  ]
}

function stringifySearch(values: unknown[]) {
  return values.map((value) => JSON.stringify(value)).join(' ')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
