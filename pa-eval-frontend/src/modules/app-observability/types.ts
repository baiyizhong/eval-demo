import type { TreeNode } from '@/components/business/llm-trace-chain'

export type TraceStatus = 'success' | 'failed' | 'running' | 'unknown'

export type TraceEnvironment = 'default' | 'production' | 'staging' | 'testing'

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
}

export type TraceDetail = TraceLogRow & {
  updatedAt: string
  input: string
  output: string
  metadata: Record<string, unknown>
  callChain: TreeNode[]
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
  timeRange?: '24h' | '7d' | '30d'
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
