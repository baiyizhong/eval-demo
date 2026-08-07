import { useMemo, useState } from 'react'
import { DatabaseIcon } from 'lucide-react'
import { FormDialog } from '@/components/common/form-dialog'
import { TreeSelect } from '@/components/common/tree-select'
import { buildDatasetTreeNodes } from '../lib/dataset-tree'
import type {
  DatasetDirectoryRecord,
  DatasetItemOperationType,
  DatasetRecord,
} from '../types'

type DatasetTargetDialogProps = {
  open: boolean
  mode: Extract<DatasetItemOperationType, 'copy' | 'move'>
  selectedCount: number
  currentDatasetId: string
  directories: DatasetDirectoryRecord[]
  datasets: DatasetRecord[]
  isSubmitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (targetDatasetId: string) => Promise<void> | void
}

const dialogCopy = {
  copy: {
    title: '复制数据项',
    verb: '复制',
    submitting: '正在复制...',
    desc: '选择目标数据集后，已选数据项会被复制过去。',
  },
  move: {
    title: '移动数据项',
    verb: '移动',
    submitting: '正在移动...',
    desc: '选择目标数据集后，已选数据项会从当前数据集移动过去。',
  },
} satisfies Record<
  Extract<DatasetItemOperationType, 'copy' | 'move'>,
  {
    title: string
    verb: string
    submitting: string
    desc: string
  }
>

export function DatasetTargetDialog({
  open,
  mode,
  selectedCount,
  currentDatasetId,
  directories,
  datasets,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: DatasetTargetDialogProps) {
  const [targetDatasetId, setTargetDatasetId] = useState<string | null>(null)
  const copy = dialogCopy[mode]
  const nodes = useMemo(
    () =>
      buildDatasetTreeNodes({ directories, datasets }).map((node) => ({
        ...node,
        kind: node.kind === 'dataset' ? ('item' as const) : ('folder' as const),
        disabled: node.datasetId === currentDatasetId,
      })),
    [currentDatasetId, datasets, directories]
  )

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setTargetDatasetId(null)
    onOpenChange(nextOpen)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={`${copy.desc} 当前已选择 ${selectedCount} 条数据项。`}
      width={520}
      confirmText={isSubmitting ? copy.submitting : copy.verb}
      confirmProps={{
        disabled: isSubmitting || !targetDatasetId,
      }}
      cancelProps={{ disabled: isSubmitting }}
      onConfirm={() => {
        if (!targetDatasetId) return
        void onSubmit(targetDatasetId)
      }}
    >
      <TreeSelect
        nodes={nodes}
        value={targetDatasetId}
        selectableKinds={['item']}
        placeholder='选择目标数据集'
        searchPlaceholder='搜索数据集或目录'
        emptyText='暂无可选数据集'
        disabled={isSubmitting}
        renderIcon={(node) =>
          node.kind === 'item' ? (
            <DatabaseIcon className='text-muted-foreground size-4 shrink-0' />
          ) : undefined
        }
        onValueChange={(node) => setTargetDatasetId(node.id)}
      />
    </FormDialog>
  )
}
