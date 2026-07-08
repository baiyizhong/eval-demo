import type {
  AnnotationQueueItemRecord,
  AnnotationScoreFormInput,
  ScoreConfigRecord,
} from '../types'

type ScoreOption = {
  value: string
  label: string
}

export function getBooleanScoreRadioValue(value: unknown) {
  const normalized = parseBooleanScoreInput(value)
  if (normalized === true) return '1'
  if (normalized === false) return '0'
  return ''
}

export function parseBooleanScoreInput(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', '是'].includes(normalized)) {
      return true
    }
    if (['0', 'false', 'no', 'n', '否'].includes(normalized)) {
      return false
    }
  }
  return null
}

export function normalizeBooleanScoreOptionValue(value: string) {
  return getBooleanScoreRadioValue(value) || value
}

export function getBooleanScoreOptions(): ScoreOption[] {
  return [
    { value: '1', label: '通过' },
    { value: '0', label: '不通过' },
  ]
}

export function getCategoricalScoreOptions(
  config: Pick<ScoreConfigRecord, 'categories'>
): ScoreOption[] {
  return (config.categories ?? []).map((category, index) => ({
    value: String(category.value ?? index + 1),
    label: category.label || String(category.value ?? index + 1),
  }))
}

export function buildAnnotationScoreDefaultValues(
  item: AnnotationQueueItemRecord,
  scoreConfigs: ScoreConfigRecord[]
): AnnotationScoreFormInput {
  return {
    scores: scoreConfigs.map((config) => {
      const existing = item.scores.find((score) => score.configId === config.id)
      const comment = existing?.comment ?? ''

      if (config.dataType === 'NUMERIC') {
        return {
          configId: config.id,
          value: typeof existing?.value === 'number' ? existing.value : null,
          stringValue: '',
          comment,
        }
      }

      if (config.dataType === 'BOOLEAN') {
        return {
          configId: config.id,
          value: parseBooleanScoreInput(existing?.value ?? existing?.stringValue),
          stringValue: '',
          comment,
        }
      }

      return {
        configId: config.id,
        value:
          config.dataType === 'CATEGORICAL'
            ? resolveCategoricalValue(config, existing?.value, existing?.stringValue)
            : null,
        stringValue: existing?.stringValue ?? '',
        comment,
      }
    }),
  }
}

export function normalizeAnnotationScoreFormInput(
  input: AnnotationScoreFormInput,
  scoreConfigs: ScoreConfigRecord[]
): AnnotationScoreFormInput {
  const configById = new Map(scoreConfigs.map((config) => [config.id, config]))

  return {
    scores: input.scores.map((score) => {
      const config = configById.get(score.configId)
      if (config?.dataType === 'NUMERIC') {
        return {
          configId: score.configId,
          value: typeof score.value === 'number' ? score.value : null,
          stringValue: '',
          comment: score.comment,
        }
      }

      if (config?.dataType === 'BOOLEAN') {
        return {
          configId: score.configId,
          value: parseBooleanScoreInput(score.value),
          stringValue: '',
          comment: score.comment,
        }
      }

      if (config?.dataType === 'CATEGORICAL') {
        const category = resolveCategoricalCategory(
          config,
          score.value,
          score.stringValue
        )
        return {
          configId: score.configId,
          value: category ? category.value : null,
          stringValue: category?.label ?? score.stringValue,
          comment: score.comment,
        }
      }

      if (config?.dataType === 'TEXT') {
        return {
          configId: score.configId,
          value: 0,
          stringValue: score.stringValue.slice(0, 500),
          comment: score.comment,
        }
      }

      return {
        configId: score.configId,
        value: null,
        stringValue: score.stringValue,
        comment: score.comment,
      }
    }),
  }
}

function resolveCategoricalValue(
  config: Pick<ScoreConfigRecord, 'categories'>,
  value: unknown,
  stringValue: string | undefined
): number | null {
  return resolveCategoricalCategory(config, value, stringValue)?.value ?? null
}

function resolveCategoricalCategory(
  config: Pick<ScoreConfigRecord, 'categories'>,
  value: unknown,
  stringValue: string | undefined
) {
  const label = stringValue?.trim()
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN

  return (config.categories ?? []).find((category) => {
    if (label && category.label === label) return true
    return Number.isFinite(numericValue) && category.value === numericValue
  })
}
