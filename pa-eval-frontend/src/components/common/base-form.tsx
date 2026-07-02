import * as React from 'react'
import type { z } from 'zod'
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type SubmitHandler,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'
import { Form } from '@/components/ui/form'

type BaseFormProps<TFieldValues extends FieldValues> = Omit<
  React.ComponentProps<'form'>,
  'children' | 'onSubmit'
> & {
  schema: z.ZodType<TFieldValues, TFieldValues>
  defaultValues?: DefaultValues<TFieldValues>
  formOptions?: Omit<UseFormProps<TFieldValues>, 'defaultValues' | 'resolver'>
  onSubmit: SubmitHandler<TFieldValues>
  children:
    React.ReactNode | ((form: UseFormReturn<TFieldValues>) => React.ReactNode)
}

function BaseForm<TFieldValues extends FieldValues>({
  schema,
  defaultValues,
  formOptions,
  onSubmit,
  children,
  className,
  ...props
}: BaseFormProps<TFieldValues>) {
  const form = useForm<TFieldValues>({
    ...formOptions,
    defaultValues,
    resolver: zodResolver(schema) as Resolver<TFieldValues>,
  })

  return (
    <Form {...form}>
      <form
        className={cn(
          'flex flex-1 flex-col gap-6 overflow-y-auto p-4',
          className
        )}
        onSubmit={form.handleSubmit(onSubmit)}
        {...props}
      >
        {typeof children === 'function' ? children(form) : children}
      </form>
    </Form>
  )
}

export { BaseForm }
export type { BaseFormProps }
