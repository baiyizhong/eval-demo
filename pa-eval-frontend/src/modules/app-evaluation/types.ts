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

export type AnnotationObjectType = 'TRACE' | 'OBSERVATION' | 'SESSION'

export type AnnotationItemStatus = 'PENDING' | 'COMPLETED'

export type ScoreDataType = 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN' | 'TEXT'

export type ProjectUserRecord = {
  id: string
  name: string
  email: string
}

export type ScoreConfigRecord = {
  id: string
  projectId: string
  name: string
  dataType: ScoreDataType
  description: string
  minValue?: number
  maxValue?: number
  categories?: string[]
  archived?: boolean
}

export type AnnotationQueueRecord = {
  id: string
  projectId: string
  name: string
  description: string
  scoreConfigIds: string[]
  assigneeIds: string[]
  completedCount: number
  pendingCount: number
  scoreConfigs: ScoreConfigRecord[]
  assignees: ProjectUserRecord[]
  createdAt: string
  updatedAt: string
}

export type AnnotationQueueFormInput = {
  name: string
  description: string
  scoreConfigIds: string[]
  assigneeIds: string[]
}

export type AnnotationScoreRecord = {
  id: string
  configId: string
  name: string
  dataType: ScoreDataType
  value: number | boolean | null
  stringValue: string
  comment: string
  authorUserId: string
  createdAt: string
  updatedAt: string
}

export type AnnotationSourceSnapshot = {
  objectId: string
  objectType: AnnotationObjectType
  title: string
  input: unknown
  output: unknown
  metadata: JsonObject
  traceId: string
  observationId: string
  sessionId: string
  userId: string
  latencyMs: number
  costUsd: number
  createdAt: string
}

export type AnnotationQueueItemRecord = {
  id: string
  projectId: string
  queueId: string
  objectId: string
  objectType: AnnotationObjectType
  status: AnnotationItemStatus
  source: AnnotationSourceSnapshot
  scores: AnnotationScoreRecord[]
  completedAt: string
  completedBy: ProjectUserRecord | null
  createdAt: string
  updatedAt: string
}

export type AnnotationQueueMetricSummary = {
  total: number
  pending: number
  completed: number
  completionRate: number
  updatedAt: string
}

export type AnnotationScoreFormInput = {
  scores: {
    configId: string
    value: number | boolean | null
    stringValue: string
    comment: string
  }[]
}

export type AddAnnotationItemToDatasetInput = {
  datasetId: string
  input: unknown
  expectedOutput: unknown
  metadata: JsonObject
}

export type AnnotationQueueExportPayload = {
  queue: AnnotationQueueRecord
  items: AnnotationQueueItemRecord[]
}

export type AnnotationNavigationResult = {
  current: AnnotationQueueItemRecord
  previous: AnnotationQueueItemRecord | null
  next: AnnotationQueueItemRecord | null
  index: number
  total: number
}

export const annotationObjectTypeLabels: Record<AnnotationObjectType, string> = {
  TRACE: '追踪',
  OBSERVATION: '观测',
  SESSION: '会话',
}

export const annotationItemStatusLabels: Record<AnnotationItemStatus, string> = {
  PENDING: '待处理',
  COMPLETED: '已完成',
}

export const scoreDataTypeLabels: Record<ScoreDataType, string> = {
  NUMERIC: '数值',
  CATEGORICAL: '分类',
  BOOLEAN: '布尔',
  TEXT: '文本',
}
