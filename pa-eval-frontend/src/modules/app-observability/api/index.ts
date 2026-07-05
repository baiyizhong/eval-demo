export const observabilityApi = {
  getTraceMetrics: {
    method: 'GET',
    url: '/projects/:projectId/trace-metrics',
  },
  listProjectTraces: {
    method: 'GET',
    url: '/projects/:projectId/traces',
  },
  getProjectTrace: {
    method: 'GET',
    url: '/projects/:projectId/traces/:traceId',
  },
  patchProjectTrace: {
    method: 'PATCH',
    url: '/projects/:projectId/traces/:traceId',
  },
} as const
