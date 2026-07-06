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
import type { DataTableQueryState } from '@/components/common/data-table'
import { FormDialog } from '@/components/common/form-dialog'
import { useAPI } from '@/hooks/use-api'
import { listProjectDatasets } from '@/modules/app-evaluation/api/dataset-api'
import type { TraceLogRow } from '../types'

const traceDatasetSchema = z.object({
  datasetId: z.string().min(1, '请选择目标数据集'),
})

type TraceDatasetFormValues = z.infer<typeof traceDatasetSchema>

type TraceDatasetDialogProps = {
  open: boolean
  projectId: string
  traces: TraceLogRow[]
  onOpenChange: (open: boolean) => void
  onSubmit: (values: TraceDatasetFormValues) => Promise<void> | void
}

const datasetQuery: DataTableQueryState = {
  page: 1,
  pageSize: 100,
  keyword: '',
  filters: {},
  sorting: [],
}

export function TraceDatasetDialog({
  open,
  projectId,
  traces,
  onOpenChange,
  onSubmit,
}: TraceDatasetDialogProps) {
  const $api = useAPI()
  const datasetsQuery = useQuery({
    queryKey: ['project-datasets', projectId, 'trace-dialog'],
    queryFn: () => listProjectDatasets($api, projectId, datasetQuery, 'all'),
    enabled: open,
  })
  const formId = 'trace-dataset-form'

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title='加入数据集'
      description={`将 ${traces.length} 条 Trace 写入目标数据集。`}
      confirmText='确认加入'
      confirmProps={{ type: 'submit', form: formId }}
    >
      <BaseForm
        key={`${open}-${traces.map((trace) => trace.traceId).join('-')}`}
        id={formId}
        schema={traceDatasetSchema}
        defaultValues={{ datasetId: '' }}
        onSubmit={async (values) => {
          await onSubmit(values)
          onOpenChange(false)
        }}
        className='flex flex-col gap-4 p-0'
      >
        {(form) => (
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
        )}
      </BaseForm>
    </FormDialog>
  )
}
