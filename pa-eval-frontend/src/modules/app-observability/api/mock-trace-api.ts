import { mockTraceDetails } from '../data/mock-traces'
import type {
  AnnotationTaskResult,
  TraceDetail,
  TraceListQuery,
  TraceListResponse,
  TraceMetrics,
  TracePatchInput,
} from '../types'

const traceDetails = [...mockTraceDetails]

const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms))

export async function getTraceMetricsMock(
  projectId: string
): Promise<TraceMetrics> {
  await delay()

  const rows = traceDetails.filter((trace) => trace.projectId === projectId)
  const failed = rows.filter((trace) => trace.status === 'failed').length
  const success = rows.filter((trace) => trace.status === 'success').length
  const totalLatency = rows.reduce((sum, trace) => sum + trace.latency, 0)
  const sortedLatency = rows.map((trace) => trace.latency).sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(sortedLatency.length * 0.95) - 1)

  return {
    summary: {
      total: rows.length,
      success,
      failed,
      failureRate: rows.length ? failed / rows.length : 0,
      averageLatency: rows.length ? Math.round(totalLatency / rows.length) : 0,
      p95Latency: sortedLatency[p95Index] ?? 0,
      totalChangeRate: 0.12,
    },
    traceTrend: [
      { time: '00:00', total: 24, failed: 1 },
      { time: '04:00', total: 32, failed: 2 },
      { time: '08:00', total: 52, failed: 4 },
      { time: '12:00', total: 48, failed: 3 },
      { time: '16:00', total: 61, failed: 5 },
      { time: '20:00', total: 43, failed: 2 },
    ],
    latencyTrend: [
      { time: '00:00', averageLatency: 860, p95Latency: 2100 },
      { time: '04:00', averageLatency: 920, p95Latency: 2400 },
      { time: '08:00', averageLatency: 1120, p95Latency: 3200 },
      { time: '12:00', averageLatency: 1040, p95Latency: 2900 },
      { time: '16:00', averageLatency: 1280, p95Latency: 4680 },
      { time: '20:00', averageLatency: 970, p95Latency: 2500 },
    ],
    environmentDistribution: [
      { environment: 'production', count: rows.length },
      { environment: 'staging', count: 12 },
      { environment: 'testing', count: 8 },
    ],
    slowTraces: [...rows].sort((a, b) => b.latency - a.latency).slice(0, 5),
  }
}

export async function listProjectTracesMock(
  query: TraceListQuery
): Promise<TraceListResponse> {
  await delay()

  const keyword = query.keyword?.trim().toLowerCase()
  const rows = traceDetails.filter((trace) => {
    if (trace.projectId !== query.projectId) return false
    if (
      keyword &&
      !trace.traceId.toLowerCase().includes(keyword) &&
      !trace.sessionId.toLowerCase().includes(keyword)
    ) {
      return false
    }
    if (
      query.environments?.length &&
      !query.environments.includes(trace.environment)
    ) {
      return false
    }
    if (query.statuses?.length && !query.statuses.includes(trace.status)) {
      return false
    }
    if (
      query.tags?.length &&
      !query.tags.some((tag) => trace.tags.includes(tag))
    ) {
      return false
    }
    if (query.sessionId && !trace.sessionId.includes(query.sessionId)) {
      return false
    }
    if (query.userId && !trace.userId.includes(query.userId)) {
      return false
    }
    if (query.businessId && !trace.businessId.includes(query.businessId)) {
      return false
    }
    if (query.latencyMin && trace.latency < Number(query.latencyMin)) {
      return false
    }
    if (query.latencyMax && trace.latency > Number(query.latencyMax)) {
      return false
    }
    return true
  })

  const start = (query.page - 1) * query.pageSize

  return {
    total: rows.length,
    datas: rows.slice(start, start + query.pageSize),
  }
}

export async function getProjectTraceMock(
  projectId: string,
  traceId: string
): Promise<TraceDetail> {
  await delay()

  const detail = traceDetails.find(
    (trace) => trace.projectId === projectId && trace.traceId === traceId
  )

  if (!detail) {
    throw new Error('Trace 不存在或已不可用')
  }

  return detail
}

export async function patchProjectTraceMock(
  projectId: string,
  traceId: string,
  input: TracePatchInput
): Promise<TraceDetail> {
  await delay()

  const index = traceDetails.findIndex(
    (trace) => trace.projectId === projectId && trace.traceId === traceId
  )

  if (index < 0) {
    throw new Error('Trace 不存在或已不可用')
  }

  traceDetails[index] = {
    ...traceDetails[index],
    input: input.input,
    output: input.output,
    metadata: input.metadata,
    updatedAt: new Date().toISOString(),
  }

  return traceDetails[index]
}

export async function exportProjectTracesMock(
  projectId: string,
  traceIds: string[]
): Promise<TraceDetail[]> {
  await delay()

  return traceDetails.filter(
    (trace) => trace.projectId === projectId && traceIds.includes(trace.traceId)
  )
}

export async function createAnnotationTaskMock(
  traceIds: string[]
): Promise<AnnotationTaskResult> {
  await delay()

  return {
    taskId: `annotation_${Date.now()}`,
    traceCount: traceIds.length,
  }
}
