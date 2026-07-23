import type { DataTableQueryState } from '@/components/common/data-table'
import {
  DEFAULT_TRACE_QUICK_TIME_RANGE,
  getExplicitTraceQuickTimeRange,
  hasActiveTraceNonTimeFilter,
} from '../trace-time-ranges.ts'
import type {
  TraceCategoricalScoreFilter,
  TraceListQuery,
  TraceNumericScoreFilter,
  TraceObjectFilter,
} from '../types'

const DEFAULT_TRACE_LOG_TIME_RANGE: NonNullable<TraceListQuery['timeRange']> =
  DEFAULT_TRACE_QUICK_TIME_RANGE
const DEFAULT_TRACE_LOG_FIELDS = 'io,metadata'

function optionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text || undefined
}

export function buildTraceListQuery(
  state: DataTableQueryState,
  projectId: string
): TraceListQuery {
  const createdAtRange = state.filters.createdAtRange as string[] | undefined
  const metadataFilters = normalizeObjectFilters(state.filters.metadataFilters)
  const inputFilters = normalizeObjectFilters(state.filters.inputFilters)
  const outputFilters = normalizeObjectFilters(state.filters.outputFilters)
  const categoricalScoreFilters = normalizeCategoricalScoreFilters(
    state.filters.categoricalScoreFilters
  )
  const numericScoreFilters = normalizeNumericScoreFilters(
    state.filters.numericScoreFilters
  )
  const queryFilters = {
    ...state.filters,
    keyword: state.keyword,
    metadataFilters,
    inputFilters,
    outputFilters,
    categoricalScoreFilters,
    numericScoreFilters,
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
    scoreQueueId: optionalString(state.filters.scoreQueueId),
    anchorTraceId: optionalString(state.filters.anchorTraceId),
    metadataKey: optionalString(state.filters.metadataKey),
    metadataValue: optionalString(state.filters.metadataValue),
    metadataFilters: serializeJsonFilter(metadataFilters),
    inputFilters: serializeJsonFilter(inputFilters),
    outputFilters: serializeJsonFilter(outputFilters),
    categoricalScoreFilters: categoricalScoreFilters.length
      ? JSON.stringify(categoricalScoreFilters)
      : undefined,
    numericScoreFilters: serializeJsonFilter(numericScoreFilters),
    fields: optionalString(state.filters.fields) ?? DEFAULT_TRACE_LOG_FIELDS,
  }
}

function serializeJsonFilter(value: unknown[]): string | undefined {
  return value.length ? JSON.stringify(value) : undefined
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

function normalizeObjectFilters(value: unknown): TraceObjectFilter[] {
  if (!Array.isArray(value)) {
    return []
  }

  const filters: TraceObjectFilter[] = []
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

function normalizeCategoricalScoreFilters(
  value: unknown
): TraceCategoricalScoreFilter[] {
  if (!Array.isArray(value)) {
    return []
  }

  const filters: TraceCategoricalScoreFilter[] = []
  value.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return
    }
    const candidate = item as Record<string, unknown>
    const name = optionalString(candidate.name)
    if (!name) {
      return
    }
    const operator =
      candidate.operator === 'equals' ||
      candidate.operator === 'exists' ||
      candidate.operator === 'contains'
        ? candidate.operator
        : 'equals'
    filters.push({
      name,
      operator,
      value: optionalString(candidate.value),
    })
  })
  return filters
}

function normalizeNumericScoreFilters(
  value: unknown
): TraceNumericScoreFilter[] {
  if (!Array.isArray(value)) {
    return []
  }

  const filters: TraceNumericScoreFilter[] = []
  value.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return
    }
    const candidate = item as Record<string, unknown>
    const name = optionalString(candidate.name)
    const numericValue = optionalString(candidate.value)
    if (
      !name ||
      numericValue === undefined ||
      Number.isNaN(Number(numericValue))
    ) {
      return
    }
    const operator =
      candidate.operator === 'eq' ||
      candidate.operator === 'gte' ||
      candidate.operator === 'lte' ||
      candidate.operator === 'gt' ||
      candidate.operator === 'lt'
        ? candidate.operator
        : 'eq'
    filters.push({
      name,
      operator,
      value: numericValue,
    })
  })
  return filters
}
