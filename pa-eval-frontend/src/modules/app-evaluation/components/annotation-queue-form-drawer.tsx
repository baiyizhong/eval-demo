import { useMemo, useState } from 'react'
import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import {
  scoreDataTypeLabels,
  type AnnotationAssignmentStrategy,
  type AnnotationQueueFormInput,
  type AnnotationQueueRecord,
  type ProjectUserRecord,
  type ScoreConfigRecord,
} from '../types'
import {
  AnnotationAssignmentFields,
  type AnnotationAssignmentFormValues,
} from './annotation-assignment-fields'

const annotationQueueFormSchema = z.object({
  name: z.string().min(1, '请输入任务名称'),
  description: z.string(),
  scoreConfigIds: z.array(z.string()).min(1, '请选择至少一个评分指标'),
  assigneeIds: z.array(z.string()),
  assignmentStrategy: z.enum(['average', 'random', 'weighted']),
  assignmentWeights: z.record(z.string(), z.number().min(1)),
})

type AnnotationQueueFormValues = z.infer<typeof annotationQueueFormSchema>

type AnnotationQueueFormDrawerProps = {
  open: boolean
  queue?: AnnotationQueueRecord | null
  scoreConfigs: ScoreConfigRecord[]
  users: ProjectUserRecord[]
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AnnotationQueueFormInput) => Promise<void> | void
}

export function AnnotationQueueFormDrawer({
  open,
  queue,
  scoreConfigs,
  users,
  onOpenChange,
  onSubmit,
}: AnnotationQueueFormDrawerProps) {
  const formId = queue
    ? 'edit-annotation-queue-form'
    : 'create-annotation-queue-form'

  const handleSubmit = async (values: AnnotationQueueFormValues) => {
    try {
      await onSubmit(normalizeAnnotationQueueFormValues(values))
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '保存人工标注任务失败'
      )
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={queue ? '编辑人工标注任务' : '新建人工标注任务'}
      confirmText={queue ? '保存' : '创建'}
      confirmProps={{ form: formId, type: 'submit' }}
    >
      <BaseForm
        key={queue?.id ?? 'new'}
        id={formId}
        schema={annotationQueueFormSchema}
        defaultValues={getDefaultValues(queue)}
        onSubmit={handleSubmit}
        className='flex flex-col gap-4'
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
                      placeholder='例如：客服会话质量人工标注'
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
                              <span className='truncate'>{config.name}</span>
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>候选处理人</FormLabel>
                  <CandidateAssigneeSelector
                    users={users}
                    selectedIds={field.value}
                    onSelectedIdsChange={field.onChange}
                  />
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
    </Drawer>
  )
}

function CandidateAssigneeSelector({
  users,
  selectedIds,
  onSelectedIdsChange,
}: {
  users: ProjectUserRecord[]
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
}) {
  const [keyword, setKeyword] = useState('')
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const filteredUsers = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    if (!needle) return users
    return users.filter((user) =>
      [user.name, user.email, user.id].some((value) =>
        (value ?? '').toLowerCase().includes(needle)
      )
    )
  }, [keyword, users])
  const selectedCount = selectedIds.length
  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((user) => selectedSet.has(user.id))

  const toggleUser = (userId: string, checked: boolean) => {
    onSelectedIdsChange(
      checked
        ? [...new Set([...selectedIds, userId])]
        : selectedIds.filter((id) => id !== userId)
    )
  }
  const selectFilteredUsers = () => {
    onSelectedIdsChange([
      ...new Set([...selectedIds, ...filteredUsers.map((user) => user.id)]),
    ])
  }

  if (!users.length) {
    return (
      <div className='text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm'>
        当前项目暂无可分配成员
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-2 rounded-md border p-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder='搜索候选处理人姓名或邮箱'
          className='h-8 sm:flex-1'
        />
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!filteredUsers.length || allFilteredSelected}
            onClick={selectFilteredUsers}
          >
            全选当前结果
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={!selectedCount}
            onClick={() => onSelectedIdsChange([])}
          >
            清空
          </Button>
        </div>
      </div>
      <div className='text-muted-foreground text-xs'>
        已选 {selectedCount} 人
      </div>
      <div className='max-h-56 overflow-auto rounded-md border'>
        {filteredUsers.map((user) => (
          <label
            key={user.id}
            className='hover:bg-muted/60 flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0'
          >
            <Checkbox
              checked={selectedSet.has(user.id)}
              onCheckedChange={(checked) =>
                toggleUser(user.id, checked === true)
              }
              aria-label={`选择候选处理人 ${user.name || user.email || user.id}`}
            />
            <span className='min-w-0 flex-1 truncate'>
              {user.name || user.email || user.id}
              {user.email ? (
                <span className='text-muted-foreground'>（{user.email}）</span>
              ) : null}
            </span>
          </label>
        ))}
        {!filteredUsers.length ? (
          <div className='text-muted-foreground px-3 py-6 text-center text-sm'>
            没有匹配的候选处理人
          </div>
        ) : null}
      </div>
    </div>
  )
}

function getDefaultValues(
  queue?: AnnotationQueueRecord | null
): AnnotationQueueFormValues {
  return {
    name: queue?.name ?? '',
    description: queue?.description ?? '',
    scoreConfigIds: queue?.scoreConfigIds ?? [],
    assigneeIds: queue?.assigneeIds ?? [],
    assignmentStrategy: queue?.assignmentStrategy ?? 'average',
    assignmentWeights: queue?.assignmentWeights ?? {},
  }
}

function normalizeAnnotationQueueFormValues(
  values: AnnotationQueueFormValues
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
