import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
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
import { useAPI } from '@/hooks/use-api'
import {
  listProjectAnnotationQueues,
  listProjectAnnotationUsers,
  listProjectScoreConfigs,
} from '@/modules/app-evaluation/api/annotation-api'
import {
  scoreDataTypeLabels,
  type AnnotationQueueFormInput,
} from '@/modules/app-evaluation/types'
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
})

type TraceAnnotationDialogProps = {
  open: boolean
  projectId: string
  traces: TraceLogRow[]
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
  onOpenChange,
  onSubmitExisting,
  onSubmitNew,
}: TraceAnnotationDialogProps) {
  const $api = useAPI()
  const [mode, setMode] = useState<AnnotationMode>('existing')
  const existingFormId = 'trace-existing-annotation-form'
  const newFormId = 'trace-new-annotation-form'

  const queuesQuery = useQuery({
    queryKey: ['project-annotation-queues', projectId, 'trace-dialog'],
    queryFn: () => listProjectAnnotationQueues($api, projectId, queueQuery),
    enabled: open,
  })
  const scoreConfigsQuery = useQuery({
    queryKey: ['project-score-configs', projectId],
    queryFn: () => listProjectScoreConfigs($api, projectId),
    enabled: open,
  })
  const usersQuery = useQuery({
    queryKey: ['project-annotation-users', projectId],
    queryFn: () => listProjectAnnotationUsers($api, projectId),
    enabled: open,
  })

  const queues = queuesQuery.data?.datas ?? []
  const scoreConfigs = scoreConfigsQuery.data ?? []
  const users = usersQuery.data ?? []
  const confirmFormId = mode === 'existing' ? existingFormId : newFormId
  const description = useMemo(
    () => `将 ${traces.length} 条 Trace 加入人工标注队列。`,
    [traces.length]
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title='发起人工标注'
      description={description}
      size='lg'
      confirmText={mode === 'existing' ? '加入队列' : '创建并加入'}
      confirmProps={{ type: 'submit', form: confirmFormId }}
      bodyProps={{ className: 'max-h-[70vh] overflow-auto' }}
    >
      <div className='flex flex-col gap-4'>
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as AnnotationMode)}
        >
          <TabsList>
            <TabsTrigger value='existing'>选择已有队列</TabsTrigger>
            <TabsTrigger value='new'>新建人工标注</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'existing' ? (
          <BaseForm
            key={`existing-${open}`}
            id={existingFormId}
            schema={existingQueueSchema}
            defaultValues={{ queueId: '' }}
            onSubmit={async (values) => {
              await onSubmitExisting(values.queueId)
              onOpenChange(false)
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
                      <FormDescription>当前项目暂无人工标注队列</FormDescription>
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
              name: '',
              description: '',
              scoreConfigIds: [],
              assigneeIds: [],
            }}
            onSubmit={async (values) => {
              await onSubmitNew(values)
              onOpenChange(false)
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
                        <Input placeholder='例如：Trace 异常人工标注' {...field} />
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
                        <Textarea placeholder='说明任务目标和标注范围' {...field} />
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
                              <FormItem className='flex items-center gap-2'>
                                <FormControl>
                                  <Checkbox
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
                                <FormLabel className='font-normal'>
                                  {config.name} ·{' '}
                                  {scoreDataTypeLabels[config.dataType]}
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
              </>
            )}
          </BaseForm>
        )}
      </div>
    </FormDialog>
  )
}
