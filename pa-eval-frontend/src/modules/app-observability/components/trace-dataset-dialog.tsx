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
import { Label } from '@/components/ui/label'
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
import type { TraceDatasetAddProgress } from '../api/trace-dataset-api'
import type { TraceLogRow } from '../types'

type TraceDatasetMode = 'existing' | 'create'
export type TraceDatasetDataRange = 'BADCASE_ONLY' | 'ALL'

type TraceDatasetDataRangeOption = {
  value: TraceDatasetDataRange
  label: string
}

const DEFAULT_TRACE_DATASET_DATA_RANGE_OPTIONS: TraceDatasetDataRangeOption[] =
  [
    { value: 'BADCASE_ONLY', label: '仅 Badcase' },
    { value: 'ALL', label: '全部数据' },
  ]

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
      dataRange?: TraceDatasetDataRange
    } & ExistingDatasetFormValues)
  | ({
      mode: 'create'
      datasetType: DatasetType
      dataRange?: TraceDatasetDataRange
    } & CreateDatasetFormValues)

type TraceDatasetDialogProps = {
  open: boolean
  projectId: string
  traces: TraceLogRow[]
  selectedCount?: number
  isCrossPageSelection?: boolean
  projectName?: string
  description?: string
  dataRange?: TraceDatasetDataRange
  dataRangeOptions?: TraceDatasetDataRangeOption[]
  importProgress?: TraceDatasetAddProgress | null
  onDataRangeChange?: (range: TraceDatasetDataRange) => void
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
  selectedCount,
  isCrossPageSelection = false,
  projectName,
  description: descriptionProp,
  dataRange,
  dataRangeOptions = DEFAULT_TRACE_DATASET_DATA_RANGE_OPTIONS,
  importProgress,
  onDataRangeChange,
  onOpenChange,
  onSubmit,
}: TraceDatasetDialogProps) {
  const $api = useAPI()
  const [mode, setMode] = useState<TraceDatasetMode>('existing')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const datasetsQuery = useQuery({
    queryKey: ['project-datasets', $api, projectId, 'trace-dialog'],
    queryFn: () => listProjectDatasets($api, projectId, datasetQuery, 'all'),
    enabled: open,
  })
  const existingFormId = 'trace-existing-dataset-form'
  const createFormId = 'trace-create-dataset-form'
  const dataRangeSelectId = 'trace-dataset-data-range'
  const confirmFormId = mode === 'existing' ? existingFormId : createFormId
  const datasets = datasetsQuery.data?.datas ?? []
  const description = useMemo(() => {
    if (descriptionProp) {
      return descriptionProp
    }

    return isCrossPageSelection
      ? `将符合当前筛选条件的 ${selectedCount ?? traces.length} 条 Trace 写入目标数据集。`
      : `将 ${selectedCount ?? traces.length} 条 Trace 写入目标数据集。`
  }, [descriptionProp, isCrossPageSelection, selectedCount, traces.length])
  const submitValues = async (values: TraceDatasetSubmitValues) => {
    setIsSubmitting(true)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }
  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting && !nextOpen) {
      return
    }
    onOpenChange(nextOpen)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title='加入数据集'
      description={description}
      confirmText={mode === 'existing' ? '确认加入' : '创建并加入'}
      cancelProps={{ disabled: isSubmitting }}
      confirmProps={{
        type: 'submit',
        form: confirmFormId,
        disabled: isSubmitting,
      }}
      bodyProps={{ className: 'max-h-[70vh] overflow-auto' }}
    >
      <div className='flex flex-col gap-4'>
        {importProgress ? (
          <TraceDatasetImportProgress progress={importProgress} />
        ) : null}

        {dataRange ? (
          <div className='grid gap-2'>
            <Label htmlFor={dataRangeSelectId}>数据范围</Label>
            <Select
              value={dataRange}
              onValueChange={(value) =>
                onDataRangeChange?.(value as TraceDatasetDataRange)
              }
            >
              <SelectTrigger id={dataRangeSelectId} className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {dataRangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as TraceDatasetMode)}
        >
          <TabsList>
            <TabsTrigger value='existing'>选择已有数据集</TabsTrigger>
            <TabsTrigger value='create'>新建数据集</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'existing' ? (
          <BaseForm
            key={`existing-${open}-${traces.map((trace) => trace.traceId).join('-')}`}
            id={existingFormId}
            schema={existingDatasetSchema}
            defaultValues={{ datasetId: '' }}
            onSubmit={async (values) => {
              await submitValues({ mode: 'existing', ...values, dataRange })
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
              name: buildDefaultTraceDatasetName(
                'evaluation',
                projectName || projectId
              ),
              description: '',
              datasetType: 'evaluation',
            }}
            onSubmit={async (values: CreateDatasetFormValues) => {
              await submitValues({
                mode: 'create',
                ...values,
                dataRange,
              })
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

function TraceDatasetImportProgress({
  progress,
}: {
  progress: TraceDatasetAddProgress
}) {
  const isPreparing =
    progress.status === 'running' &&
    progress.percent === 0 &&
    progress.completedCount === 0
  const statusText =
    progress.status === 'failed'
      ? '导入失败'
      : progress.status === 'succeeded'
        ? '导入完成'
        : isPreparing
          ? '准备导入数据'
          : '正在加入数据集'

  return (
    <div className='grid gap-2 rounded-md border bg-muted/30 p-3'>
      <div className='flex items-center justify-between gap-3 text-sm'>
        <span className='font-medium'>{statusText}</span>
        <span className='text-muted-foreground'>{progress.percent}%</span>
      </div>
      <div
        className='h-2 overflow-hidden rounded-full bg-muted'
        role='progressbar'
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <div
          className='h-full rounded-full bg-primary transition-all'
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className='text-xs text-muted-foreground'>
        已处理 {progress.completedCount} / {progress.totalCount} 条
      </div>
    </div>
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
