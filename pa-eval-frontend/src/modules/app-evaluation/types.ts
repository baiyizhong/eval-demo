import type { TraceLogRow } from '@/modules/app-observability/types'
import type { EvaluationScenario } from './lib/evaluation-scenarios'

export type DatasetType = 'evaluation' | 'badcase' | 'golden' | 'anomaly'

export type DatasetTypeFilter = DatasetType | 'all'

export type DatasetItemStatus = 'ACTIVE' | 'ARCHIVED'

export type DatasetExportFormat = 'xlsx' | 'csv' | 'txt'

export type DatasetExportJobStatus =
  'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

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

export type DatasetExportJobRecord = {
  id: string
  projectId: string
  datasetId: string
  format: DatasetExportFormat
  status: DatasetExportJobStatus
  totalCount: number
  exportedCount: number
  fileName: string
  fileSize: number
  errorMessage: string
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export type DatasetExportFiltersInput = {
  keyword?: string
  status?: DatasetItemStatus[]
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
  golden: '黄金集',
  anomaly: '异常集',
}

export const datasetStatusLabels: Record<DatasetItemStatus, string> = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
}

export type AnnotationObjectType = 'TRACE' | 'OBSERVATION' | 'SESSION'

export type AnnotationItemStatus = 'PENDING' | 'COMPLETED'

export type AnnotationAssignmentStrategy = 'average' | 'random' | 'weighted'

export type AnnotationExportScope = 'filtered' | 'selected'

export type AnnotationExportFormat = 'xlsx' | 'csv' | 'txt'

export type AnnotationExportJobStatus =
  'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export type ScoreDataType = 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN' | 'TEXT'

export type ScoreConfigCategory = {
  label: string
  value: number
}

export type ProjectUserRecord = {
  id: string
  name: string
  email: string
  role?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | null
  organizationRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | 'NONE' | null
  projectRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | 'NONE' | null
  status?: 'active' | 'pending'
  invitedBy?: {
    name?: string | null
    email?: string | null
  }
  createdAt?: string
}

export type ScoreConfigRecord = {
  id: string
  projectId: string
  name: string
  dataType: ScoreDataType
  description: string
  minValue?: number
  maxValue?: number
  categories?: ScoreConfigCategory[]
  archived?: boolean
  createdAt?: string
  updatedAt?: string
}

export type AnnotationQueueRecord = {
  id: string
  projectId: string
  name: string
  description: string
  scoreConfigIds: string[]
  assigneeIds: string[]
  assignmentStrategy: AnnotationAssignmentStrategy
  assignmentWeights: Record<string, number>
  completedCount: number
  pendingCount: number
  scoreConfigs: ScoreConfigRecord[]
  assignees: ProjectUserRecord[]
  createdAt: string
  updatedAt: string
}

export type AnnotationExportPreviewRow = Record<string, string>

export type AnnotationExportPreview = {
  queue: AnnotationQueueRecord
  metrics: {
    total: number
    completed: number
    pending: number
  }
  scoreConfigs: ScoreConfigRecord[]
  metadataKeys: string[]
  previewItems: AnnotationExportPreviewRow[]
}

