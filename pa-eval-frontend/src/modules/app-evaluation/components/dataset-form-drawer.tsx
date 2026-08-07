import { useMemo } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MixEditor } from '@/components/common/MixEditor'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import { TagSelector } from '@/components/common/tag-selector'
import {
  datasetPresetTags,
  getDatasetTags,
  normalizeDatasetType,
  resolveDatasetLegacyType,
} from '../lib/dataset-tags'
import {
  createAvailableResourceNameSchema,
  type ResourceNameAvailabilityChecker,
} from '../lib/name-availability'
import { type DatasetFormInput, type DatasetRecord } from '../types'

const jsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Boolean(value) && !Array.isArray(value), {
    message: '必须是合法 JSON 对象',
  })

const DATASET_NAME_MAX_LENGTH = 30
const DATASET_DESCRIPTION_MAX_LENGTH = 200

const datasetFormBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请输入数据集名称')
    .max(DATASET_NAME_MAX_LENGTH, '数据集名称不能超过30个字'),
  tags: z
    .array(
      z.string().trim().min(1, '标签不能为空').max(20, '单个标签不能超过20个字')
    )
    .max(8, '标签不能超过8个'),
  description: z
    .string()
    .max(DATASET_DESCRIPTION_MAX_LENGTH, '数据集描述不能超过200个字'),
  metadata: jsonObjectSchema,
})

type DatasetFormValues = z.infer<typeof datasetFormBaseSchema>

type DatasetFormDrawerProps = {
  open: boolean
  dataset?: DatasetRecord | null
  checkNameAvailability: ResourceNameAvailabilityChecker
  onOpenChange: (open: boolean) => void
  onSubmit: (input: DatasetFormInput) => Promise<void> | void
}

export function DatasetFormDrawer({
  open,
  dataset,
  checkNameAvailability,
  onOpenChange,
  onSubmit,
}: DatasetFormDrawerProps) {
  const formId = dataset ? 'edit-dataset-form' : 'create-dataset-form'
  const defaultValues = getDefaultValues(dataset)
  const schema = useMemo(
    () =>
      dataset
        ? datasetFormBaseSchema
        : datasetFormBaseSchema.extend({
            name: createAvailableResourceNameSchema({
              requiredMessage: '请输入数据集名称',
              duplicateMessage: '数据集名称已存在，请修改名称',
              maxLength: DATASET_NAME_MAX_LENGTH,
              maxLengthMessage: '数据集名称不能超过30个字',
              checkAvailability: checkNameAvailability,
            }),
          }),
    [checkNameAvailability, dataset]
  )

  const handleSubmit = async (values: DatasetFormValues) => {
    const legacyType = resolveDatasetLegacyType(
      values.tags,
      normalizeDatasetType(dataset?.type)
    )
    const metadata = omitMetadataType(values.metadata)

    try {
      await onSubmit({
        name: values.name,
        type: legacyType,
        description: values.description,
        metadata: {
          ...metadata,
          tags: values.tags,
        },
        inputSchema: dataset?.inputSchema ?? {},
        expectedOutputSchema: dataset?.expectedOutputSchema ?? {},
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存数据集失败')
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={dataset ? '编辑数据集' : '新建数据集'}
      confirmText={dataset ? '保存' : '创建'}
      confirmProps={{ type: 'submit', form: formId }}
    >
      <BaseForm
        key={dataset?.id ?? 'create'}
        id={formId}
        schema={schema}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
      >
        {(form) => (
          <>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名称</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='输入数据集名称'
                      maxLength={DATASET_NAME_MAX_LENGTH}
                      {...field}
                      aria-invalid={Boolean(form.formState.errors.name)}
                      onChange={(event) => {
                        field.onChange(event)
                        form.clearErrors('name')
                      }}
                      onBlur={() => {
                        field.onBlur()
                        if (!dataset) void form.trigger('name')
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='tags'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>标签</FormLabel>
                  <FormControl>
                    <TagSelector
                      value={field.value}
                      options={datasetPresetTags}
                      allowCreate
                      maxTags={8}
                      maxTagLength={20}
                      placeholder='选择或新增标签'
                      searchPlaceholder='输入标签名称'
                      emptyText='暂无预置标签'
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='输入数据集描述'
                      maxLength={DATASET_DESCRIPTION_MAX_LENGTH}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <JsonTextareaField
              control={form.control}
              name='metadata'
              label='Metadata'
            />
          </>
        )}
      </BaseForm>
    </Drawer>
  )
}

function JsonTextareaField({
  control,
  name,
  label,
}: {
  control: React.ComponentProps<typeof FormField<DatasetFormValues>>['control']
  name: keyof DatasetFormValues
  label: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <MixEditor
            value={field.value}
            onValueChange={field.onChange}
            title={label}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function getDefaultValues(dataset?: DatasetRecord | null): DatasetFormValues {
  return {
    name: dataset?.name ?? '',
    tags: getDatasetTags(dataset),
    description: dataset?.description ?? '',
    metadata: dataset?.metadata
      ? omitMetadataType(dataset.metadata)
      : {
          tags: getDatasetTags(dataset),
        },
  }
}

function omitMetadataType(metadata: Record<string, unknown>) {
  const { type: _type, ...rest } = metadata
  return rest
}
