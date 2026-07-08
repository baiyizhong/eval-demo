import { useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BaseForm } from '@/components/common/base-form'
import { cn } from '@/lib/utils'
import {
  buildAnnotationScoreDefaultValues,
  getBooleanScoreOptions,
  getBooleanScoreRadioValue,
  getCategoricalScoreOptions,
  normalizeAnnotationScoreFormInput,
  parseBooleanScoreInput,
} from './annotation-score-values'
import {
  type AnnotationQueueItemRecord,
  type AnnotationScoreFormInput,
  type ScoreConfigRecord,
} from '../types'

const scoreFormSchema = z.object({
  scores: z.array(
    z.object({
      configId: z.string(),
      value: z.union([z.number(), z.boolean(), z.null()]),
      stringValue: z.string(),
      comment: z.string(),
    })
  ),
})

type ScoreFormValues = z.infer<typeof scoreFormSchema>

type AnnotationScoreFormProps = {
  item: AnnotationQueueItemRecord
  scoreConfigs: ScoreConfigRecord[]
  onAddToDataset: () => void
  showAddToDataset?: boolean
  saveLabel?: string
  saveNextLabel?: string
  showSaveNext?: boolean
  submitHint?: string
  onSubmit: (
    input: AnnotationScoreFormInput,
    mode: 'save' | 'saveNext'
  ) => Promise<void>
}

const scoreDataTypeBusinessLabels: Record<ScoreConfigRecord['dataType'], string> = {
  NUMERIC: '数值评分',
  CATEGORICAL: '结果分类',
  BOOLEAN: '是否通过',
  TEXT: '文本评审',
}

