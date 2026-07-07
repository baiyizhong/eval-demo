import type { DataTableQueryState } from '@/components/common/data-table'
import type { TraceListQuery, TraceMetadataFilter } from '../types'

function optionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text || undefined
}

export function buildTraceListQuery(
  state: DataTableQueryState,
  projectId: string
): TraceListQuery {
  const createdAtRange = state.filters.createdAtRange as string[] | undefined
  const metadataFilters = normalizeMetadataFilters(
    state.filters.metadataFilters
  )
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
    metadataFilters: metadataFilters.length ? metadataFilters : undefined,
  }
}

function normalizeMetadataFilters(value: unknown): TraceMetadataFilter[] {
  if (!Array.isArray(value)) {
    return []
  }

  const filters: TraceMetadataFilter[] = []
  value.forEach((item) => {
      if (!item || typeof item !== 'object') {
        return
      }
      const candidate = item as Record<string, unknown>
      const key = optionalString(candidate.key)
      if (!key) {
        return
      }
      const operator =
        candidate.operator === 'equals' ||
        candidate.operator === 'exists' ||
        candidate.operator === 'contains'
          ? candidate.operator
          : 'contains'
      filters.push({
        key,
        operator,
        value: optionalString(candidate.value),
      })
    })
  return filters
}
