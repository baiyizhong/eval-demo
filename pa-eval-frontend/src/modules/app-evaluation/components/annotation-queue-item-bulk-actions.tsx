import type { Table } from '@tanstack/react-table'
import { useState } from 'react'
import { Download, Info, Trash2, UserPen } from 'lucide-react'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DataTableBulkActions,
  type DataTableSelectionState,
} from '@/components/common/data-table'
import {
  buildAnnotationBatchFilters,
  deleteProjectAnnotationQueueItems,
  listProjectAnnotationQueueItems,
  updateProjectAnnotationQueueItemAssignees,
} from '../api/annotation-api'
import { resolveAnnotationQueueSelectedItems } from '../lib/annotation-queue-selection'
import type {
  AnnotationBatchFiltersInput,
  AnnotationQueueItemRecord,
  ProjectUserRecord,
} from '../types'

export type AnnotationQueueItemExportSelection =
  | {
      scope: 'selected'
      filters: AnnotationBatchFiltersInput
      itemIds: string[]
    }
  | {
      scope: 'filtered'
      filters: AnnotationBatchFiltersInput
    }

type AnnotationQueueItemBulkActionsProps = {
  table: Table<AnnotationQueueItemRecord>
  selection: DataTableSelectionState<AnnotationQueueItemRecord>
  api: Parameters<typeof deleteProjectAnnotationQueueItems>[0]
  projectId: string
  queueId: string
  users: ProjectUserRecord[]
  canEdit?: boolean
  onChanged: () => Promise<unknown>
  onExportSelected?: (selection: AnnotationQueueItemExportSelection) => void
}

export function AnnotationQueueItemBulkActions({
  table,
  selection,
  api,
  projectId,
  queueId,
  users,
  canEdit,
  onChanged,
  onExportSelected,
}: AnnotationQueueItemBulkActionsProps) {
  const [assigneeDialogOpen, setAssigneeDialogOpen] = useState(false)
  const [assigneeUserId, setAssigneeUserId] = useState('')
  const [assigneeItems, setAssigneeItems] = useState<
    AnnotationQueueItemRecord[]
  >([])
  const [isResolvingSelection, setIsResolvingSelection] = useState(false)
  const [isUpdatingAssignee, setIsUpdatingAssignee] = useState(false)
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedItems = selectedRows.map((row) => row.original)
  const selectedCount = selection.selectedRowCount
  const assignableUsers = users.filter((user) => user.status !== 'pending')
  const completedCount = assigneeItems.filter(
    (item) => item.status === 'COMPLETED'
  ).length
  const pendingCount = assigneeItems.length - completedCount
  const canUpdateAssignee = Boolean(canEdit && assignableUsers.length)

  const resolveSelectedItems = () =>
    resolveAnnotationQueueSelectedItems({
      selectedItems,
      selection,
      fetchPage: (query) =>
        listProjectAnnotationQueueItems(api, projectId, queueId, query),
    })

  const handleExport = () => {
    if (selection.isAllMatchingRowsSelected) {
      onExportSelected?.({
        scope: 'filtered',
        filters: buildAnnotationBatchFilters(selection.queryState),
      })
      return
    }

    const itemIds = selectedItems.map((item) => item.id)
    onExportSelected?.({
      scope: 'selected',
      filters: { itemIds },
      itemIds,
    })
  }

  const handleDelete = async () => {
    if (!canEdit) return

    const confirmed = await confirm({
      title: '删除选中标注数据',
      desc: `将仅移除 ${selectedCount} 条队列数据，不删除源对象、历史评分或数据集项。确定继续吗？`,
      confirmText: '删除',
      destructive: true,
    })

    if (!confirmed) return

    setIsResolvingSelection(true)
    try {
      const items = await resolveSelectedItems()
      const itemIds = items.map((item) => item.id)
      await deleteProjectAnnotationQueueItems(api, projectId, queueId, itemIds)
      await onChanged()
      selection.clearSelection()
      toast.success(`已删除 ${itemIds.length} 条标注数据`)
    } finally {
      setIsResolvingSelection(false)
    }
  }

  const handleOpenAssigneeDialog = async () => {
    setIsResolvingSelection(true)
    try {
      const items = await resolveSelectedItems()
      setAssigneeItems(items)
      setAssigneeUserId(assignableUsers[0]?.id ?? '')
      setAssigneeDialogOpen(true)
    } finally {
      setIsResolvingSelection(false)
    }
  }

  const handleUpdateAssignee = async () => {
    if (!canUpdateAssignee || !assigneeUserId || !pendingCount) return

    setIsUpdatingAssignee(true)
    try {
      const itemIds = assigneeItems.map((item) => item.id)
      const result = await updateProjectAnnotationQueueItemAssignees(
        api,
        projectId,
        queueId,
        itemIds,
        assigneeUserId
      )
      await onChanged()
      selection.clearSelection()
      setAssigneeDialogOpen(false)
      setAssigneeItems([])
      if (result.updatedCount > 0) {
        toast.success(
          `已修改 ${result.updatedCount} 条处理人，跳过 ${result.skippedCount} 条已完成数据`
        )
      } else {
        toast.info(`未修改处理人，已跳过 ${result.skippedCount} 条已完成数据`)
      }
    } finally {
      setIsUpdatingAssignee(false)
    }
  }

  return (
    <>
      <DataTableBulkActions
        table={table}
        selection={selection}
        entityName='标注数据'
      >
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={isResolvingSelection}
          onClick={() => {
            handleExport()
          }}
        >
          <Download data-icon='inline-start' />
          导出选中
        </Button>
        {canEdit ? (
          <>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={!canUpdateAssignee || isResolvingSelection}
              onClick={() => {
                void handleOpenAssigneeDialog()
              }}
            >
              <UserPen data-icon='inline-start' />
              修改处理人
            </Button>
            <Button
              type='button'
              size='sm'
              variant='destructive'
              disabled={isResolvingSelection}
              onClick={() => {
                void handleDelete()
              }}
            >
              <Trash2 data-icon='inline-start' />
              删除选中
            </Button>
          </>
        ) : null}
      </DataTableBulkActions>

      <Dialog
        open={assigneeDialogOpen}
        onOpenChange={(open) => {
          setAssigneeDialogOpen(open)
          if (!open) setAssigneeItems([])
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改处理人</DialogTitle>
            <DialogDescription>
              为已选中的标注数据分配新的处理人
            </DialogDescription>
          </DialogHeader>

          <div className='flex flex-col gap-4'>
            <Alert>
              <Info />
              <AlertTitle>修改规则</AlertTitle>
              <AlertDescription>
                已完成的数据会自动跳过，只修改待处理数据；该操作不按任务分配策略重新分配。
              </AlertDescription>
            </Alert>

            <div className='text-muted-foreground text-sm'>
              已选 {assigneeItems.length} 条，其中 {pendingCount} 条待处理、
              {completedCount} 条已完成。
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='annotation-item-assignee'>预设处理人</Label>
              <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                <SelectTrigger id='annotation-item-assignee' className='w-full'>
                  <SelectValue placeholder='选择预设处理人' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {assignableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {formatUserLabel(user)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setAssigneeDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type='button'
              disabled={
                isUpdatingAssignee ||
                !assigneeUserId ||
                !pendingCount ||
                !canUpdateAssignee
              }
              onClick={() => {
                void handleUpdateAssignee()
              }}
            >
              {isUpdatingAssignee ? '提交中...' : '提交'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function formatUserLabel(user: ProjectUserRecord) {
  const label = user.name || user.email || user.id
  return user.status === 'pending' ? `${label}（待接受）` : label
}
