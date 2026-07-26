import type {
  DateRangeSide,
  DateTimeConfig,
  DateTimeParseResult,
} from './date-time.types'

const DATE_PART_PATTERN = /^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/
const SEPARATED_DATE_TIME_PATTERN =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2})(?::?(\d{1,2}))?(?::?(\d{1,2}))?)?$/
const COMPACT_DATE_TIME_PATTERN = /^(\d{8})(\d{2})?(\d{2})?(\d{2})?$/

export function parseDate(value?: string) {
  if (!value) {
    return undefined
  }

  const match = DATE_PART_PATTERN.exec(value.trim())

  if (!match) {
    return undefined
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined
  }

  return date
}

export function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function getDatePart(value?: string) {
  return typeof value === 'string' ? value.trim().split(/[ T]/)[0] || '' : ''
}

export function toDateTimePickerValue(value?: string) {
  return value?.replace('T', ' ') ?? ''
}

export function fromDateTimePickerValue(value?: string) {
  return value?.replace(' ', 'T') ?? ''
}

export function getTimePart(
  value: unknown,
  config: DateTimeConfig,
  rangeSide: DateRangeSide = 'start'
) {
  if (!config.showTime) {
    return ''
  }

  const fallback = rangeSide === 'end' ? '23:59:59' : '00:00:00'
  const rawTime =
    typeof value === 'string' && /[ T]/.test(value.trim())
      ? value.trim().split(/[ T]/)[1]
      : fallback

  return normalizeTime(rawTime, config)
}

export function normalizeTime(value: string, config: DateTimeConfig) {
  const withSeconds = config.timeFormat === 'HH:mm:ss'
  const [hour = '00', minute = '00', second = '00'] = value.split(':')
  const normalized = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`

  return withSeconds ? normalized : normalized.slice(0, 5)
}

export function joinDateTime(
  date: string,
  time: string,
  config: DateTimeConfig
) {
  return `${date} ${normalizeTime(time, config)}`
}

export function parseDateTimeInput(
  input: string,
  config: DateTimeConfig,
  side: DateRangeSide
): DateTimeParseResult {
  const value = input.trim()

  if (!value) {
    return { status: 'empty', value: '' }
  }

  const parts = extractDateTimeParts(value)

  if (!parts) {
    return {
      status: 'invalid',
      value: '',
      message: `请输入有效${config.showTime ? '时间' : '日期'}，格式为 ${getInputFormat(config)}`,
    }
  }

  const date = parseDate(`${parts.year}-${parts.month}-${parts.day}`)

  if (!date) {
    return { status: 'invalid', value: '', message: '请输入真实存在的日期' }
  }

  const formattedDate = formatDate(date)

  if (!config.showTime) {
    if (parts.hasTime) {
      return {
        status: 'invalid',
        value: '',
        message: `请输入有效日期，格式为 ${getInputFormat(config)}`,
      }
    }

    return { status: 'valid', value: formattedDate }
  }

  const fallback = side === 'end' ? [23, 59, 59] : [0, 0, 0]
  const hour = parts.hasTime ? parts.hour : fallback[0]
  const minute = parts.hasTime ? parts.minute : fallback[1]
  const second = parts.hasTime ? parts.second : fallback[2]

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return { status: 'invalid', value: '', message: '请输入有效的时间' }
  }

  return {
    status: 'valid',
    value: joinDateTime(formattedDate, `${hour}:${minute}:${second}`, config),
  }
}

export function compareDateTimeValues(
  start: string,
  end: string,
  config: DateTimeConfig
) {
  const normalizedStart = config.showTime
    ? start
    : `${getDatePart(start)} 00:00:00`
  const normalizedEnd = config.showTime ? end : `${getDatePart(end)} 00:00:00`

  return normalizedStart.localeCompare(normalizedEnd)
}

export function getInputFormat(config: DateTimeConfig) {
  if (!config.showTime) {
    return 'YYYY-MM-DD'
  }

  return config.timeFormat === 'HH:mm:ss'
    ? 'YYYY-MM-DD HH:mm:ss'
    : 'YYYY-MM-DD HH:mm'
}

type DateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  hasTime: boolean
}

function extractDateTimeParts(value: string): DateTimeParts | undefined {
  const separatedMatch = SEPARATED_DATE_TIME_PATTERN.exec(value)

  if (separatedMatch) {
    return {
      year: Number(separatedMatch[1]),
      month: Number(separatedMatch[2]),
      day: Number(separatedMatch[3]),
      hour: Number(separatedMatch[4] ?? 0),
      minute: Number(separatedMatch[5] ?? 0),
      second: Number(separatedMatch[6] ?? 0),
      hasTime: separatedMatch[4] !== undefined,
    }
  }

  const compactMatch = COMPACT_DATE_TIME_PATTERN.exec(value)

  if (!compactMatch) {
    return undefined
  }

  const date = compactMatch[1]

  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(4, 6)),
    day: Number(date.slice(6, 8)),
    hour: Number(compactMatch[2] ?? 0),
    minute: Number(compactMatch[3] ?? 0),
    second: Number(compactMatch[4] ?? 0),
    hasTime: compactMatch[2] !== undefined,
  }
}
