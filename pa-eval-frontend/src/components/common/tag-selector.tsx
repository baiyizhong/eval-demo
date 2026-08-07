import { useMemo, useState } from 'react'
import { ChevronsUpDown, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type TagOption = {
  label: string
  value?: string
  disabled?: boolean
}

export type TagSelectorProps = {
  value: string[]
  options: Array<TagOption | string>
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  allowCreate?: boolean
  disabled?: boolean
  maxTags?: number
  maxTagLength?: number
  className?: string
  onChange: (value: string[]) => void
}

type NormalizedTagOption = {
  label: string
  value: string
  disabled?: boolean
}

export function TagSelector({
  value,
  options,
  placeholder = '选择标签',
  searchPlaceholder = '搜索或新增标签',
  emptyText = '暂无标签',
  allowCreate = true,
  disabled,
  maxTags,
  maxTagLength,
  className,
  onChange,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const selectedValues = useMemo(() => normalizeTagValues(value), [value])
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options])
  const optionLabels = useMemo(
    () =>
      new Map(
        normalizedOptions.map((option) => [option.value, option.label] as const)
      ),
    [normalizedOptions]
  )
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const normalizedInputValue = normalizeTagValue(inputValue)
  const canAddMore =
    typeof maxTags !== 'number' || selectedValues.length < maxTags
  const canCreateInputValue =
    allowCreate &&
    normalizedInputValue.length > 0 &&
    (typeof maxTagLength !== 'number' ||
      Array.from(normalizedInputValue).length <= maxTagLength) &&
    !selectedSet.has(normalizedInputValue)

  const updateValue = (nextValue: string[]) => {
    onChange(normalizeTagValues(nextValue))
  }

  const addValue = (nextValue: string) => {
    const normalizedValue = normalizeTagValue(nextValue)
    if (!normalizedValue || selectedSet.has(normalizedValue)) return
    if (!canAddMore) return
    updateValue([...selectedValues, normalizedValue])
  }

  const removeValue = (nextValue: string) => {
    updateValue(selectedValues.filter((item) => item !== nextValue))
  }

  const createValue = () => {
    if (!canCreateInputValue || !canAddMore) return
    addValue(normalizedInputValue)
    setInputValue('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role='combobox'
          tabIndex={disabled ? -1 : 0}
          aria-expanded={open}
          aria-disabled={disabled}
          className={cn(
            'border-input bg-background ring-offset-background focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] aria-disabled:pointer-events-none aria-disabled:opacity-50',
            className
          )}
          onKeyDown={(event) => {
            if (disabled) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setOpen((current) => !current)
          }}
        >
          <div className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>
            {selectedValues.length > 0 ? (
              selectedValues.map((item) => (
                <Badge key={item} variant='secondary'>
                  <span className='max-w-40 truncate'>
                    {optionLabels.get(item) ?? item}
                  </span>
                  <button
                    type='button'
                    className='hover:text-foreground focus-visible:ring-ring/50 text-muted-foreground -mr-1 inline-flex rounded-sm outline-none focus-visible:ring-[2px]'
                    aria-label={`移除标签 ${optionLabels.get(item) ?? item}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      removeValue(item)
                    }}
                  >
                    <X className='size-3' aria-hidden='true' />
                  </button>
                </Badge>
              ))
            ) : (
              <span className='text-muted-foreground'>{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='flex w-[var(--radix-popover-trigger-width)] flex-col gap-3 p-3'
      >
        <div className='flex items-center gap-2'>
          <div className='relative min-w-0 flex-1'>
            <Input
              value={inputValue}
              disabled={disabled || !allowCreate || !canAddMore}
              placeholder={searchPlaceholder}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                createValue()
              }}
            />
          </div>
          <Button
            type='button'
            size='icon'
            variant='outline'
            disabled={!canCreateInputValue || !canAddMore}
            aria-label='添加标签'
            onClick={createValue}
          >
            <Plus />
          </Button>
        </div>
        <div className='flex min-h-6 flex-wrap justify-end gap-1.5'>
          {normalizedOptions.length > 0 ? (
            normalizedOptions.map((option) => (
              <Button
                key={option.value}
                type='button'
                size='sm'
                variant='outline'
                disabled={
                  option.disabled ||
                  selectedSet.has(option.value) ||
                  !canAddMore
                }
                onClick={() => addValue(option.value)}
              >
                {option.label}
              </Button>
            ))
          ) : (
            <span className='text-muted-foreground text-xs'>{emptyText}</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function normalizeOptions(options: Array<TagOption | string>) {
  const seen = new Set<string>()
  const normalizedOptions: NormalizedTagOption[] = []

  for (const option of options) {
    const label = typeof option === 'string' ? option : option.label
    const value =
      typeof option === 'string' ? option : (option.value ?? option.label)
    const normalizedValue = normalizeTagValue(value)

    if (!normalizedValue || seen.has(normalizedValue)) continue

    seen.add(normalizedValue)
    normalizedOptions.push({
      label: label.trim(),
      value: normalizedValue,
      disabled: typeof option === 'string' ? undefined : option.disabled,
    })
  }

  return normalizedOptions
}

function normalizeTagValues(values: string[]) {
  const seen = new Set<string>()
  const normalizedValues: string[] = []

  for (const value of values) {
    const normalizedValue = normalizeTagValue(value)
    if (!normalizedValue || seen.has(normalizedValue)) continue
    seen.add(normalizedValue)
    normalizedValues.push(normalizedValue)
  }

  return normalizedValues
}

function normalizeTagValue(value: string) {
  return value.trim()
}
