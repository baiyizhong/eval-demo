import type { Row } from '@tanstack/react-table'
import { Download, MoreHorizontal, Pencil, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DatasetExportFormat, DatasetRecord } from '../types'

type DatasetRowActionsProps = {
  row: Row<DatasetRecord>
  onEdit?: (dataset: DatasetRecord) => void
  onImport?: (dataset: DatasetRecord) => void
  onExport?: (dataset: DatasetRecord, format: DatasetExportFormat) => void
  onDelete?: (dataset: DatasetRecord) => void
  exporting?: boolean
}

export function DatasetRowActions({
  row,
  onEdit,
  onImport,
  onExport,
  onDelete,
  exporting,
}: DatasetRowActionsProps) {
  const dataset = row.original
  const hasMoreActions = Boolean(onImport || onExport || onDelete)

  return (
    <div className='flex justify-end gap-1'>
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
      {hasMoreActions ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' aria-label='打开数据集操作菜单'>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuGroup>
              {onImport ? (
                <DropdownMenuItem onSelect={() => onImport(dataset)}>
                  <Upload />
                  导入数据集
                </DropdownMenuItem>
              ) : null}
              {onExport ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className='gap-2 [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4'>
                    <Download />
                    导出数据集
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {exportFormatOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        disabled={exporting}
                        onSelect={() => onExport(dataset, option.value)}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem
                  variant='destructive'
                  onSelect={() => onDelete(dataset)}
                >
                  <Trash2 />
                  删除数据集
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

const exportFormatOptions: {
  value: DatasetExportFormat
  label: string
}[] = [
  { value: 'xlsx', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
  { value: 'txt', label: 'TXT' },
]
