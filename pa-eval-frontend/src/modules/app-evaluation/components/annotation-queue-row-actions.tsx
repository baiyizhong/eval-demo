import type { Row } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AnnotationQueueRecord } from '../types'

type AnnotationQueueRowActionsProps = {
  row: Row<AnnotationQueueRecord>
  onEdit: (queue: AnnotationQueueRecord) => void
  onDelete: (queue: AnnotationQueueRecord) => void
}

export function AnnotationQueueRowActions({
  row,
  onEdit,
  onDelete,
}: AnnotationQueueRowActionsProps) {
  const queue = row.original

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          aria-label='打开人工标注任务操作菜单'
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onEdit(queue)}>
            <Pencil data-icon='inline-start' />
            编辑任务
          </DropdownMenuItem>
          <DropdownMenuItem
            variant='destructive'
            onSelect={() => onDelete(queue)}
          >
            <Trash2 data-icon='inline-start' />
            删除任务
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
