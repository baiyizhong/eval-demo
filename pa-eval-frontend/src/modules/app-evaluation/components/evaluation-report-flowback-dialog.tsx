import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listProjectAutoEvaluationDatasets } from '../api/dataset-api'
import {
  createProjectEvaluationReportFlowback,
  previewProjectEvaluationReportFlowback,
  type EvaluationReportFlowbackPreview,
} from '../api/evaluation-report-api'
import type {
  EvaluationReportFlowbackInput,
  EvaluationReportFlowbackType,
  MockAutoEvaluationDataset,
} from '../types'

type EvaluationReportFlowbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  reportId: string
  flowbackType: EvaluationReportFlowbackType
  selectedItemIds: string[]
  defaultRange: EvaluationReportFlowbackInput['range']
  onCompleted: () => Promise<unknown>
}

export function EvaluationReportFlowbackDialog({
  open,
  onOpenChange,
  projectId,
  reportId,
  flowbackType,
  selectedItemIds,
  defaultRange,
  onCompleted,
}: EvaluationReportFlowbackDialogProps) {
  const $api = useAPI()
  const [datasets, setDatasets] = useState<MockAutoEvaluationDataset[]>([])
  const [range, setRange] =
    useState<EvaluationReportFlowbackInput['range']>(defaultRange)
  const [mode, setMode] = useState<'EXISTING' | 'CREATE'>('CREATE')
  const [datasetId, setDatasetId] = useState('')
  const [name, setName] = useState('')
  const [dedupeStrategy, setDedupeStrategy] =
    useState<EvaluationReportFlowbackInput['dedupeStrategy']>('SKIP_DUPLICATE')
  const [preview, setPreview] =
    useState<EvaluationReportFlowbackPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      void listProjectAutoEvaluationDatasets($api, projectId).then(setDatasets)
    }
  }, [$api, open, projectId])

  const input = useMemo<EvaluationReportFlowbackInput>(
    () => ({
      flowbackType,
      range,
      selectedItemIds,
      targetDataset:
        mode === 'EXISTING'
          ? { mode: 'EXISTING', datasetId }
          : { mode: 'CREATE', name, description: '来自评测报告的回流数据' },
      dedupeStrategy,
    }),
    [
      datasetId,
      dedupeStrategy,
      flowbackType,
      mode,
      name,
      range,
      selectedItemIds,
    ]
  )

  const handlePreview = async () => {
    if (mode === 'EXISTING' && !datasetId) {
      toast.error('请选择目标数据集')
      return
    }
    setPreviewing(true)
    try {
      const result = await previewProjectEvaluationReportFlowback(
        $api,
        projectId,
        reportId,
        input
      )
      setPreview(result)
      if (mode === 'CREATE' && name.trim() === '') {
        setName(result.defaultDatasetName)
      }
    } finally {
      setPreviewing(false)
    }
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const flowback = await createProjectEvaluationReportFlowback(
        $api,
        projectId,
        reportId,
        input
      )
      toast.success(`已回流 ${flowback.successCount} 条数据`)
      await onCompleted()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>回流评测数据</DialogTitle>
          <DialogDescription>
            将报告中的 Badcase 或评测数据回流到数据集。
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 md:grid-cols-2'>
          <Field label='回流范围'>
            <Select
              value={range}
              onValueChange={(value) => {
                setPreview(null)
                setRange(value as EvaluationReportFlowbackInput['range'])
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='ALL'>全部</SelectItem>
                  <SelectItem value='CURRENT_FILTER'>当前筛选</SelectItem>
                  <SelectItem value='BADCASE_ONLY'>仅 Badcase</SelectItem>
                  <SelectItem value='SELECTED'>已选择</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field label='目标数据集'>
            <Select
              value={mode}
              onValueChange={(value) => {
                setPreview(null)
                setMode(value as 'EXISTING' | 'CREATE')
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='CREATE'>新建数据集</SelectItem>
                  <SelectItem value='EXISTING'>已有数据集</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {mode === 'EXISTING' ? (
            <Field label='已有数据集'>
              <Select
                value={datasetId}
                onValueChange={(value) => {
                  setPreview(null)
                  setDatasetId(value)
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='选择数据集' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label='新数据集名称'>
              <Input
                value={name}
                onChange={(event) => {
                  setPreview(null)
                  setName(event.target.value)
                }}
              />
            </Field>
          )}
          <Field label='去重策略'>
            <Select
              value={dedupeStrategy}
              onValueChange={(value) => {
                setPreview(null)
                setDedupeStrategy(
                  value as EvaluationReportFlowbackInput['dedupeStrategy']
                )
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='SKIP_DUPLICATE'>跳过重复</SelectItem>
                  <SelectItem value='CREATE_VERSION'>创建版本</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {preview ? (
          <div className='bg-card rounded-lg border p-3 text-sm'>
            匹配 {preview.matchedCount} 条，重复 {preview.duplicateCount}{' '}
            条，将回流 {preview.willCreateCount} 条。
          </div>
        ) : null}
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type='button'
            variant='outline'
            disabled={previewing || submitting}
            onClick={() => void handlePreview()}
          >
            {previewing ? '预览中...' : '预览'}
          </Button>
          <Button
            type='button'
            disabled={
              submitting ||
              !preview ||
              preview.willCreateCount <= 0 ||
              (mode === 'EXISTING' && !datasetId)
            }
            onClick={() => void handleConfirm()}
          >
            {submitting ? '回流中...' : '确认回流'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className='flex flex-col gap-2'>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
