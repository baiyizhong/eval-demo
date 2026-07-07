import type { Row } from '@tanstack/react-table'
import { Download, MoreHorizontal, Pencil, Trash, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DatasetRecord } from '../types'

type DatasetRowActionsProps = {
  row: Row<DatasetRecord>
  onEdit?: (dataset: DatasetRecord) => void
  onImport?: (dataset: DatasetRecord) => void
  onExport?: (dataset: DatasetRecord) => void
  onDelete?: (dataset: DatasetRecord) => void
}

export function DatasetRowActions({
  row,
  onEdit,
  onImport,
  onExport,
  onDelete,
}: DatasetRowActionsProps) {
  const dataset = row.original

  return (
    <div className='flex justify-end'>
      <div className='hidden items-center justify-end gap-2 xl:flex'>
        {onEdit ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onEdit(dataset)}
          >
            <Pencil data-icon='inline-start' />
            编辑
          </Button>
        ) : null}
        {onImport ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onImport(dataset)}
          >
            <Upload data-icon='inline-start' />
            导入
          </Button>
        ) : null}
        {onExport ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onExport(dataset)}
          >
            <Download data-icon='inline-start' />
            导出
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onDelete(dataset)}
          >
            <Trash data-icon='inline-start' />
            删除
          </Button>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            aria-label='打开数据集操作菜单'
            className='xl:hidden'
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuGroup>
            {onEdit ? (
              <DropdownMenuItem onSelect={() => onEdit(dataset)}>
                <Pencil />
                编辑
              </DropdownMenuItem>
            ) : null}
            {onImport ? (
              <DropdownMenuItem onSelect={() => onImport(dataset)}>
                <Upload />
                导入
              </DropdownMenuItem>
            ) : null}
            {onExport ? (
              <DropdownMenuItem onSelect={() => onExport(dataset)}>
                <Download />
                导出
              </DropdownMenuItem>
            ) : null}
            {onDelete ? (
              <DropdownMenuItem
                variant='destructive'
                onSelect={() => onDelete(dataset)}
              >
                <Trash />
                删除
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
