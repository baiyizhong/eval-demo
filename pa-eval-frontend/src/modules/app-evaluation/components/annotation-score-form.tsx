import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
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
  onSubmit: (
    input: AnnotationScoreFormInput,
    mode: 'save' | 'saveNext'
  ) => Promise<void>
}

export function AnnotationScoreForm({
  item,
  scoreConfigs,
  onAddToDataset,
  onSubmit,
}: AnnotationScoreFormProps) {
  const formId = `annotation-score-form-${item.id}`

  return (
    <BaseForm
      key={item.id}
      id={formId}
      schema={scoreFormSchema}
      defaultValues={getDefaultValues(item, scoreConfigs)}
      onSubmit={(values) => onSubmit(values, 'save')}
      className='flex min-h-0 flex-1 flex-col p-0'
    >
      {(form) => (
        <>
          <div className='min-h-0 flex-1 overflow-auto p-4'>
            <div className='flex flex-col gap-4'>
              {scoreConfigs.map((config, index) => (
                <div key={config.id} className='rounded-lg border p-3'>
                  <div className='mb-3'>
                    <div className='font-medium'>{config.name}</div>
                    <div className='text-muted-foreground text-xs'>
                      {scoreDataTypeLabels[config.dataType]} ·{' '}
                      {config.description}
                    </div>
                  </div>
                  <ScoreValueField index={index} config={config} form={form} />
                  <FormField
                    control={form.control}
                    name={`scores.${index}.comment`}
                    render={({ field }) => (
                      <FormItem className='mt-3'>
                        <FormLabel>备注</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder='填写该指标的标注备注'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className='flex shrink-0 justify-end gap-2 border-t p-4'>
            <Button type='button' variant='outline' onClick={onAddToDataset}>
              加入数据集
            </Button>
            <Button type='submit' variant='outline'>
              保存
            </Button>
            <Button
              type='button'
              onClick={() => {
                void form.handleSubmit((values) =>
                  onSubmit(values, 'saveNext')
                )()
              }}
            >
              保存并下一条
            </Button>
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
            <FormLabel>评分值</FormLabel>
            <FormControl>
              <Input
                type='number'
                min={config.minValue}
                max={config.maxValue}
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
            <FormLabel>评分值</FormLabel>
            <FormControl>
              <RadioGroup
                value={
                  field.value === true
                    ? 'true'
                    : field.value === false
                      ? 'false'
                      : ''
                }
                onValueChange={(value) => field.onChange(value === 'true')}
              >
                <FormItem className='flex items-center gap-2'>
                  <FormControl>
                    <RadioGroupItem value='true' />
                  </FormControl>
                  <FormLabel className='font-normal'>是</FormLabel>
                </FormItem>
                <FormItem className='flex items-center gap-2'>
                  <FormControl>
                    <RadioGroupItem value='false' />
                  </FormControl>
                  <FormLabel className='font-normal'>否</FormLabel>
                </FormItem>
              </RadioGroup>
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
          <FormLabel>评分值</FormLabel>
          <FormControl>
            {config.dataType === 'TEXT' ? (
              <Textarea placeholder='填写文本评分' {...field} />
            ) : (
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                {(config.categories ?? []).map((category) => (
                  <FormItem key={category} className='flex items-center gap-2'>
                    <FormControl>
                      <RadioGroupItem value={category} />
                    </FormControl>
                    <FormLabel className='font-normal'>{category}</FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function getDefaultValues(
  item: AnnotationQueueItemRecord,
  scoreConfigs: ScoreConfigRecord[]
): ScoreFormValues {
  return {
    scores: scoreConfigs.map((config) => {
      const existing = item.scores.find((score) => score.configId === config.id)
      return {
        configId: config.id,
        value: existing?.value ?? null,
        stringValue: existing?.stringValue ?? '',
        comment: existing?.comment ?? '',
      }
    }),
  }
}
