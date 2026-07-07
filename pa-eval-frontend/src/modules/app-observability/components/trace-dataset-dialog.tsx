import { useMemo, useState } from 'react'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { listProjectDatasets } from '@/modules/app-evaluation/api/dataset-api'
import {
  datasetTypeLabels,
  type DatasetType,
} from '@/modules/app-evaluation/types'
import { useAPI } from '@/hooks/use-api'
import {
  FormDescription,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import type { DataTableQueryState } from '@/components/common/data-table'
import { FormDialog } from '@/components/common/form-dialog'
import type { TraceLogRow } from '../types'

type TraceDatasetMode = 'existing' | 'create'

const existingDatasetSchema = z.object({
  datasetId: z.string().min(1, '请选择目标数据集'),
})

const createDatasetSchema = z.object({
  name: z.string().trim().min(1, '请输入数据集名称'),
  description: z.string().trim(),
  datasetType: z.enum(['evaluation', 'badcase', 'golden', 'anomaly']),
})

type ExistingDatasetFormValues = z.infer<typeof existingDatasetSchema>
type CreateDatasetFormValues = z.infer<typeof createDatasetSchema>

export type TraceDatasetSubmitValues =
  | ({
      mode: 'existing'
    } & ExistingDatasetFormValues)
  | ({
      mode: 'create'
      datasetType: DatasetType
    } & CreateDatasetFormValues)

type TraceDatasetDialogProps = {
  open: boolean
  projectId: string
  traces: TraceLogRow[]
  projectName?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (values: TraceDatasetSubmitValues) => Promise<void> | void
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
  projectName,
  onOpenChange,
  onSubmit,
}: TraceDatasetDialogProps) {
  const $api = useAPI()
  const [mode, setMode] = useState<TraceDatasetMode>('existing')
  const datasetsQuery = useQuery({
    queryKey: ['project-datasets', $api, projectId, 'trace-dialog'],
    queryFn: () => listProjectDatasets($api, projectId, datasetQuery, 'all'),
    enabled: open,
  })
  const existingFormId = 'trace-existing-dataset-form'
  const createFormId = 'trace-create-dataset-form'
  const confirmFormId = mode === 'existing' ? existingFormId : createFormId
  const datasets = datasetsQuery.data?.datas ?? []
  const description = useMemo(
    () => `将 ${traces.length} 条 Trace 写入目标数据集。`,
    [traces.length]
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title='加入数据集'
      description={description}
      confirmText={mode === 'existing' ? '确认加入' : '创建并加入'}
      confirmProps={{ type: 'submit', form: confirmFormId }}
      bodyProps={{ className: 'max-h-[70vh] overflow-auto' }}
    >
      <div className='flex flex-col gap-4'>
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as TraceDatasetMode)}
        >
          <TabsList>
            <TabsTrigger value='existing'>选择已有数据集</TabsTrigger>
            <TabsTrigger value='create'>新建评测集</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'existing' ? (
          <BaseForm
            key={`existing-${open}-${traces.map((trace) => trace.traceId).join('-')}`}
            id={existingFormId}
            schema={existingDatasetSchema}
            defaultValues={{ datasetId: '' }}
            onSubmit={async (values) => {
              await onSubmit({ mode: 'existing', ...values })
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
                          <SelectValue placeholder='选择已有数据集' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          {datasets.map((dataset) => (
                            <SelectItem key={dataset.id} value={dataset.id}>
                              {dataset.name} · {datasetTypeLabels[dataset.type]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {datasets.length === 0 ? (
                      <FormDescription>当前项目暂无数据集</FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </BaseForm>
        ) : (
          <BaseForm
            key={`create-${open}-${traces.map((trace) => trace.traceId).join('-')}`}
            id={createFormId}
            schema={createDatasetSchema}
            defaultValues={{
              name: buildDefaultTraceDatasetName('badcase', projectName || projectId),
              description: '',
              datasetType: 'badcase',
            }}
            onSubmit={async (values: CreateDatasetFormValues) => {
              await onSubmit({
                mode: 'create',
                ...values,
              })
              onOpenChange(false)
            }}
            className='flex flex-col gap-4 p-0'
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name='datasetType'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>数据集类型</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value)
                          const type = value as DatasetType
                          form.setValue(
                            'name',
                            buildDefaultTraceDatasetName(
                              type,
                              projectName || projectId
                            )
                          )
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='选择数据集类型' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(datasetTypeLabels).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>数据集名称</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='例如：AIOps Trace 评测集'
                          {...field}
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
                          placeholder='说明该评测集的来源和用途'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </BaseForm>
        )}
      </div>
    </FormDialog>
  )
}

export function buildDefaultTraceDatasetName(
  datasetType: DatasetType,
  projectName: string,
  date = new Date()
) {
  const stamp = date
    .toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .replace(/\//g, '')
  return `${datasetTypeLabels[datasetType]}-${projectName}${stamp}`
}
