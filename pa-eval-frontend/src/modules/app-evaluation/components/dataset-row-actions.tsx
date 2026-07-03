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
  onEdit: (dataset: DatasetRecord) => void
  onImport: (dataset: DatasetRecord) => void
  onExport: (dataset: DatasetRecord) => void
  onDelete: (dataset: DatasetRecord) => void
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='打开数据集操作菜单'>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onEdit(dataset)}>
            <Pencil />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onImport(dataset)}>
            <Upload />
            导入
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport(dataset)}>
            <Download />
            导出
          </DropdownMenuItem>
          <DropdownMenuItem
            variant='destructive'
            onSelect={() => onDelete(dataset)}
          >
            <Trash />
            删除
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
