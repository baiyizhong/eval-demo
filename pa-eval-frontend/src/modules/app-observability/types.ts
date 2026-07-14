import type { TreeNode } from '@/components/business/llm-trace-chain'

export type TraceStatus = 'success' | 'failed' | 'running' | 'unknown'

export type TraceEnvironment = 'default' | 'production' | 'staging' | 'testing'

export type TraceScore = {
  id: string
  traceId?: string
  observationId?: string
  name: string
  value?: number | null
  source?: string
  dataType?: string
  stringValue?: string
  longStringValue?: string
  comment?: string
  metadata?: Record<string, unknown>
  authorUserId?: string
  configId?: string
  queueId?: string
  createdAt?: string
  updatedAt?: string
}

export type TraceLogRow = {
  traceId: string
  sessionId: string
  projectId: string
  projectName: string
  environment: TraceEnvironment
  status: TraceStatus
  latency: number
  createdAt: string
  userId: string
  businessId: string
  tags: string[]
  scores?: TraceScore[]
  scoreSummary?: string
}

export type TraceDetail = TraceLogRow & {
  updatedAt: string
  input: string
  output: string
  metadata: Record<string, unknown>
  callChain: TreeNode[]
}

export type TraceObservationDetail = {
  id: string
  traceId: string
  projectId: string
  projectName?: string
  parentObservationId?: string | null
  type: string
  name: string
  level: string
  statusMessage: string
  startTime: string
  endTime: string
  input: string
  output: string
  metadata: Record<string, unknown>
  usageDetails: Record<string, number>
  providedUsageDetails: Record<string, number>
  costDetails: Record<string, number>
  providedCostDetails?: Record<string, number>
  totalCost: number
  scores: TraceScore[]
  scoreSummary?: string
}

export type TraceMetricSummary = {
  total: number
  success: number
  failed: number
  failureRate: number
  averageLatency: number
  p95Latency: number
  totalChangeRate: number
}

export type TraceTrendPoint = {
  time: string
  total: number
  failed: number
}

export type TraceLatencyPoint = {
  time: string
  averageLatency: number
  p95Latency: number
}

export type TraceEnvironmentPoint = {
  environment: TraceEnvironment
  count: number
}

export type TraceMetrics = {
  summary: TraceMetricSummary
  traceTrend: TraceTrendPoint[]
  latencyTrend: TraceLatencyPoint[]
  environmentDistribution: TraceEnvironmentPoint[]
  slowTraces: TraceLogRow[]
}

export type TraceListQuery = {
  projectId: string
  page: number
  pageSize: number
  keyword?: string
  createdAtRange?: string[]
  timeRange?: '1d' | '3d' | '7d' | '14d'
  environments?: string[]
  statuses?: string[]
  tags?: string[]
  latencyMin?: string
  latencyMax?: string
  sessionId?: string
  userId?: string
  businessId?: string
  metadataKey?: string
  metadataValue?: string
  metadataFilters?: TraceMetadataFilter[]
  categoricalScoreFilters?: TraceCategoricalScoreFilter[]
  numericScoreFilters?: TraceNumericScoreFilter[]
  scoreQueueId?: string
}

export type TraceMetadataFilterOperator = 'equals' | 'contains' | 'exists'

export type TraceMetadataFilter = {
  key: string
  operator: TraceMetadataFilterOperator
  value?: string
}

export type TraceCategoricalScoreFilterOperator = 'equals' | 'contains' | 'exists'

export type TraceCategoricalScoreFilter = {
  name: string
  operator: TraceCategoricalScoreFilterOperator
  value?: string
}

export type TraceNumericScoreFilterOperator = 'eq' | 'gte' | 'lte' | 'gt' | 'lt'

export type TraceNumericScoreFilter = {
  name: string
  operator: TraceNumericScoreFilterOperator
  value?: string
}

export type TraceListResponse = {
  total: number
  datas: TraceLogRow[]
}

export type TracePatchInput = {
  input: string
  output: string
  metadata: Record<string, unknown>
}

export type AnnotationTaskResult = {
  taskId: string
  traceCount: number
}
