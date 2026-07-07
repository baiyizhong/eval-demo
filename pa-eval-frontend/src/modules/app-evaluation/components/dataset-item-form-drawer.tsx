import { z } from 'zod'
import type { JsonData } from 'json-edit-react'
import { toast } from 'sonner'
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import { JsonEditorPanel } from '@/components/common/json-editor'
import {
  type JsonObject,
  type DatasetItemFormInput,
  type DatasetItemRecord,
} from '../types'

const jsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Boolean(value) && !Array.isArray(value), {
    message: '必须是合法 JSON 对象',
  })

const datasetItemFormSchema = z.object({
  input: z.unknown(),
  expectedOutput: z.unknown(),
  metadata: jsonObjectSchema,
})

type DatasetItemFormValues = z.infer<typeof datasetItemFormSchema>

type DatasetItemFormDrawerProps = {
  open: boolean
  item?: DatasetItemRecord | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: DatasetItemFormInput) => Promise<void> | void
}

export function DatasetItemFormDrawer({
  open,
  item,
  onOpenChange,
  onSubmit,
}: DatasetItemFormDrawerProps) {
  const formId = item ? 'edit-dataset-item-form' : 'create-dataset-item-form'

  const handleSubmit = async (values: DatasetItemFormValues) => {
    try {
      await onSubmit({
        input: values.input,
        expectedOutput: values.expectedOutput,
        metadata: values.metadata,
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存数据项失败')
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      mode='enhanced'
      title={item ? '查看/编辑数据项' : '新增数据项'}
      confirmText={item ? '保存' : '创建'}
      confirmProps={{ type: 'submit', form: formId }}
      contentProps={{ className: 'overflow-y-auto' }}
    >
      <BaseForm
        key={item?.id ?? 'create'}
        id={formId}
        schema={datasetItemFormSchema}
        defaultValues={getDefaultValues(item)}
        onSubmit={handleSubmit}
      >
        {(form) => (
          <>
            <FormField
              control={form.control}
              name='input'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Input</FormLabel>
                  <JsonEditorPanel
                    data={field.value as JsonData}
                    onDataChange={(nextData) => field.onChange(nextData)}
                    rootName='input'
                    title='Input'
                    height={260}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='expectedOutput'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected Output</FormLabel>
                  <JsonEditorPanel
                    data={field.value as JsonData}
                    onDataChange={(nextData) => field.onChange(nextData)}
                    rootName='expectedOutput'
                    title='Expected Output'
                    height={260}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='metadata'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metadata</FormLabel>
                  <JsonEditorPanel
                    data={field.value as JsonData}
                    onDataChange={(nextData) => field.onChange(nextData)}
                    rootName='metadata'
                    title='Metadata'
                    height={220}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      </BaseForm>
    </Drawer>
  )
}

function getDefaultValues(
  item?: DatasetItemRecord | null
): DatasetItemFormValues {
  return {
    input: item?.input ?? {},
    expectedOutput: item?.expectedOutput ?? {},
    metadata: (item?.metadata ?? {}) as JsonObject,
  }
}
