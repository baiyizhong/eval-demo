import { z } from 'zod'
import { toast } from 'sonner'
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import { MixEditor } from '@/components/common/MixEditor'
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
export type DatasetItemDrawerIntent = 'create' | 'view' | 'edit'

type DatasetItemFormDrawerProps = {
  open: boolean
  intent: DatasetItemDrawerIntent
  item?: DatasetItemRecord | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: DatasetItemFormInput) => Promise<void> | void
}

export function DatasetItemFormDrawer({
  open,
  intent,
  item,
  onOpenChange,
  onSubmit,
}: DatasetItemFormDrawerProps) {
  const isView = intent === 'view'
  const isEdit = intent === 'edit'
  const isCreate = intent === 'create'
  const startsEditing = isEdit || isCreate
  const formId =
    isCreate ? 'create-dataset-item-form' : 'dataset-item-form'

  const handleSubmit = async (values: DatasetItemFormValues) => {
    if (isView) return

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
      title={getDrawerTitle(intent)}
      confirmText={intent === 'create' ? '创建' : '保存'}
      showConfirm={!isView}
      cancelText={isView ? '关闭' : '取消'}
      confirmProps={{ type: 'submit', form: formId }}
      contentProps={{ className: 'overflow-y-auto' }}
    >
      <BaseForm
        key={`${intent}-${item?.id ?? 'create'}`}
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
                  <MixEditor
                    value={field.value}
                    onValueChange={field.onChange}
                    title='Input'
                    readOnly={isView}
                    showEditButton={!isView}
                    defaultEditing={startsEditing}
                    showEditActions={false}
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
                  <MixEditor
                    value={field.value}
                    onValueChange={field.onChange}
                    title='Expected Output'
                    readOnly={isView}
                    showEditButton={!isView}
                    defaultEditing={startsEditing}
                    showEditActions={false}
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
                  <MixEditor
                    value={field.value}
                    onValueChange={field.onChange}
                    title='Metadata'
                    readOnly={isView}
                    showEditButton={!isView}
                    defaultEditing={startsEditing}
                    showEditActions={false}
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

function getDrawerTitle(intent: DatasetItemDrawerIntent) {
  if (intent === 'view') return '查看数据项'
  if (intent === 'edit') return '编辑数据项'
  return '新增数据项'
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
