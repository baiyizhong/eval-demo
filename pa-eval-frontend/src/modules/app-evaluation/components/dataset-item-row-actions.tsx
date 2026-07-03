import type { Row } from '@tanstack/react-table'
import { Archive, MoreHorizontal, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DatasetItemRecord } from '../types'

type DatasetItemRowActionsProps = {
  row: Row<DatasetItemRecord>
  onEdit: (item: DatasetItemRecord) => void
  onArchive: (item: DatasetItemRecord) => void
}

export function DatasetItemRowActions({
  row,
  onEdit,
  onArchive,
}: DatasetItemRowActionsProps) {
  const item = row.original

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='打开数据项操作菜单'>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onEdit(item)}>
            <Pencil />
            查看/编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={item.status === 'ARCHIVED'}
            onSelect={() => onArchive(item)}
          >
            <Archive />
            归档
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