export type AnnotationExportJobRecord = {
  id: string
  projectId: string
  queueId: string
  scope: AnnotationExportScope
  format: AnnotationExportFormat
  status: AnnotationExportJobStatus
  totalCount: number
  exportedCount: number
  fileName: string
  fileSize: number
  errorMessage: string
  metadata: JsonObject
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export type AnnotationQueueFormInput = {
  name: string
  description: string
  scoreConfigIds: string[]
  assigneeIds: string[]
  assignmentStrategy: AnnotationAssignmentStrategy
  assignmentWeights: Record<string, number>
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
  assignee: ProjectUserRecord | null
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

export type AnnotationQueueItemFilterCounts = {
  status: Record<AnnotationItemStatus, number>
  objectType: Record<AnnotationObjectType, number>
  assigneeIds: Record<string, number>
}

export type AnnotationQueueItemAssigneeUpdateResult = {
  assigneeUserId: string
  requestedCount: number
  updatedCount: number
  skippedCount: number
  updatedItemIds: string[]
  skippedItemIds: string[]
}

export type AnnotationScoreFormInput = {
  scores: {
    configId: string
    value: number | boolean | null
    stringValue: string
    comment: string
  }[]
}

export type AnnotationBatchFiltersInput = {
  keyword?: string
  status?: AnnotationItemStatus[]
  objectType?: AnnotationObjectType[]
  completedBy?: string[]
  assigneeIds?: string[]
  createdAtFrom?: string
  createdAtTo?: string
  completedAtFrom?: string
  completedAtTo?: string
  hasScores?: boolean
  metadataFilter?: {
    key: string
    operator: 'contains' | 'equals' | 'exists'
    value?: string
  }
  metadataFilters?: {
    key: string
    operator: 'contains' | 'equals' | 'exists'
    value?: string
  }[]
  inputFilters?: {
    key: string
    operator: 'contains' | 'equals' | 'exists'
    value?: string
  }[]
  outputFilters?: {
    key: string
    operator: 'contains' | 'equals' | 'exists'
    value?: string
  }[]
  itemIds?: string[]
}

export type AnnotationBatchPreviewResult = {
  totalCount: number
  pendingCount: number
  completedCount: number
  samples: AnnotationQueueItemRecord[]
  filterSummary: string
}

export type AnnotationBatchSaveResult = {
  successCount: number
  failureCount: number
  skippedCount: number
  successItemIds: string[]
  failures: {
    itemId: string
    reason: string
  }[]
  filterSummary: string
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

export const annotationObjectTypeLabels: Record<AnnotationObjectType, string> =
  {
    TRACE: '追踪',
    OBSERVATION: '观测',
    SESSION: '会话',
  }

export const annotationItemStatusLabels: Record<AnnotationItemStatus, string> =
  {
    PENDING: '待处理',
    COMPLETED: '已完成',
  }

export const scoreDataTypeLabels: Record<ScoreDataType, string> = {
  NUMERIC: '数值',
  CATEGORICAL: '分类',
  BOOLEAN: '布尔',
  TEXT: '文本',
}

export type AutoEvaluationTaskStatus =
  'DRAFT' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type AutoEvaluationEvaluatorType =
  'LLM_AS_JUDGE' | 'CODE' | 'WORKFLOW' | 'SDK' | 'SKILL'

export type AutoEvaluationDataSourceType = 'DATASET' | 'TRACE_FILTER'

export type EvaluationReportSourceType = 'AUTO_EVAL' | 'MANUAL_ANNOTATION'

export type EvaluationReportStatus = 'GENERATING' | 'READY' | 'FAILED'

export type EvaluationReportFlowbackType = 'BADCASE' | 'EVALUATION_DATA'

export type EvaluationReportFlowbackStatus =
  'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL_FAILED' | 'FAILED'

export type EvaluationReportTemplateSectionKey =
  | 'metrics'
  | 'distribution'
  | 'groupAnalysis'
  | 'recommendations'
  | 'risks'
  | 'reproduction'
  | 'items'
  | 'badcases'

export type EvaluationReportTemplateRecord = {
  id: string
  projectId: string
  name: string
  description: string
  isDefault: boolean
  titleTemplate: string
  summaryTemplate: string
  sections: Record<EvaluationReportTemplateSectionKey, boolean>
  badcaseRule: {
    mode: 'EVALUATOR_RESULT' | 'SCORE_THRESHOLD'
    operator?: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ'
    threshold?: number
  }
  recommendations: string[]
  risks: string[]
  status: 'ACTIVE'
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AutoEvaluationEvaluatorSummary = {
  id: string
  name: string
  type: AutoEvaluationEvaluatorType
  version: string
  evaluationScenario?: EvaluationScenario
}

export type AutoEvaluationDataSourceSummary = {
  type: AutoEvaluationDataSourceType
  name: string
  sampleCount: number
}

export type AutoEvaluationExecutionStats = {
  pending: number
  running: number
  completed: number
  failed: number
  cancelled: number
}

export type AutoEvaluationLatestReportSummary = {
  id: string
  title: string
  status: EvaluationReportStatus
  generatedAt: string
  sampleCount: number
  badcaseCount: number
  summary: string
  errorMessage?: string
}

export type AutoEvaluationTaskRecord = {
  id: string
  projectId: string
  name: string
  description: string
  scoreName: string
  status: AutoEvaluationTaskStatus
  evaluator: AutoEvaluationEvaluatorSummary
  dataSource: AutoEvaluationDataSourceSummary
  sampleRate: number
  executionStats: AutoEvaluationExecutionStats
  badcaseCount: number
  createdBy: string
  createdAt: string
  lastRunAt: string
  updatedAt: string
  latestReport?: AutoEvaluationLatestReportSummary
}

export type MockAutoEvaluationEvaluator = AutoEvaluationEvaluatorSummary & {
  variables: string[]
  outputVariables?: string[]
  outputVariableMappings?: {
    variableName: string
    scoreConfigId?: string
    scoreConfigName: string
  }[]
  description: string
  updatedAt: string
}

export type MockAutoEvaluationDataset = {
  id: string
  projectId?: string
  projectName?: string
  name: string
  description: string
  itemCount: number
  updatedAt: string
}

export type AutoEvaluationRunRecord = {
  id: string
  projectId: string
  taskId: string
  status: Exclude<AutoEvaluationTaskStatus, 'DRAFT' | 'READY'>
  sampleCount: number
  completedCount: number
  failedCount: number
  badcaseCount: number
  startedAt: string
  endedAt: string
  durationText: string
  errorMessage?: string
}

export type AutoEvaluationTaskFormInput = {
  name: string
  description: string
  scoreName: string
  scoreMapping: Record<
    string,
    {
      scoreConfigId: string
      scoreConfigName: string
    }
  >
  evaluatorId: string
  variableMapping: Record<string, string>
  reportTemplateId: string
  dataSource:
    | { type: 'DATASET'; datasetId: string; projectId?: string }
    | {
        type: 'TRACE_FILTER'
        timeRange: '' | '1d' | '3d' | '7d'
        createdAtRange: string[]
        environments: string[]
        userId: string
        sessionId: string
        tags: string[]
        estimatedCount: number
      }
  sampleRate: number
  badcase: {
    enabled: boolean
    scoreName: string
    operator: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ'
    threshold: number | null
  }
}

export type EvaluationReportRecord = {
  id: string
  projectId: string
  title: string
  sourceType: EvaluationReportSourceType
  sourceTaskId: string
  sourceTaskName: string
  status: EvaluationReportStatus
  sampleCount: number
  badcaseCount: number
  flowbackCount: number
  generatedAt: string
  summary: string
  errorMessage?: string
}

export type EvaluationReportBadcaseRecord = TraceLogRow

export type EvaluationReportItemRecord = {
  id: string
  reportId: string
  sourceId: string
  traceId?: string
  observationId?: string
  input?: unknown
  output?: unknown
  expectedOutput?: unknown
  rawResult?: unknown
  extra?: Record<string, unknown>
  reason?: string
  status?: string
  scores?: {
    id: string
    traceId: string
    observationId: string
    name: string
    value?: number | null
    source: string
    dataType: string
    stringValue?: string
    longStringValue?: string
    comment?: string
    metadata?: Record<string, unknown>
    authorUserId?: string
    configId?: string
    queueId?: string
    createdAt?: string
    updatedAt?: string
  }[]
  scoreSummary: string
  resultType: 'normal' | 'badcase'
  executionStatus: string
  datasetFlowbackStatus: 'NONE' | 'FLOWED_BACK'
}

export type EvaluationReportFlowbackRecord = {
  id: string
  reportId: string
  flowbackType: EvaluationReportFlowbackType
  targetDatasetId: string
  targetDatasetName: string
  targetDatasetCreated: boolean
  requestedCount: number
  successCount: number
  failedCount: number
  status: EvaluationReportFlowbackStatus
  createdBy: string
  createdAt: string
  errorDetail: { itemId: string; reason: string }[]
}

export type EvaluationReportDetailRecord = EvaluationReportRecord & {
  metrics: Partial<{
    averageScore: number
    passRate: number
    failureRate: number
    badcaseRate: number
  }>
  distribution: { label: string; count: number }[]
  groupAnalysis: { group: string; sampleCount: number; averageScore: number }[]
  recommendations: string[]
  risks: string[]
  reproduction: {
    reportId?: string
    sourceTaskId?: string
    scoreName?: string
    generatedConfig?: string
  }
  reportTemplateId?: string
  reportTemplateSnapshot?: EvaluationReportTemplateRecord
}

export type EvaluationReportFlowbackInput = {
  flowbackType: EvaluationReportFlowbackType
  range: 'ALL' | 'CURRENT_FILTER' | 'BADCASE_ONLY' | 'SELECTED'
  selectedItemIds: string[]
  targetDataset:
    | { mode: 'EXISTING'; datasetId: string }
    | { mode: 'CREATE'; name: string; description: string }
  dedupeStrategy: 'SKIP_DUPLICATE' | 'CREATE_VERSION'
}

export const autoEvaluationStatusLabels: Record<
  AutoEvaluationTaskStatus,
  string
> = {
  DRAFT: '未运行',
  READY: '待运行',
  RUNNING: '运行中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
}

export const autoEvaluationEvaluatorTypeLabels: Record<
  AutoEvaluationEvaluatorType,
  string
> = {
  LLM_AS_JUDGE: 'LLM-as-Judge',
  CODE: 'Code',
  WORKFLOW: '工作流',
  SDK: 'SDK',
}

export const autoEvaluationDataSourceLabels: Record<
  AutoEvaluationDataSourceType,
  string
> = {
  DATASET: '数据集',
  TRACE_FILTER: 'Trace 过滤',
}

export const evaluationReportSourceTypeLabels: Record<
  EvaluationReportSourceType,
  string
> = {
  AUTO_EVAL: '自动评测',
  MANUAL_ANNOTATION: '人工标注',
}

export const evaluationReportStatusLabels: Record<
  EvaluationReportStatus,
  string
> = {
  GENERATING: '生成中',
  READY: '已生成',
  FAILED: '生成失败',
}
