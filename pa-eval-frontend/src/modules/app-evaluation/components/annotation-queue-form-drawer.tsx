import { toast } from 'sonner'
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
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import { mockAnnotationUsers, mockScoreConfigs } from '../data/mock-annotations'
import {
  scoreDataTypeLabels,
  type AnnotationQueueFormInput,
  type AnnotationQueueRecord,
} from '../types'

const annotationQueueFormSchema = z.object({
  name: z.string().min(1, '请输入任务名称'),
  description: z.string(),
  scoreConfigIds: z.array(z.string()).min(1, '请选择至少一个评分指标'),
  assigneeIds: z.array(z.string()),
})

type AnnotationQueueFormValues = z.infer<typeof annotationQueueFormSchema>

type AnnotationQueueFormDrawerProps = {
  open: boolean
  queue?: AnnotationQueueRecord | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AnnotationQueueFormInput) => Promise<void> | void
}

export function AnnotationQueueFormDrawer({
  open,
  queue,
  onOpenChange,
  onSubmit,
}: AnnotationQueueFormDrawerProps) {
  const formId = queue
    ? 'edit-annotation-queue-form'
    : 'create-annotation-queue-form'

  const handleSubmit = async (values: AnnotationQueueFormValues) => {
    try {
      await onSubmit(values)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存人工评测任务失败')
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={queue ? '编辑人工评测任务' : '新建人工评测任务'}
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
                    <Input placeholder='例如：客服会话质量人工评测' {...field} />
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
                    {mockScoreConfigs.map((config) => (
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
                                    : field.value.filter((id) => id !== config.id)
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
                    {mockAnnotationUsers.map((user) => (
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
                                    : field.value.filter((id) => id !== user.id)
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
                  </div>
                </FormItem>
              )}
            />
          </>
        )}
      </BaseForm>
    </Drawer>
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
  }
}
