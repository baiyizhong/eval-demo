export type DatasetType = 'evaluation' | 'badcase' | 'golden' | 'anomaly'

export type DatasetTypeFilter = DatasetType | 'all'

export type DatasetItemStatus = 'ACTIVE' | 'ARCHIVED'

export type JsonObject = Record<string, unknown>

export type DatasetRecord = {
  id: string
  projectId: string
  name: string
  description: string
  type: DatasetType
  metadata: JsonObject & { type: DatasetType }
  inputSchema: JsonObject
  expectedOutputSchema: JsonObject
  itemCount: number
  runCount: number
  createdAt: string
  updatedAt: string
}

export type DatasetItemRecord = {
  id: string
  projectId: string
  datasetId: string
  status: DatasetItemStatus
  input: unknown
  expectedOutput: unknown
  metadata: JsonObject
  sourceTraceId: string
  sourceObservationId: string
  createdAt: string
  updatedAt: string
}

export type DatasetFormInput = {
  name: string
  type: DatasetType
  description: string
  metadata: JsonObject
  inputSchema: JsonObject
  expectedOutputSchema: JsonObject
}

export type DatasetItemFormInput = {
  input: unknown
  expectedOutput: unknown
  metadata: JsonObject
  status?: DatasetItemStatus
  sourceTraceId?: string
  sourceObservationId?: string
}

export type DatasetExportPayload = {
  dataset: DatasetRecord
  items: DatasetItemRecord[]
}

export type DatasetImportResult = {
  datasetId: string
  successCount: number
  failureCount: number
  failures: {
    row: number
    field: string
    reason: string
  }[]
}

export type DatasetMetricSummary = {
  total: number
  active: number
  archived: number
  updatedAt: string
  specific: {
    label: string
    value: string
  }[]
}

export const datasetTypeLabels: Record<DatasetType, string> = {
  evaluation: '评测集',
  badcase: 'badcase集',
  golden: '黄金级',
  anomaly: '异常集',
}

export const datasetStatusLabels: Record<DatasetItemStatus, string> = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
}
