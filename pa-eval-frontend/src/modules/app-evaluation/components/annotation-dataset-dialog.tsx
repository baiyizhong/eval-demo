import type { JsonData } from 'json-edit-react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BaseForm } from '@/components/common/base-form'
import { FormDialog } from '@/components/common/form-dialog'
import { JsonEditorPanel } from '@/components/common/json-editor'
import type { DataTableQueryState } from '@/components/common/data-table'
import { listProjectDatasetsMock } from '../api/mock-dataset-api'
import type {
  AddAnnotationItemToDatasetInput,
  AnnotationQueueItemRecord,
} from '../types'

const addToDatasetSchema = z.object({
  datasetId: z.string().min(1, '请选择目标数据集'),
  input: z.unknown(),
  expectedOutput: z.unknown(),
  metadata: z.record(z.string(), z.unknown()),
})

type AddToDatasetValues = z.infer<typeof addToDatasetSchema>

type AnnotationDatasetDialogProps = {
  open: boolean
  projectId: string
  queueId: string
  item: AnnotationQueueItemRecord
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AddAnnotationItemToDatasetInput) => Promise<void> | void
}

const datasetQuery: DataTableQueryState = {
  page: 1,
  pageSize: 100,
  keyword: '',
  filters: {},
  sorting: [],
}

export function AnnotationDatasetDialog({
  open,
  projectId,
  queueId,
  item,
  onOpenChange,
  onSubmit,
}: AnnotationDatasetDialogProps) {
  const formId = `annotation-dataset-form-${item.id}`
  const datasetsQuery = useQuery({
    queryKey: ['project-datasets', projectId, 'annotation-dialog'],
    queryFn: () => listProjectDatasetsMock(projectId, datasetQuery, 'all'),
    enabled: open,
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title='加入数据集'
      description='选择目标数据集，并确认写入数据集的数据内容。'
      size='lg'
      confirmText='确认加入'
      confirmProps={{ type: 'submit', form: formId }}
      bodyProps={{ className: 'max-h-[70vh] overflow-auto' }}
    >
      <BaseForm
        key={`${item.id}-${open}`}
        id={formId}
        schema={addToDatasetSchema}
        defaultValues={getDefaultValues(queueId, item)}
        onSubmit={async (values) => {
          await onSubmit(values)
          onOpenChange(false)
        }}
        className='flex flex-col gap-4 p-0'
      >
        {(form) => (
          <>
            <FormField
              control={form.control}
              name='datasetId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目标数据集</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='选择数据集' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {(datasetsQuery.data?.datas ?? []).map((dataset) => (
                          <SelectItem key={dataset.id} value={dataset.id}>
                            {dataset.name}
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
              name='input'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Input</FormLabel>
                  <FormControl>
                    <JsonEditorPanel
                      data={field.value as JsonData}
                      onDataChange={field.onChange}
                      title='Input'
                      rootName='input'
                      height={180}
                    />
                  </FormControl>
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
                  <FormControl>
                    <JsonEditorPanel
                      data={field.value as JsonData}
                      onDataChange={field.onChange}
                      title='Expected Output'
                      rootName='expectedOutput'
                      height={180}
                    />
                  </FormControl>
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
                  <FormControl>
                    <JsonEditorPanel
                      data={field.value as JsonData}
                      onDataChange={field.onChange}
                      title='Metadata'
                      rootName='metadata'
                      height={180}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      </BaseForm>
    </FormDialog>
  )
}

function getDefaultValues(
  queueId: string,
  item: AnnotationQueueItemRecord
): AddToDatasetValues {
  return {
    datasetId: '',
    input: item.source.input,
    expectedOutput: item.source.output,
    metadata: {
      source: 'manual_annotation',
      annotationQueueId: queueId,
      annotationQueueItemId: item.id,
      annotatorUserId: item.completedBy?.id ?? '',
      scoreIds: item.scores.map((score) => score.id),
    },
  }
}
