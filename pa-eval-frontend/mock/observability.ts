import { db } from './_data.ts'
import { body, keywordIncludes, paginate, pathParam, success } from './_utils.ts'

type MockTrace = Record<string, any>

const projectId = (req: any) => pathParam(req, 'projectId')
const traces = () => db.traces as MockTrace[]

function matchesCreatedAtRange(
  trace: MockTrace,
  query: Record<string, any> | undefined
) {
  const range = normalizeQueryList(query?.createdAtRange ?? query?.['createdAtRange[]'])
  if (!range.length) return true

  const createdAt = parseFilterDateTime(trace.createdAt)
  if (!createdAt) return true

  const start = parseFilterDateTime(range[0])
  const end = parseFilterDateTime(range[1])
  if (start && createdAt < start) return false
  if (end && createdAt >= end) return false
  return true
}

function normalizeQueryList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value) return [value]
  return []
}

function parseObjectFilters(value: unknown) {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      Boolean(String((item as Record<string, unknown>).key ?? '').trim())
  )
}

function payloadObject(value: unknown): Record<string, unknown> | null {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
}

function matchesObjectFilters(payload: unknown, value: unknown) {
  const filters = parseObjectFilters(value)
  if (!filters.length) return true
  const object = payloadObject(payload)
  if (!object) return false

  return filters.every((filter) => {
    const key = String(filter.key ?? '').trim()
    if (!Object.prototype.hasOwnProperty.call(object, key)) return false
    if (filter.operator === 'exists') return true
    const actualValue = object[key]
    const actual =
      typeof actualValue === 'string'
        ? actualValue
        : JSON.stringify(actualValue) ?? String(actualValue ?? '')
    const expected = String(filter.value ?? '')
    return filter.operator === 'equals'
      ? actual === expected
      : actual.includes(expected)
  })
}

function parseFilterDateTime(value: unknown) {
  if (!value) return null
  const text = String(value).trim().replace(' ', 'T')
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function findTraceNode(nodes: any[] = [], nodeId: string): any | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const child = findTraceNode(node.children ?? [], nodeId)
    if (child) return child
  }
  return undefined
}

export default [
  {
    url: '/api/projects/:projectId/traces/annotation-task',
    method: 'post',
    response: (req: any) =>
      success({
        taskId: `annotation_${Date.now()}`,
        traceCount: (body(req).traceIds ?? []).length,
      }),
  },
  {
    url: '/api/projects/:projectId/traces/dataset-items',
    method: 'post',
    response: (req: any) =>
      success({
        datasetId: body(req).datasetId,
        successCount: (body(req).traceIds ?? []).length,
        failureCount: 0,
        failures: [],
      }),
  },
  {
    url: '/api/projects/:projectId/traces/count',
    method: 'post',
    response: (req: any) =>
      success({
        count: traces().filter((trace) => trace.projectId === projectId(req)).length,
      }),
  },
  {
    url: '/api/projects/:projectId/trace-metrics',
    method: 'get',
    response: (req: any) => {
      const rows = traces().filter((trace) => trace.projectId === projectId(req))
      const failed = rows.filter((trace) => trace.status === 'failed').length
      const totalLatency = rows.reduce((sum, trace) => sum + trace.latency, 0)
      return success({
        summary: {
          total: rows.length,
          success: rows.length - failed,
          failed,
          failureRate: rows.length ? failed / rows.length : 0,
          averageLatency: rows.length ? Math.round(totalLatency / rows.length) : 0,
          p95Latency: rows.reduce((max, trace) => Math.max(max, trace.latency), 0),
          totalChangeRate: 0.12,
        },
        traceTrend: [
          { time: '00:00', total: 12, failed: 0 },
          { time: '12:00', total: rows.length, failed },
        ],
        latencyTrend: [
          { time: '00:00', averageLatency: 800, p95Latency: 1200 },
          { time: '12:00', averageLatency: 980, p95Latency: 1800 },
        ],
        environmentDistribution: [
          { environment: 'production', count: rows.filter((item) => item.environment === 'production').length },
          { environment: 'staging', count: rows.filter((item) => item.environment === 'staging').length },
        ],
        slowTraces: [...rows].sort((a, b) => b.latency - a.latency).slice(0, 5),
      })
    },
  },
  {
    url: '/api/projects/:projectId/traces/:traceId',
    method: 'get',
    response: (req: any) =>
      success(
        traces().find(
          (trace) =>
            trace.projectId === projectId(req) && trace.traceId === pathParam(req, 'traceId')
        ) ?? traces()[0]
      ),
  },
  {
    url: '/api/projects/:projectId/traces/:traceId/observations/:observationId',
    method: 'get',
    response: (req: any) => {
      const trace =
        traces().find(
          (item) =>
            item.projectId === projectId(req) &&
            item.traceId === pathParam(req, 'traceId')
        ) ?? traces()[0]
      const observationId = pathParam(req, 'observationId')
      const node = findTraceNode(trace.callChain, observationId)
      return success({
        id: observationId,
        traceId: trace.traceId,
        projectId: trace.projectId,
        projectName: trace.projectName,
        parentObservationId: null,
        type: node?.type ?? 'chain',
        name: node?.title ?? observationId,
        level: 'DEFAULT',
        statusMessage: '',
        startTime: trace.createdAt,
        endTime: trace.updatedAt,
        input: trace.input,
        output: trace.output,
        metadata: {
          ...trace.metadata,
          observationId,
        },
        usageDetails: {
          input: node?.tokensIn ?? 0,
          output: node?.tokensOut ?? 0,
          total: node?.tokensTotal ?? 0,
        },
        providedUsageDetails: {},
        costDetails: {},
        providedCostDetails: {},
        totalCost: 0,
        scores: (trace.scores ?? []).filter(
          (score: any) => !score.observationId || score.observationId === observationId
        ),
        scoreSummary: trace.scoreSummary ?? '',
      })
    },
  },
  {
    url: '/api/projects/:projectId/traces/:traceId',
    method: 'patch',
    response: (req: any) => {
      const index = traces().findIndex(
        (trace) =>
          trace.projectId === projectId(req) && trace.traceId === pathParam(req, 'traceId')
      )
      if (index >= 0) {
        db.traces[index] = { ...traces()[index], ...body(req), updatedAt: new Date().toISOString() }
      }
      return success(db.traces[index] ?? { traceId: pathParam(req, 'traceId') })
    },
  },
  {
    url: '/api/projects/:projectId/traces',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          traces()
            .filter((trace) => trace.projectId === projectId(req))
            .filter((trace) => matchesCreatedAtRange(trace, req.query))
            .filter((trace) =>
              matchesObjectFilters(trace.metadata, req.query?.metadataFilters)
            )
            .filter((trace) =>
              matchesObjectFilters(trace.input, req.query?.inputFilters)
            )
            .filter((trace) =>
              matchesObjectFilters(trace.output, req.query?.outputFilters)
            )
            .filter((trace) => !req.query?.sessionId || trace.sessionId === req.query?.sessionId)
            .filter((trace) => keywordIncludes(trace, req.query?.keyword)),
          req.query,
          20
        )
      ),
  },
]
