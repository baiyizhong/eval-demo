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
  getProjectTraceObservation: {
    method: 'GET',
    url: '/projects/:projectId/traces/:traceId/observations/:observationId',
  },
  patchProjectTrace: {
    method: 'PATCH',
    url: '/projects/:projectId/traces/:traceId',
  },
} as const
