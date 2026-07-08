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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BaseForm } from '@/components/common/base-form'
import {
  buildAnnotationScoreDefaultValues,
  getBooleanScoreOptions,
  getBooleanScoreRadioValue,
  getCategoricalScoreOptions,
  normalizeAnnotationScoreFormInput,
  parseBooleanScoreInput,
} from './annotation-score-values'
import {
  scoreDataTypeLabels,
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
                  <div className='min-w-0'>
                    <div className='flex min-w-0 items-center gap-2'>
                      <div className='truncate text-sm font-medium'>
                        {config.name}
                      </div>
                      <Badge variant='outline' className='shrink-0'>
                        {scoreDataTypeLabels[config.dataType]}
                      </Badge>
                    </div>
                    {config.description ? (
                      <div className='text-muted-foreground mt-0.5 line-clamp-1 text-xs'>
                        {config.description}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={
                      config.dataType === 'TEXT'
                        ? 'grid gap-2'
                        : 'grid items-start gap-2 xl:grid-cols-[minmax(150px,200px)_minmax(0,1fr)]'
                    }
                  >
                    <ScoreValueField
                      index={index}
                      config={config}
                      form={form}
                    />
                    <FormField
                      control={form.control}
                      name={`scores.${index}.comment`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='sr-only'>
                            {config.name} 备注
                          </FormLabel>
                          <FormControl>
                            <Input
                              className='h-8'
                              placeholder='备注（可选）'
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
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
    return (
      <FormField
        control={form.control}
        name={`scores.${index}.value`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className='sr-only'>{config.name} 评分值</FormLabel>
            <FormControl>
              <Input
                type='number'
                placeholder='评分值'
                min={config.minValue}
                max={config.maxValue}
                disabled={config.archived}
                value={typeof field.value === 'number' ? field.value : ''}
                onChange={(event) =>
                  field.onChange(
                    event.target.value ? Number(event.target.value) : null
                  )
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
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
    const useSelect = shouldUseCategoricalSelect(options)
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
                  未配置选项
                </div>
              ) : useSelect ? (
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
                    <SelectValue placeholder='选择分类' />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <ToggleGroup
                  type='single'
                  variant='outline'
                  size='sm'
                  spacing={0}
                  value={typeof field.value === 'number' ? String(field.value) : ''}
                  disabled={config.archived}
                  onValueChange={(value) => {
                    if (!value) return
                    const option = options.find((item) => item.value === value)
                    field.onChange(Number(value))
                    form.setValue(
                      `scores.${index}.stringValue`,
                      option?.label ?? ''
                    )
                  }}
                  className='flex w-full flex-wrap'
                >
                  {options.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      aria-label={`${config.name} ${option.label}`}
                      className='min-w-16 flex-1'
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
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
              placeholder='文本评分'
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

function shouldUseCategoricalSelect(options: { label: string }[]) {
  return options.length > 3 || options.some((option) => option.label.length > 8)
}
