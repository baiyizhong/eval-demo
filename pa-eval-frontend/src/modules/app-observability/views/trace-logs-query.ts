import type { DataTableQueryState } from '@/components/common/data-table'
import {
  DEFAULT_TRACE_QUICK_TIME_RANGE,
  getExplicitTraceQuickTimeRange,
  hasActiveTraceNonTimeFilter,
} from '../trace-time-ranges.ts'
import type { TraceListQuery, TraceMetadataFilter } from '../types'

const DEFAULT_TRACE_LOG_TIME_RANGE: NonNullable<TraceListQuery['timeRange']> =
  DEFAULT_TRACE_QUICK_TIME_RANGE

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
  const queryFilters = {
    ...state.filters,
    keyword: state.keyword,
    metadataFilters,
  }
  const timeRange = resolveTraceLogTimeRange({
    createdAtRange,
    filters: queryFilters,
    value: state.filters.timeRange,
  })

  return {
    projectId,
    page: state.page,
    pageSize: state.pageSize,
    keyword: state.keyword,
    createdAtRange,
    timeRange,
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

function resolveTraceLogTimeRange({
  createdAtRange,
  filters,
  value,
}: {
  createdAtRange?: string[]
  filters: Record<string, unknown>
  value: unknown
}): TraceListQuery['timeRange'] {
  if (createdAtRange?.length) {
    return undefined
  }

  const explicitTimeRange = getExplicitTraceQuickTimeRange(value)
  if (explicitTimeRange) {
    return explicitTimeRange
  }

  return hasActiveTraceNonTimeFilter(filters)
    ? undefined
    : DEFAULT_TRACE_LOG_TIME_RANGE
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
