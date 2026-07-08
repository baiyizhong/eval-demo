import { db } from './_data.ts'
import { body, keywordIncludes, paginate, pathParam, success } from './_utils.ts'

const projectId = (req: any) => pathParam(req, 'projectId')

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
        count: db.traces.filter((trace) => trace.projectId === projectId(req)).length,
      }),
  },
  {
    url: '/api/projects/:projectId/trace-metrics',
    method: 'get',
    response: (req: any) => {
      const rows = db.traces.filter((trace) => trace.projectId === projectId(req))
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
        db.traces.find(
          (trace) =>
            trace.projectId === projectId(req) && trace.traceId === pathParam(req, 'traceId')
        ) ?? db.traces[0]
      ),
  },
  {
    url: '/api/projects/:projectId/traces/:traceId',
    method: 'patch',
    response: (req: any) => {
      const index = db.traces.findIndex(
        (trace) =>
          trace.projectId === projectId(req) && trace.traceId === pathParam(req, 'traceId')
      )
      if (index >= 0) {
        db.traces[index] = { ...db.traces[index], ...body(req), updatedAt: new Date().toISOString() }
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
          db.traces
            .filter((trace) => trace.projectId === projectId(req))
            .filter((trace) => keywordIncludes(trace, req.query?.keyword)),
          req.query,
          20
        )
      ),
  },
]
