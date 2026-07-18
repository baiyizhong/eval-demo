import { useMemo, useState } from 'react'
import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import {
  listProjectAnnotationQueues,
  listProjectAnnotationUsers,
  listProjectScoreConfigsForAnnotation,
  type TraceAnnotationTaskProgress,
} from '@/modules/app-evaluation/api/annotation-api'
import {
  AnnotationAssignmentFields,
  type AnnotationAssignmentFormValues,
} from '@/modules/app-evaluation/components/annotation-assignment-fields'
import {
  scoreDataTypeLabels,
  type AnnotationAssignmentStrategy,
  type AnnotationQueueFormInput,
} from '@/modules/app-evaluation/types'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  FormControl,
  FormDescription,
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

type AnnotationMode = 'existing' | 'new'

const existingQueueSchema = z.object({
  queueId: z.string().min(1, '请选择人工标注队列'),
})

const newQueueSchema = z.object({
  name: z.string().min(1, '请输入任务名称'),
  description: z.string(),
  scoreConfigIds: z.array(z.string()).min(1, '请选择至少一个评分指标'),
  assigneeIds: z.array(z.string()),
  assignmentStrategy: z.enum(['average', 'random', 'weighted']),
  assignmentWeights: z.record(z.string(), z.number().min(1)),
})

type TraceAnnotationDialogProps = {
  open: boolean
  projectId: string
  traces: TraceLogRow[]
  selectedCount?: number
  isCrossPageSelection?: boolean
  projectName?: string
  defaultDescription?: string
  taskProgress?: TraceAnnotationTaskProgress | null
  onOpenChange: (open: boolean) => void
  onSubmitExisting: (queueId: string) => Promise<void> | void
  onSubmitNew: (input: AnnotationQueueFormInput) => Promise<void> | void
}

const queueQuery: DataTableQueryState = {
  page: 1,
  pageSize: 200,
  keyword: '',
  filters: {},
  sorting: [],
}

