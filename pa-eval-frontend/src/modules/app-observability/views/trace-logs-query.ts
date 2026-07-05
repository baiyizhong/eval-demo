import type { DataTableQueryState } from '@/components/common/data-table'
import type { TraceListQuery } from '../types'

function optionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text || undefined
}

export function buildTraceListQuery(
  state: DataTableQueryState,
  projectId: string
): TraceListQuery {
  const createdAtRange = state.filters.createdAtRange as string[] | undefined
  return {
    projectId,
    page: state.page,
    pageSize: state.pageSize,
    keyword: state.keyword,
    createdAtRange,
    timeRange: createdAtRange?.length ? undefined : '24h',
    environments: state.filters.environment as string[] | undefined,
    statuses: state.filters.status as string[] | undefined,
    tags: state.filters.tags as string[] | undefined,
    latencyMin: optionalString(state.filters.latencyMin),
    latencyMax: optionalString(state.filters.latencyMax),
    sessionId: optionalString(state.filters.sessionId),
    userId: optionalString(state.filters.userId),
    businessId: optionalString(state.filters.businessId),
    metadataKey: optionalString(state.filters.metadataKey),
    metadataValue: optionalString(state.filters.metadataValue),
  }
}