export function AnnotationScoreForm({
  item,
  scoreConfigs,
  onAddToDataset,
  showAddToDataset = true,
  saveLabel = '保存',
  saveNextLabel = '保存并下一条',
  showSaveNext = true,
  submitHint = '',
  onSubmit,
}: AnnotationScoreFormProps) {
  const formId = `annotation-score-form-${item.id}`

  return (
    <BaseForm
      key={item.id}
      id={formId}
      schema={scoreFormSchema}
      defaultValues={buildAnnotationScoreDefaultValues(item, scoreConfigs)}
      onSubmit={(values) =>
        onSubmit(normalizeAnnotationScoreFormInput(values, scoreConfigs), 'save')
      }
      className='flex min-h-0 flex-1 flex-col p-0'
    >
      {(form) => (
        <>
          <div className='min-h-0 flex-1 overflow-auto p-3'>
            <div className='annotation-score-list rounded-md border'>
              {scoreConfigs.map((config, index) => (
                <div
                  key={config.id}
                  className='annotation-score-row grid gap-2 border-b px-3 py-2.5 last:border-b-0'
                >
                  <div className='flex min-w-0 items-start justify-between gap-2'>
                    <div className='flex min-w-0 items-center gap-2'>
                      <div className='min-w-0'>
                        <div className='flex min-w-0 items-center gap-2'>
                          <div className='truncate text-sm font-medium'>
                            {config.name}
                          </div>
                          <Badge variant='outline' className='shrink-0'>
                            {scoreDataTypeBusinessLabels[config.dataType]}
                          </Badge>
                        </div>
                        {config.description ? (
                          <div className='text-muted-foreground mt-0.5 line-clamp-1 text-xs'>
                            {config.description}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <ScoreCommentPopover
                      index={index}
                      config={config}
                      form={form}
                    />
                  </div>
                  <div
                    className={
                      config.dataType === 'TEXT'
                        ? 'grid gap-2'
                        : 'grid items-start gap-2'
                    }
                  >
                    <ScoreValueField
                      index={index}
                      config={config}
                      form={form}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-3'>
            <div className='text-muted-foreground min-w-0 text-xs'>
              {submitHint}
            </div>
            <div className='flex shrink-0 justify-end gap-2'>
              {showAddToDataset ? (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={onAddToDataset}
                >
                  加入数据集
                </Button>
              ) : null}
              <Button type='submit' variant='outline' size='sm'>
                {saveLabel}
              </Button>
              {showSaveNext ? (
                <Button
                  type='button'
                  size='sm'
                  onClick={() => {
                    void form.handleSubmit((values) =>
                      onSubmit(
                        normalizeAnnotationScoreFormInput(values, scoreConfigs),
                        'saveNext'
                      )
                    )()
                  }}
                >
                  {saveNextLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </BaseForm>
  )
}

function ScoreCommentPopover({
  index,
  config,
  form,
}: {
  index: number
  config: ScoreConfigRecord
  form: UseFormReturn<ScoreFormValues>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <FormField
      control={form.control}
      name={`scores.${index}.comment`}
      render={({ field }) => {
        const hasComment = Boolean(field.value?.trim())

        return (
          <FormItem className='shrink-0'>
            <FormLabel className='sr-only'>{config.name} 评审说明</FormLabel>
            <Popover
              open={open}
              onOpenChange={(nextOpen) => {
                setOpen(nextOpen)
                if (nextOpen) {
                  setDraft(field.value ?? '')
                }
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className={cn(
                        'size-8',
                        hasComment ? 'text-primary' : 'text-muted-foreground'
                      )}
                      aria-label={`${config.name} 评审说明`}
                    >
                      <MessageSquareText />
                      {hasComment ? (
                        <span className='bg-primary absolute top-1.5 right-1.5 size-1.5 rounded-full' />
                      ) : null}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>填写评审说明</TooltipContent>
              </Tooltip>
              <PopoverContent align='end' className='w-80 p-3'>
                <div className='grid gap-2'>
                  <div className='text-sm font-medium'>评审说明</div>
                  <FormControl>
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder='请输入本次人工评审的补充说明...'
                      className='min-h-24 resize-y'
                      maxLength={500}
                      disabled={config.archived}
                    />
                  </FormControl>
                  <div className='flex justify-end gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setDraft(field.value ?? '')
                        setOpen(false)
                      }}
                    >
                      取消
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      disabled={config.archived}
                      onClick={() => {
                        field.onChange(draft)
                        setOpen(false)
                      }}
                    >
                      保存
                    </Button>
                  </div>
                  <FormMessage />
                </div>
              </PopoverContent>
            </Popover>
          </FormItem>
        )
      }}
    />
  )
}

function ScoreValueField({
  index,
  config,
  form,
}: {
  index: number
  config: ScoreConfigRecord
  form: UseFormReturn<ScoreFormValues>
}) {
  if (config.dataType === 'NUMERIC') {
    const min = config.minValue ?? 0
    const max = config.maxValue ?? 1
    const step = max - min <= 1 ? 0.01 : 1

    return (
      <FormField
        control={form.control}
        name={`scores.${index}.value`}
        render={({ field }) => {
          const numericValue = typeof field.value === 'number' ? field.value : null
          const sliderValue = numericValue ?? min

          return (
            <FormItem>
              <FormLabel className='sr-only'>{config.name} 评分值</FormLabel>
              <FormControl>
                <div className='grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3'>
                  <Slider
                    min={min}
                    max={max}
                    step={step}
                    disabled={config.archived}
                    value={[sliderValue]}
                    onValueChange={([value]) => field.onChange(value ?? min)}
                    aria-label={`${config.name} 数值评分`}
                  />
                  <Input
                    type='number'
                    placeholder='分值'
                    min={min}
                    max={max}
                    step={step}
                    disabled={config.archived}
                    className='h-8'
                    value={numericValue ?? ''}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      if (!nextValue) {
                        field.onChange(null)
                        return
                      }
                      const parsed = Number(nextValue)
                      if (!Number.isFinite(parsed)) return
                      field.onChange(Math.min(max, Math.max(min, parsed)))
                    }}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )
        }}
      />
    )
  }

  if (config.dataType === 'BOOLEAN') {
    return (
      <FormField
        control={form.control}
        name={`scores.${index}.value`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className='sr-only'>{config.name} 评分值</FormLabel>
            <FormControl>
              <ToggleGroup
                type='single'
                variant='outline'
                size='sm'
                spacing={0}
                className='grid w-full grid-cols-2'
                disabled={config.archived}
                value={getBooleanScoreRadioValue(field.value)}
                onValueChange={(value) => {
                  if (!value) return
                  field.onChange(parseBooleanScoreInput(value))
                }}
              >
                {getBooleanScoreOptions().map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    aria-label={`${config.name} ${option.label}`}
                    className='w-full'
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  if (config.dataType === 'CATEGORICAL') {
    const options = getCategoricalScoreOptions(config)
    return (
      <FormField
        control={form.control}
        name={`scores.${index}.value`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className='sr-only'>{config.name} 评分值</FormLabel>
            <FormControl>
              {!options.length ? (
                <div className='text-muted-foreground flex h-8 items-center text-xs'>
                  未配置评审结果
                </div>
              ) : (
                <Select
                  value={typeof field.value === 'number' ? String(field.value) : ''}
                  disabled={config.archived}
                  onValueChange={(value) => {
                    const option = options.find((item) => item.value === value)
                    field.onChange(Number(value))
                    form.setValue(
                      `scores.${index}.stringValue`,
                      option?.label ?? ''
                    )
                  }}
                >
                  <SelectTrigger className='h-8'>
                    <SelectValue placeholder='请选择评审结果' />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  return (
    <FormField
      control={form.control}
      name={`scores.${index}.stringValue`}
      render={({ field }) => (
        <FormItem>
          <FormLabel className='sr-only'>{config.name} 评分值</FormLabel>
          <FormControl>
            <Textarea
              placeholder='请输入文本评审内容'
              className='min-h-16 resize-y'
              maxLength={500}
              disabled={config.archived}
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
