import type { MemberImportFailureItem } from '@/modules/organization-management/data/member-import'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const FIELD_LABELS: Record<MemberImportFailureItem['field'], string> = {
  email: '邮箱',
  role: '角色',
  row: '行数据',
}

export type MemberImportResultSummary = {
  successCount: number
  failures: MemberImportFailureItem[]
}

type MemberImportResultDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: MemberImportResultSummary | null
}

export function MemberImportResultDialog({
  open,
  onOpenChange,
  result,
}: MemberImportResultDialogProps) {
  const failures = result?.failures ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-4xl'>
        <DialogHeader className='text-start'>
          <DialogTitle>成员导入结果</DialogTitle>
          <DialogDescription>
            成功导入 {result?.successCount ?? 0} 条，失败 {failures.length} 条。
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-wrap gap-2'>
          <Badge variant='secondary'>成功 {result?.successCount ?? 0}</Badge>
          <Badge variant={failures.length > 0 ? 'destructive' : 'outline'}>
            失败 {failures.length}
          </Badge>
        </div>

        {failures.length > 0 ? (
          <div className='max-h-[420px] overflow-auto rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-16'>行号</TableHead>
                  <TableHead className='w-20'>字段</TableHead>
                  <TableHead className='w-56'>邮箱</TableHead>
                  <TableHead className='min-w-56'>原因</TableHead>
                  <TableHead className='min-w-72'>行数据</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((failure) => (
                  <TableRow
                    key={`${failure.row}-${failure.email}-${failure.reason}`}
                  >
                    <TableCell>{failure.row}</TableCell>
                    <TableCell>{FIELD_LABELS[failure.field]}</TableCell>
                    <TableCell>{failure.email || '-'}</TableCell>
                    <TableCell>{failure.reason}</TableCell>
                    <TableCell className='text-muted-foreground max-w-72 break-all whitespace-normal'>
                      {failure.rawData || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className='bg-muted/20 text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm'>
            本次导入没有失败项。
          </div>
        )}

        <DialogFooter>
          <Button type='button' onClick={() => onOpenChange(false)}>
            知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
