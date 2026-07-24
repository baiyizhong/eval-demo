export type DateTimeFormat = 'HH:mm' | 'HH:mm:ss'

export type DateTimeConfig = {
  placeholder?: string
  showTime?: boolean
  timeStep?: number
  timeFormat?: DateTimeFormat
}

export type DateRangeSide = 'start' | 'end'

export type DateTimeParseResult =
  | { status: 'empty'; value: '' }
  | { status: 'valid'; value: string }
  | { status: 'invalid'; value: ''; message: string }

type CommonDateTimePickerProps = DateTimeConfig & {
  disabled?: boolean
  clearable?: boolean
  className?: string
}

export type DateTimePickerProps = CommonDateTimePickerProps & {
  value: string
  onChange: (nextValue: string) => void
}

export type DateTimeRangePickerProps = CommonDateTimePickerProps & {
  value: string[]
  onChange: (nextValue: string[]) => void
  startPlaceholder?: string
  endPlaceholder?: string
}
