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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import { MixEditor } from '@/components/common/MixEditor'
import {
  datasetTypeLabels,
  type DatasetFormInput,
  type DatasetRecord,
  type DatasetType,
} from '../types'

const jsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Boolean(value) && !Array.isArray(value), {
    message: '必须是合法 JSON 对象',
  })

const datasetFormSchema = z.object({
  name: z.string().min(1, '请输入数据集名称'),
  type: z.enum(['evaluation', 'badcase', 'golden', 'anomaly']),
  description: z.string(),
  metadata: jsonObjectSchema,
})

type DatasetFormValues = z.infer<typeof datasetFormSchema>

type DatasetFormDrawerProps = {
  open: boolean
  dataset?: DatasetRecord | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: DatasetFormInput) => Promise<void> | void
}

const datasetTypes: DatasetType[] = [
  'evaluation',
  'badcase',
  'golden',
  'anomaly',
]

export function DatasetFormDrawer({
  open,
  dataset,
  onOpenChange,
  onSubmit,
}: DatasetFormDrawerProps) {
  const formId = dataset ? 'edit-dataset-form' : 'create-dataset-form'
  const defaultValues = getDefaultValues(dataset)

  const handleSubmit = async (values: DatasetFormValues) => {
    try {
      await onSubmit({
        name: values.name,
        type: values.type,
        description: values.description,
        metadata: {
          ...values.metadata,
          type: values.type,
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
        schema={datasetFormSchema}
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
                    <Input placeholder='输入数据集名称' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>类型</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='选择数据集类型' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {datasetTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {datasetTypeLabels[type]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
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
                    <Textarea placeholder='输入数据集描述' {...field} />
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
    type: dataset?.type ?? 'evaluation',
    description: dataset?.description ?? '',
    metadata: dataset?.metadata ?? { type: 'evaluation' },
  }
}
