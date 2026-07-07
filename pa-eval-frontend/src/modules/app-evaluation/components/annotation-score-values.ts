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
    { value: '1', label: '是' },
    { value: '0', label: '否' },
  ]
}

export function getCategoricalScoreOptions(
  config: Pick<ScoreConfigRecord, 'categories'>
): ScoreOption[] {
  return (config.categories ?? []).map(parseScoreOption)
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
        value: null,
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

      return {
        configId: score.configId,
        value: null,
        stringValue: score.stringValue,
        comment: score.comment,
      }
    }),
  }
}

function parseScoreOption(value: string): ScoreOption {
  const [rawValue, rawLabel] = value.split('|')
  return {
    value: rawValue || value,
    label: rawLabel || rawValue || value,
  }
}
