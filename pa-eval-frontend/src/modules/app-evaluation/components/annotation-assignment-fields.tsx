import type { UseFormReturn } from 'react-hook-form'
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
import type { AnnotationAssignmentStrategy, ProjectUserRecord } from '../types'

export type AnnotationAssignmentFormValues = {
  assigneeIds: string[]
  assignmentStrategy: AnnotationAssignmentStrategy
  assignmentWeights: Record<string, number>
}

const assignmentStrategyOptions: {
  value: AnnotationAssignmentStrategy
  label: string
}[] = [
  { value: 'average', label: '平均分配' },
  { value: 'random', label: '随机分配' },
  { value: 'weighted', label: '按权重分配' },
]

export function AnnotationAssignmentFields({
  form,
  users,
}: {
  form: UseFormReturn<AnnotationAssignmentFormValues>
  users: ProjectUserRecord[]
}) {
  const selectedAssigneeIds = form.watch('assigneeIds')
  const assignmentStrategy = form.watch('assignmentStrategy')
  const selectedUsers = users.filter((user) =>
    selectedAssigneeIds.includes(user.id)
  )

  if (selectedAssigneeIds.length <= 1) {
    return null
  }

  return (
    <>
      <FormField
        control={form.control}
        name='assignmentStrategy'
        render={({ field }) => (
          <FormItem>
            <FormLabel>任务分配策略</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='选择分配策略' />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectGroup>
                  {assignmentStrategyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FormDescription>
              后续新加入的待标注数据也会继续使用该策略。
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {assignmentStrategy === 'weighted' ? (
        <FormItem>
          <FormLabel>候选处理人权重</FormLabel>
          <div className='grid gap-2 sm:grid-cols-2'>
            {selectedUsers.map((user) => (
              <FormField
                key={user.id}
                control={form.control}
                name={`assignmentWeights.${user.id}`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-muted-foreground text-xs font-normal'>
                      {user.name || user.email}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        step={1}
                        value={field.value ?? 1}
                        onChange={(event) => {
                          field.onChange(Number(event.target.value) || 1)
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            ))}
          </div>
          <FormDescription>权重越高，分配到的待标注数据越多。</FormDescription>
        </FormItem>
      ) : null}
    </>
  )
}
