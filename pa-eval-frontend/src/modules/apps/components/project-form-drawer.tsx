import { useId } from 'react'
import { z } from 'zod'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import type { ProjectPayload } from '../api/project-api'

const projectFormSchema = z.object({
  name: z.string().trim().min(1, '请输入项目名称'),
  description: z.string().trim().optional(),
})

type ProjectFormValues = z.infer<typeof projectFormSchema>

type ProjectFormDrawerProps = {
  open: boolean
  mode: 'create' | 'edit'
  initialValues?: ProjectPayload
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ProjectPayload) => void | Promise<void>
}

export function ProjectFormDrawer({
  open,
  mode,
  initialValues,
  submitting = false,
  onOpenChange,
  onSubmit,
}: ProjectFormDrawerProps) {
  const formId = useId()
  const title = mode === 'create' ? '新增项目' : '编辑项目'

  const handleSubmit = async (values: ProjectFormValues) => {
    await onSubmit({
      name: values.name.trim(),
      description: values.description?.trim() ?? '',
    })
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      confirmText={mode === 'create' ? '创建' : '保存'}
      confirmProps={{
        form: formId,
        type: 'submit',
        disabled: submitting,
      }}
      cancelProps={{ disabled: submitting }}
    >
      <BaseForm
        key={`${mode}-${initialValues?.name ?? 'new'}`}
        id={formId}
        schema={projectFormSchema}
        defaultValues={{
          name: initialValues?.name ?? '',
          description: initialValues?.description ?? '',
        }}
        onSubmit={handleSubmit}
        className='gap-4 overflow-visible'
      >
        {(form) => (
          <>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>项目名称</FormLabel>
                  <FormControl>
                    <Input placeholder='输入项目名称' {...field} />
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
                  <FormLabel>项目描述</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='输入项目描述'
                      className='min-h-28 resize-none'
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
    </Drawer>
  )
}
