import type { DatasetRecord, DatasetType } from '../types'

const datasetTypeLabels: Record<DatasetType, string> = {
  evaluation: '评测集',
  badcase: 'badcase集',
  golden: '黄金集',
  anomaly: '异常集',
}

export const datasetPresetTags = [
  datasetTypeLabels.badcase,
  datasetTypeLabels.golden,
  datasetTypeLabels.anomaly,
]

const datasetTypeValues: DatasetType[] = [
  'evaluation',
  'badcase',
  'golden',
  'anomaly',
]

const datasetTypeByLabel = new Map(
  Object.entries(datasetTypeLabels).map(([type, label]) => [label, type])
)

export function normalizeDatasetType(
  value: unknown,
  fallback: DatasetType = 'evaluation'
): DatasetType {
  if (typeof value !== 'string') return fallback

  const normalizedValue = value.trim().toLowerCase()
  if (datasetTypeValues.includes(normalizedValue as DatasetType)) {
    return normalizedValue as DatasetType
  }

  return fallback
}

export function normalizeDatasetTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const tags: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') continue
    const tag = item.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }

  return tags
}

export function getDatasetTags(dataset?: DatasetRecord | null): string[] {
  if (!dataset) return []

  return normalizeDatasetTags(dataset.metadata?.tags)
}

export function resolveDatasetLegacyType(
  tags: string[],
  fallback: DatasetType = 'evaluation'
): DatasetType {
  for (const tag of tags) {
    const type = datasetTypeByLabel.get(tag)
    if (type) return type as DatasetType
  }

  return fallback
}
