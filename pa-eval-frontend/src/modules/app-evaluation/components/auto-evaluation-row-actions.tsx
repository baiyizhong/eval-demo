import type { Row } from '@tanstack/react-table'
import { Eye, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AutoEvaluationTaskRecord } from '../types'

type AutoEvaluationRowActionsProps = {
  row: Row<AutoEvaluationTaskRecord>
  projectId: string
  onRerun: (task: AutoEvaluationTaskRecord) => void
  onDelete: (task: AutoEvaluationTaskRecord) => void
}

export function AutoEvaluationRowActions({
  row,
  projectId,
  onRerun,
  onDelete,
}: AutoEvaluationRowActionsProps) {
  const task = row.original

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='打开自动评测任务操作菜单'>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to={`/projects/${projectId}/evaluation/auto-evaluations/${task.id}`}>
              <Eye data-icon='inline-start' />
              查看详情
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRerun(task)}>
            <Play data-icon='inline-start' />
            重新运行
          </DropdownMenuItem>
          <DropdownMenuItem
            variant='destructive'
            onSelect={() => onDelete(task)}
          >
            <Trash2 data-icon='inline-start' />
            删除任务
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
