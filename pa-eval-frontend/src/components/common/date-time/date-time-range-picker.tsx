import { useId, useRef, useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  dateTimeCalendarLabels,
  dateTimeCalendarLocale,
} from './date-time-calendar-locale'
import {
  compareDateTimeValues,
  formatDate,
  getDatePart,
  getInputFormat,
  getTimePart,
  joinDateTime,
  normalizeTime,
  parseDate,
  parseDateTimeInput,
} from './date-time-utils'
import type { DateRangeSide, DateTimeRangePickerProps } from './date-time.types'

type InputErrors = Partial<Record<DateRangeSide | 'range', string>>

export function DateTimeRangePicker({
  value,
  onChange,
  disabled,
  clearable = true,
  placeholder,
  startPlaceholder,
  endPlaceholder,
  showTime = false,
  timeStep,
  timeFormat = 'HH:mm',
  className,
}: DateTimeRangePickerProps) {
  const config = { showTime, timeStep, timeFormat }
  const [open, setOpen] = useState(false)
  const [startText, setStartText] = useState(value[0] ?? '')
  const [endText, setEndText] = useState(value[1] ?? '')
  const [draftRange, setDraftRange] = useState<DateRange>()
  const [errors, setErrors] = useState<InputErrors>({})
  const anchorRef = useRef<HTMLDivElement>(null)
  const openedFromInputRef = useRef(false)
  const externalValueKey = `${value[0] ?? ''}\u0000${value[1] ?? ''}`
  const [previousExternalValueKey, setPreviousExternalValueKey] =
    useState(externalValueKey)
  const errorId = useId()
  const errorMessage = errors.start ?? errors.end ?? errors.range
  const responsiveClass =
    '@min-[25rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
  const startResponsiveClass = '@min-[25rem]:col-span-1'

  if (previousExternalValueKey !== externalValueKey) {
    setPreviousExternalValueKey(externalValueKey)
    setStartText(value[0] ?? '')
    setEndText(value[1] ?? '')
    setDraftRange(undefined)
    setErrors({})
  }

  const commitPartialValue = (
    clearedSide: DateRangeSide,
    remainingText: string
  ) => {
    const remainingSide = clearedSide === 'start' ? 'end' : 'start'
    const remainingResult = parseDateTimeInput(
      remainingText,
      config,
      remainingSide
    )

    if (remainingResult.status !== 'valid') {
      onChange([])
      return
    }

    if (remainingSide === 'start') {
      setStartText(remainingResult.value)
      onChange([remainingResult.value, ''])
    } else {
      setEndText(remainingResult.value)
      onChange(['', remainingResult.value])
    }
  }

  const validateAndCommit = (
    nextStartText: string,
    nextEndText: string,
    editedSide: DateRangeSide
  ) => {
    const editedText = editedSide === 'start' ? nextStartText : nextEndText
    const editedResult = parseDateTimeInput(editedText, config, editedSide)

    if (editedResult.status === 'invalid') {
      setErrors({ [editedSide]: editedResult.message })
      return
    }

    if (editedResult.status === 'empty') {
      if (editedSide === 'start') {
        setStartText('')
      } else {
        setEndText('')
      }
      setDraftRange(undefined)
      setErrors({})
      commitPartialValue(
        editedSide,
        editedSide === 'start' ? nextEndText : nextStartText
      )
      return
    }

    const normalizedStart =
      editedSide === 'start' ? editedResult.value : nextStartText
    const normalizedEnd =
      editedSide === 'end' ? editedResult.value : nextEndText

    if (editedSide === 'start') {
      setStartText(editedResult.value)
    } else {
      setEndText(editedResult.value)
    }

    const startResult = parseDateTimeInput(normalizedStart, config, 'start')
    const endResult = parseDateTimeInput(normalizedEnd, config, 'end')

    if (startResult.status === 'empty' || endResult.status === 'empty') {
      setErrors({})
      onChange([])
      return
    }

    if (startResult.status === 'invalid') {
      setErrors({ start: startResult.message })
      return
    }

    if (endResult.status === 'invalid') {
      setErrors({ end: endResult.message })
      return
    }

    setStartText(startResult.value)
    setEndText(endResult.value)

    if (compareDateTimeValues(startResult.value, endResult.value, config) > 0) {
      setErrors({ range: '开始时间不能晚于结束时间' })
      return
    }

    setDraftRange(undefined)
    setErrors({})
    onChange([startResult.value, endResult.value])
  }

  const updateRange = (range?: DateRange) => {
    if (!range?.from) {
      setDraftRange(undefined)
      setStartText('')
      setEndText('')
      setErrors({})
      onChange([])
      return
    }

    const startDate = formatDate(range.from)
    const nextStart = showTime
      ? joinDateTime(startDate, getTimePart(startText, config, 'start'), config)
      : startDate

    if (!range.to) {
      setDraftRange(range)
      setStartText(nextStart)
      setEndText('')
      setErrors({})
      return
    }

    const endDate = formatDate(range.to)
    const nextEnd = showTime
      ? joinDateTime(endDate, getTimePart(endText, config, 'end'), config)
      : endDate

    setDraftRange(undefined)
    setStartText(nextStart)
    setEndText(nextEnd)
    setErrors({})
    onChange([nextStart, nextEnd])

    if (!showTime) {
      setOpen(false)
    }
  }

  const updateTime = (side: DateRangeSide, time: string) => {
    const startDate = getDatePart(startText)
    const endDate = getDatePart(endText)

    if (!startDate || !endDate) {
      return
    }

    const normalized = normalizeTime(time, config)
    const nextStart =
      side === 'start' ? joinDateTime(startDate, normalized, config) : startText
    const nextEnd =
      side === 'end' ? joinDateTime(endDate, normalized, config) : endText

    if (side === 'start') {
      setStartText(nextStart)
    } else {
      setEndText(nextEnd)
    }

    if (compareDateTimeValues(nextStart, nextEnd, config) > 0) {
      setErrors({ range: '开始时间不能晚于结束时间' })
      return
    }

    setErrors({})
    onChange([nextStart, nextEnd])
  }

  const clearSide = (side: DateRangeSide) => {
    setDraftRange(undefined)
    setErrors({})

    if (side === 'start') {
      setStartText('')
    } else {
      setEndText('')
    }

    commitPartialValue(side, side === 'start' ? endText : startText)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      openedFromInputRef.current = false
    }

    setOpen(nextOpen)
  }

  const openFromInput = () => {
    openedFromInputRef.current = true
    setOpen(true)
  }

  const selectedRange = draftRange ?? toDateRange(startText, endText)
  const inputPlaceholder = getInputFormat(config)

  return (
    <div className={cn('@container/date-range flex flex-col gap-1', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            role='group'
            aria-label={placeholder || '日期区间'}
            data-invalid={Boolean(errorMessage) || undefined}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] gap-1',
              responsiveClass
            )}
          >
            <div
              className={cn(
                'relative col-span-2 min-w-0',
                startResponsiveClass
              )}
            >
              <Input
                type='text'
                inputMode='numeric'
                value={startText}
                aria-label='开始时间'
                aria-invalid={Boolean(errors.start || errors.range)}
                aria-describedby={errorMessage ? errorId : undefined}
                placeholder={startPlaceholder || inputPlaceholder}
                disabled={disabled}
                className={cn('h-10', clearable && startText && 'pr-9')}
                onChange={(event) => {
                  setStartText(event.target.value)
                  setErrors({})
                }}
                onFocus={openFromInput}
                onBlur={() => validateAndCommit(startText, endText, 'start')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              {clearable && startText && !disabled ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='text-muted-foreground absolute top-1/2 right-1 size-8 -translate-y-1/2'
                  aria-label='清除开始时间'
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => clearSide('start')}
                >
                  <X />
                </Button>
              ) : null}
            </div>
            <div className='relative min-w-0'>
              <Input
                type='text'
                inputMode='numeric'
                value={endText}
                aria-label='结束时间'
                aria-invalid={Boolean(errors.end || errors.range)}
                aria-describedby={errorMessage ? errorId : undefined}
                placeholder={endPlaceholder || inputPlaceholder}
                disabled={disabled}
                className={cn('h-10', clearable && endText && 'pr-9')}
                onChange={(event) => {
                  setEndText(event.target.value)
                  setErrors({})
                }}
                onFocus={openFromInput}
                onBlur={() => validateAndCommit(startText, endText, 'end')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              {clearable && endText && !disabled ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='text-muted-foreground absolute top-1/2 right-1 size-8 -translate-y-1/2'
                  aria-label='清除结束时间'
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => clearSide('end')}
                >
                  <X />
                </Button>
              ) : null}
            </div>
            <PopoverTrigger asChild>
              <Button
                type='button'
                variant='outline'
                size='icon'
                className='size-10'
                disabled={disabled}
                aria-label='打开日期区间选择'
                onClick={() => {
                  openedFromInputRef.current = false
                }}
              >
                <CalendarIcon />
              </Button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align='start'
          className='w-auto p-0'
          onOpenAutoFocus={(event) => {
            if (openedFromInputRef.current) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node)) {
              event.preventDefault()
            }
          }}
        >
          <Calendar
            mode='range'
            locale={dateTimeCalendarLocale}
            labels={dateTimeCalendarLabels}
            selected={selectedRange}
            onSelect={updateRange}
            numberOfMonths={2}
            initialFocus
          />
          {showTime ? (
            <div className='grid grid-cols-2 gap-2 border-t p-3'>
              <Input
                type='time'
                aria-label='选择开始时间'
                step={timeStep ?? (timeFormat === 'HH:mm:ss' ? 1 : 60)}
                value={getTimePart(startText, config, 'start')}
                disabled={!getDatePart(startText) || !getDatePart(endText)}
                onChange={(event) => updateTime('start', event.target.value)}
              />
              <Input
                type='time'
                aria-label='选择结束时间'
                step={timeStep ?? (timeFormat === 'HH:mm:ss' ? 1 : 60)}
                value={getTimePart(endText, config, 'end')}
                disabled={!getDatePart(startText) || !getDatePart(endText)}
                onChange={(event) => updateTime('end', event.target.value)}
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {errorMessage ? (
        <p id={errorId} role='alert' className='text-destructive text-xs'>
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}

function toDateRange(startValue: string, endValue: string) {
  const from = parseDate(getDatePart(startValue))
  const to = parseDate(getDatePart(endValue))

  if (!from) {
    return undefined
  }

  return { from, to }
}
