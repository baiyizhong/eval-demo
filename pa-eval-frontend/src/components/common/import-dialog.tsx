import React from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const DEFAULT_FILE_TYPES = ['text/csv']

type ImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  fileTypes?: string[]
  onImport?: (file: File) => void
}

function isAllowedFileType(file: File, fileTypes: string[]) {
  return fileTypes.some((fileType) => {
    const normalizedFileType = fileType.toLowerCase()

    if (normalizedFileType.startsWith('.')) {
      return file.name.toLowerCase().endsWith(normalizedFileType)
    }

    if (normalizedFileType.endsWith('/*')) {
      return file.type.toLowerCase().startsWith(normalizedFileType.slice(0, -1))
    }

    return file.type.toLowerCase() === normalizedFileType
  })
}

function formatFileTypes(fileTypes: string[]) {
  return fileTypes
    .map((fileType) => {
      if (fileType === 'text/csv') return 'CSV'

      return fileType
    })
    .join('、')
}

export function ImportDialog({
  open,
  onOpenChange,
  title = '导入文件',
  description = '从本地选择文件进行导入。',
  fileTypes = DEFAULT_FILE_TYPES,
  onImport,
}: ImportDialogProps) {
  const formSchema = React.useMemo(
    () =>
      z.object({
        file: z
          .instanceof(FileList)
          .refine((files) => files.length > 0, {
            message: '请上传文件',
          })
          .refine(
            (files) =>
              files.length > 0 && isAllowedFileType(files[0], fileTypes),
            {
              message: `请上传 ${formatFileTypes(fileTypes)} 格式的文件。`,
            }
          ),
      }),
    [fileTypes]
  )

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { file: undefined },
  })

  const fileRef = form.register('file')

  const onSubmit = () => {
    const file = form.getValues('file')

    if (file && file[0]) {
      onImport?.(file[0])
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        onOpenChange(val)
        form.reset()
      }}
    >
      <DialogContent className='gap-2 sm:max-w-sm'>
        <DialogHeader className='text-start'>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id='import-form' onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name='file'
              render={() => (
                <FormItem className='my-2'>
                  <FormLabel>文件</FormLabel>
                  <FormControl>
                    <Input
                      type='file'
                      accept={fileTypes.join(',')}
                      {...fileRef}
                      className='h-8 py-0'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter className='gap-2'>
          <DialogClose asChild>
            <Button variant='outline'>关闭</Button>
          </DialogClose>
          <Button type='submit' form='import-form'>
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
