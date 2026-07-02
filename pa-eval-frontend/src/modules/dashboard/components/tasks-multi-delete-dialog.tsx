'use client'

import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { sleep } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

type TaskMultiDeleteDialogProps<TData> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: Table<TData>
}

const CONFIRM_WORD = '删除'

export function TasksMultiDeleteDialog<TData>({
  open,
  onOpenChange,
  table,
}: TaskMultiDeleteDialogProps<TData>) {
  const [value, setValue] = useState('')

  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleDelete = () => {
    if (value.trim() !== CONFIRM_WORD) {
      toast.error(`请输入“${CONFIRM_WORD}”以确认。`)
      return
    }

    onOpenChange(false)

    toast.promise(sleep(2000), {
      loading: '正在删除任务...',
      success: () => {
        table.resetRowSelection()
        return `已删除 ${selectedRows.length} 个任务`
      },
      error: '操作失败',
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleDelete}
      disabled={value.trim() !== CONFIRM_WORD}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='stroke-destructive me-1 inline-block'
            size={18}
          />{' '}
          删除 {selectedRows.length} 个任务
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            确定要删除选中的任务吗？
          </p>

          <Label className='my-4 flex flex-col items-start gap-1.5'>
            <span className=''>输入“{CONFIRM_WORD}”以确认：</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder=""
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>警告！</AlertTitle>
            <AlertDescription>请谨慎操作，删除后无法恢复。</AlertDescription>
          </Alert>
        </div>
      }
      confirmText='删除'
      destructive
    />
  )
}
