export type MockRequest = {
  body?: Record<string, any>
  query?: Record<string, any>
  params?: Record<string, string>
  url?: string
}

const paramSegmentMap: Record<string, string> = {
  projectId: 'projects',
  organizationId: 'organizations',
  memberId: 'members',
  keyId: 'api-keys',
  connectionId: 'llm-connections',
  modelId: 'definitions',
  evaluatorId: 'evaluators',
  datasetId: 'datasets',
  jobId: 'export-jobs',
  itemId: 'items',
  configId: 'score-configs',
  queueId: 'annotation-queues',
  reportId: 'evaluation-reports',
  templateId: 'report-templates',
  taskId: 'auto-evaluations',
}

export function success(data: any) {
  return {
    code: 0,
    message: 'success',
    data,
    txId: id('tx'),
  }
}

export function failure(code: number, message: string, data: any = {}) {
  return {
    code,
    message,
    data,
    txId: id('tx'),
  }
}

export function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function paginate<T>(
  rows: T[],
  query: Record<string, any> | undefined,
  defaultPageSize = 10
) {
  const page = Math.max(1, Number(query?.page ?? 1))
  const pageSize = Math.max(1, Number(query?.pageSize ?? defaultPageSize))
  const start = (page - 1) * pageSize

  return {
    total: rows.length,
    datas: rows.slice(start, start + pageSize),
  }
}

export function keywordIncludes(value: any, keyword: unknown) {
  const normalized = String(keyword ?? '').trim().toLowerCase()
  if (!normalized) return true
  return JSON.stringify(value).toLowerCase().includes(normalized)
}

export function pathParam(req: MockRequest, name: string) {
  const directValue = req.params?.[name] ?? req.query?.[name]
  if (directValue !== undefined && directValue !== null) {
    return String(directValue)
  }

  const marker = paramSegmentMap[name]
  if (!marker || !req.url) {
    return ''
  }

  const pathname = req.url.split('?')[0]
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const markerIndex = segments.indexOf(marker)
  return markerIndex >= 0 ? segments[markerIndex + 1] ?? '' : ''
}

export function body(req: MockRequest) {
  return req.body ?? {}
}

export function okId(req: MockRequest, name = 'id') {
  return success({ [name]: Object.values(req.params ?? {})[0] ?? id(name) })
}
