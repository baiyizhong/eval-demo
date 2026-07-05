import type { Row } from '@tanstack/react-table'
import { Download, Eye, MoreHorizontal, RefreshCw, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { EvaluationReportRecord } from '../types'

type Props = {
  row: Row<EvaluationReportRecord>
  projectId: string
  onExport: (report: EvaluationReportRecord) => void
  onRegenerate: (report: EvaluationReportRecord) => void
  onFlowback: (report: EvaluationReportRecord) => void
  onViewUnavailable: (report: EvaluationReportRecord) => void
  onDelete: (report: EvaluationReportRecord) => void
}

export function EvaluationReportRowActions({
  row,
  projectId,
  onExport,
  onRegenerate,
  onFlowback,
  onViewUnavailable,
  onDelete,
}: Props) {
  const report = row.original
  const ready = report.status === 'READY'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='打开评测报告操作菜单'>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          {ready ? (
            <DropdownMenuItem asChild>
              <Link to={`/projects/${projectId}/evaluation/reports/${report.id}`}>
                <Eye data-icon='inline-start' />
                查看报告
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onViewUnavailable(report)}>
              <RefreshCw data-icon='inline-start' />
              查看报告
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={!ready} onSelect={() => onExport(report)}>
            <Download data-icon='inline-start' />
            导出
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRegenerate(report)}>
            <RotateCcw data-icon='inline-start' />
            重新生成
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!ready} onSelect={() => onFlowback(report)}>
            <Send data-icon='inline-start' />
            回流数据
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onSelect={() => onDelete(report)}>
            <Trash2 data-icon='inline-start' />
            删除
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
