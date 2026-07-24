import { useId, useRef, useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  formatDate,
  getDatePart,
  getInputFormat,
  getTimePart,
  joinDateTime,
  normalizeTime,
  parseDate,
  parseDateTimeInput,
} from './date-time-utils'
import type { DateTimePickerProps } from './date-time.types'

export function DateTimePicker({
  value,
  onChange,
  disabled,
  clearable = true,
  placeholder,
  showTime = false,
  timeStep,
  timeFormat = 'HH:mm',
  className,
}: DateTimePickerProps) {
  const config = { showTime, timeStep, timeFormat }
  const [open, setOpen] = useState(false)
  const [inputText, setInputText] = useState(value)
  const [previousExternalValue, setPreviousExternalValue] = useState(value)
  const [error, setError] = useState('')
  const anchorRef = useRef<HTMLDivElement>(null)
  const openedFromInputRef = useRef(false)
  const errorId = useId()
  const timeInputId = useId()

  if (previousExternalValue !== value) {
    setPreviousExternalValue(value)
    setInputText(value)
    setError('')
  }

  const validateAndCommit = () => {
    const result = parseDateTimeInput(inputText, config, 'start')

    if (result.status === 'invalid') {
      setError(result.message)
      return
    }

    setError('')
    setInputText(result.value)
    onChange(result.value)
  }

  const updateDate = (date?: Date) => {
    if (!date) {
      clearValue()
      return
    }

    const datePart = formatDate(date)
    const nextValue = showTime
      ? joinDateTime(datePart, getTimePart(inputText, config), config)
      : datePart

    setInputText(nextValue)
    setError('')
    onChange(nextValue)

    if (!showTime) {
      setOpen(false)
    }
  }

  const updateTime = (time: string) => {
    const datePart = getDatePart(inputText)

    if (!datePart) {
      return
    }

    const nextValue = joinDateTime(
      datePart,
      normalizeTime(time, config),
      config
    )
    setInputText(nextValue)
    setError('')
    onChange(nextValue)
  }

  const clearValue = () => {
    setInputText('')
    setError('')
    onChange('')
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

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            role='group'
            aria-label={placeholder || '日期时间'}
            data-invalid={Boolean(error) || undefined}
            className='grid grid-cols-[minmax(0,1fr)_auto] gap-1'
          >
            <div className='relative min-w-0'>
              <Input
                type='text'
                inputMode='numeric'
                value={inputText}
                aria-label={showTime ? '日期时间' : '日期'}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                placeholder={placeholder || getInputFormat(config)}
                disabled={disabled}
                className={cn('h-10', clearable && inputText && 'pr-9')}
                onChange={(event) => {
                  setInputText(event.target.value)
                  setError('')
                }}
                onFocus={openFromInput}
                onBlur={validateAndCommit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              {clearable && inputText && !disabled ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='text-muted-foreground absolute top-1/2 right-1 size-8 -translate-y-1/2'
                  aria-label='清除日期时间'
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearValue}
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
                aria-label='打开日期时间选择'
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
            mode='single'
            locale={dateTimeCalendarLocale}
            labels={dateTimeCalendarLabels}
            selected={parseDate(getDatePart(inputText))}
            onSelect={updateDate}
            initialFocus
          />
          {showTime ? (
            <div className='flex items-center gap-3 border-t p-3'>
              <Label htmlFor={timeInputId} className='shrink-0'>
                时间选择
              </Label>
              <Input
                id={timeInputId}
                type='time'
                aria-label='选择时间'
                className='w-22 [&::-webkit-calendar-picker-indicator]:ml-auto'
                step={timeStep ?? (timeFormat === 'HH:mm:ss' ? 1 : 60)}
                value={getTimePart(inputText, config)}
                disabled={!getDatePart(inputText)}
                onChange={(event) => updateTime(event.target.value)}
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {error ? (
        <p id={errorId} role='alert' className='text-destructive text-xs'>
          {error}
        </p>
      ) : null}
    </div>
  )
}