export function TraceAnnotationDialog({
  open,
  projectId,
  traces,
  selectedCount,
  isCrossPageSelection = false,
  projectName,
  defaultDescription = '',
  taskProgress,
  onOpenChange,
  onSubmitExisting,
  onSubmitNew,
}: TraceAnnotationDialogProps) {
  const $api = useAPI()
  const [mode, setMode] = useState<AnnotationMode>('existing')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const existingFormId = 'trace-existing-annotation-form'
  const newFormId = 'trace-new-annotation-form'

  const queuesQuery = useQuery({
    queryKey: ['project-annotation-queues', $api, projectId, 'trace-dialog'],
    queryFn: () => listProjectAnnotationQueues($api, projectId, queueQuery),
    enabled: open,
  })
  const scoreConfigsQuery = useQuery({
    queryKey: ['project-score-configs', $api, projectId],
    queryFn: () => listProjectScoreConfigsForAnnotation($api, projectId),
    enabled: open,
  })
  const usersQuery = useQuery({
    queryKey: ['project-annotation-users', $api, projectId],
    queryFn: () => listProjectAnnotationUsers($api, projectId),
    enabled: open,
  })

  const queues = queuesQuery.data?.datas ?? []
  const scoreConfigs = scoreConfigsQuery.data ?? []
  const users = usersQuery.data ?? []
  const confirmFormId = mode === 'existing' ? existingFormId : newFormId
  const description = useMemo(
    () =>
      isCrossPageSelection
        ? `将符合当前筛选条件的 ${selectedCount ?? traces.length} 条 Trace 加入人工标注队列。`
        : `将 ${selectedCount ?? traces.length} 条 Trace 加入人工标注队列。`,
    [isCrossPageSelection, selectedCount, traces.length]
  )
  const submitExisting = async (queueId: string) => {
    setIsSubmitting(true)
    try {
      await onSubmitExisting(queueId)
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }
  const submitNew = async (input: AnnotationQueueFormInput) => {
    setIsSubmitting(true)
    try {
      await onSubmitNew(input)
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
      title='发起人工标注'
      description={description}
      size='lg'
      confirmText={mode === 'existing' ? '加入队列' : '创建并加入'}
      cancelProps={{ disabled: isSubmitting }}
      confirmProps={{
        type: 'submit',
        form: confirmFormId,
        disabled: isSubmitting,
      }}
      bodyProps={{ className: 'max-h-[70vh] overflow-auto' }}
    >
      <div className='flex flex-col gap-4'>
        {taskProgress ? (
          <TraceAnnotationTaskProgressPanel progress={taskProgress} />
        ) : null}

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as AnnotationMode)}
        >
          <TabsList>
            <TabsTrigger value='existing'>选择已有队列</TabsTrigger>
            <TabsTrigger value='new'>新建标注任务</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'existing' ? (
          <BaseForm
            key={`existing-${open}`}
            id={existingFormId}
            schema={existingQueueSchema}
            defaultValues={{ queueId: '' }}
            onSubmit={async (values) => {
              await submitExisting(values.queueId)
            }}
            className='flex flex-col gap-4 p-0'
          >
            {(form) => (
              <FormField
                control={form.control}
                name='queueId'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>人工标注队列</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='选择已有队列' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          {queues.map((queue) => (
                            <SelectItem key={queue.id} value={queue.id}>
                              {queue.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {queues.length === 0 ? (
                      <FormDescription>
                        当前项目暂无人工标注队列
                      </FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </BaseForm>
        ) : (
          <BaseForm
            key={`new-${open}`}
            id={newFormId}
            schema={newQueueSchema}
            defaultValues={{
              name: buildDefaultAnnotationTaskName(projectName || projectId),
              description: defaultDescription,
              scoreConfigIds: [],
              assigneeIds: [],
              assignmentStrategy: 'average',
              assignmentWeights: {},
            }}
            onSubmit={async (values) => {
              await submitNew(normalizeAnnotationQueueFormValues(values))
            }}
            className='flex flex-col gap-4 p-0'
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>任务名称</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='例如：Trace 异常人工标注'
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
                      <FormLabel>任务描述</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='说明任务目标和标注范围'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='scoreConfigIds'
                  render={() => (
                    <FormItem>
                      <FormLabel>评分指标</FormLabel>
                      <FormDescription>
                        标注详情页会按所选指标生成评分表单。
                      </FormDescription>
                      <div className='flex flex-col gap-2'>
                        {scoreConfigs.map((config) => (
                          <FormField
                            key={config.id}
                            control={form.control}
                            name='scoreConfigIds'
                            render={({ field }) => (
                              <FormItem className='flex items-start gap-3 rounded-md border px-3 py-2'>
                                <FormControl>
                                  <Checkbox
                                    className='mt-0.5'
                                    checked={field.value.includes(config.id)}
                                    onCheckedChange={(checked) => {
                                      const next = checked
                                        ? [...field.value, config.id]
                                        : field.value.filter(
                                            (id) => id !== config.id
                                          )
                                      field.onChange(next)
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className='flex min-w-0 flex-1 cursor-pointer items-center gap-2 font-normal'>
                                  <span className='truncate'>
                                    {config.name}
                                  </span>
                                  <Badge variant='secondary' className='shrink-0'>
                                    {scoreDataTypeLabels[config.dataType]}
                                  </Badge>
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                        {scoreConfigs.length === 0 ? (
                          <div className='text-muted-foreground text-sm'>
                            当前项目暂无可用评分指标
                          </div>
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='assigneeIds'
                  render={() => (
                    <FormItem>
                      <FormLabel>处理人</FormLabel>
                      <div className='flex flex-col gap-2'>
                        {users.map((user) => (
                          <FormField
                            key={user.id}
                            control={form.control}
                            name='assigneeIds'
                            render={({ field }) => (
                              <FormItem className='flex items-center gap-2'>
                                <FormControl>
                                  <Checkbox
                                    checked={field.value.includes(user.id)}
                                    onCheckedChange={(checked) => {
                                      const next = checked
                                        ? [...field.value, user.id]
                                        : field.value.filter(
                                            (id) => id !== user.id
                                          )
                                      field.onChange(next)
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className='font-normal'>
                                  {user.name}（{user.email}）
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                        {users.length === 0 ? (
                          <div className='text-muted-foreground text-sm'>
                            当前项目暂无可分配成员
                          </div>
                        ) : null}
                      </div>
                    </FormItem>
                  )}
                />
                <AnnotationAssignmentFields
                  form={
                    form as unknown as UseFormReturn<AnnotationAssignmentFormValues>
                  }
                  users={users}
                />
              </>
            )}
          </BaseForm>
        )}
      </div>
    </FormDialog>
  )
}

function normalizeAnnotationQueueFormValues(
  values: z.infer<typeof newQueueSchema>
): AnnotationQueueFormInput {
  const selectedAssigneeIds = values.assigneeIds
  const assignmentStrategy: AnnotationAssignmentStrategy =
    selectedAssigneeIds.length > 1 ? values.assignmentStrategy : 'average'
  const assignmentWeights = Object.fromEntries(
    selectedAssigneeIds.map((assigneeId) => [
      assigneeId,
      Math.max(1, Number(values.assignmentWeights[assigneeId] ?? 1)),
    ])
  )

  return {
    ...values,
    assignmentStrategy,
    assignmentWeights,
  }
}

function TraceAnnotationTaskProgressPanel({
  progress,
}: {
  progress: TraceAnnotationTaskProgress
}) {
  const isPreparing =
    progress.status === 'running' &&
    progress.percent === 0 &&
    progress.completedCount === 0
  const statusText =
    progress.status === 'failed'
      ? '创建失败'
      : progress.status === 'succeeded'
        ? '创建完成'
        : isPreparing
          ? '准备创建任务'
          : '正在创建任务'

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

function buildDefaultAnnotationTaskName(
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
  return `人工标注-${projectName}${stamp}`
}
