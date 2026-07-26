import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileArchive } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import {
  createProjectAnnotationExportJob,
  downloadProjectAnnotationExportJob,
  pollAnnotationExportJob,
  previewProjectAnnotationExport,
  type AnnotationExportJobInput,
  type AnnotationExportPreviewInput,
} from '../api/annotation-api'
import {
  scoreDataTypeLabels,
  type AnnotationBatchFiltersInput,
  type AnnotationExportFormat,
  type AnnotationExportPreview,
  type AnnotationExportScope,
  type ScoreConfigRecord,
} from '../types'
import { downloadBlob } from './format'

type NonEmptyStringArray = [string, ...string[]]

type AnnotationExportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  api: Parameters<typeof previewProjectAnnotationExport>[0]
  projectId: string
  queueId: string
  scope: AnnotationExportScope
  filters: AnnotationBatchFiltersInput
  itemIds?: string[]
}

const exportFormatOptions: {
  value: AnnotationExportFormat
  label: string
  description: string
}[] = [
  { value: 'xlsx', label: 'Excel', description: '三 Sheet 结构化文件' },
  { value: 'csv', label: 'CSV', description: '适合表格工具导入' },
  { value: 'txt', label: 'TXT', description: 'JSON Lines 明细' },
]

const basePreviewColumns = [
  'id',
  'status',
  'assigneeName',
  'completedByName',
  'traceId',
  'observationId',
  'sessionId',
  'userId',
  'input',
  'output',
  'metadata',
]

const invalidFileNameCharsRegex = new RegExp(
  String.raw`[\u0000-\u001F\u007F\\/:*?"<>|]+`,
  'gu'
)

export function AnnotationExportDialog({
  open,
  onOpenChange,
  api,
  projectId,
  queueId,
  scope,
  filters,
  itemIds,
}: AnnotationExportDialogProps) {
  const [format, setFormat] = useState<AnnotationExportFormat>('xlsx')
  const [splitMetadata, setSplitMetadata] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [customFileName, setCustomFileName] = useState<string | null>(null)
  const selectedItemIds = useMemo(
    () => Array.from(new Set((itemIds ?? []).filter(Boolean))),
    [itemIds]
  )
  const previewInput = useMemo(
    () =>
      buildAnnotationExportInput({
        scope,
        filters,
        itemIds: selectedItemIds,
        previewLimit: 5,
      }),
    [filters, scope, selectedItemIds]
  )

  const previewQuery = useQuery({
    queryKey: [
      'project-annotation-export-preview',
      api,
      projectId,
      queueId,
      scope,
      filters,
      selectedItemIds,
      previewInput,
    ],
    queryFn: () => {
      if (!previewInput) {
        throw new Error('请选择需要导出的标注数据')
      }
      return previewProjectAnnotationExport(api, projectId, queueId, previewInput)
    },
    enabled: open && Boolean(queueId) && Boolean(previewInput),
  })

  const preview = useMemo(
    () => deriveAnnotationExportPreview(previewQuery.data, splitMetadata),
    [previewQuery.data, splitMetadata]
  )
  const previewColumns = useMemo(() => buildPreviewColumns(preview), [preview])
  const defaultFileName = useMemo(
    () => (preview ? buildDefaultExportFileName(preview) : ''),
    [preview]
  )
  const fileName = customFileName ?? defaultFileName

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (isExporting && !nextOpen) return
    if (!nextOpen) {
      setCustomFileName(null)
    }
    onOpenChange(nextOpen)
  }

  const normalizedFileName = normalizeExportFileName(fileName)
  const hasInvalidCustomFileName = Boolean(
    customFileName?.trim() && !normalizedFileName
  )
  const exportDisabled =
    isExporting || !previewInput || hasInvalidCustomFileName

  const handleCreateExport = async () => {
    if (exportDisabled || !previewInput) return

    setIsExporting(true)
    try {
      const jobInput: AnnotationExportJobInput =
        previewInput.scope === 'selected'
          ? {
              scope: 'selected',
              format,
              filters,
              itemIds: previewInput.itemIds,
              splitMetadata,
              fileName: normalizedFileName,
            }
          : {
              scope: 'filtered',
              format,
              filters,
              itemIds: previewInput.itemIds,
              splitMetadata,
              fileName: normalizedFileName,
            }
      const job = await createProjectAnnotationExportJob(
        api,
        projectId,
        queueId,
        jobInput
      )
      toast.info('导出任务已创建，正在生成文件')
      const completedJob = await pollAnnotationExportJob(
        api,
        projectId,
        queueId,
        job.id
      )

      if (completedJob.status === 'FAILED') {
        throw new Error(completedJob.errorMessage || '标注数据导出失败')
      }

      const blob = await downloadProjectAnnotationExportJob(
        api,
        projectId,
        queueId,
        completedJob.id
      )
      downloadBlob(blob, completedJob.fileName || `${queueId}-${job.id}.zip`)
      toast.success('导出完成')
      handleDialogOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '标注数据导出失败')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
    >
      <DialogContent
        className='flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1120px]'
        showCloseButton={!isExporting}
      >
        <DialogHeader className='p-6 pb-4 text-start'>
          <DialogTitle className='flex min-w-0 items-center gap-2 text-start'>
            <FileArchive data-icon='inline-start' />
            导出标注数据
          </DialogTitle>
          <DialogDescription>
            {scope === 'selected'
              ? `导出当前选中的 ${selectedItemIds.length} 条标注数据。`
              : '导出当前筛选条件命中的全部标注数据。'}
          </DialogDescription>
        </DialogHeader>

        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4'>
          <section className='grid gap-3 md:grid-cols-2'>
            <div className='rounded-lg border p-4'>
              <SectionTitle title='基本信息' />
              {preview ? (
                <div className='mt-3 grid gap-3 md:grid-cols-2'>
                  <InfoItem label='任务名称' value={preview.queue.name} />
                  <InfoItem
                    label='导出范围'
                    value={scope === 'selected' ? '选中数据' : '当前筛选结果'}
                  />
                  <InfoItem
                    label='任务描述'
                    value={preview.queue.description || '暂无描述'}
                    className='md:col-span-2'
                  />
                  <div className='grid gap-2 md:col-span-2 md:grid-cols-3'>
                    <MetricItem label='总量' value={preview.metrics.total} />
                    <MetricItem label='已完成' value={preview.metrics.completed} />
                    <MetricItem label='待处理' value={preview.metrics.pending} />
                  </div>
                </div>
              ) : (
                <SummarySkeleton />
              )}
            </div>

            <div className='rounded-lg border p-4'>
              <SectionTitle title='导出配置' />
              <div className='mt-3 flex flex-col gap-4'>
                <div className='flex flex-col gap-2'>
                  <Label>导出文件类型</Label>
                  <ToggleGroup
                    type='single'
                    variant='outline'
                    value={format}
                    onValueChange={(value) => {
                      if (value) setFormat(value as AnnotationExportFormat)
                    }}
                    aria-label='导出文件类型'
                    className='w-fit'
                  >
                    {exportFormatOptions.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        aria-label={option.label}
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <div className='text-muted-foreground text-xs'>
                    {
                      exportFormatOptions.find((option) => option.value === format)
                        ?.description
                    }
                  </div>
                </div>

                <div className='flex flex-col gap-2'>
                  <Label htmlFor='annotation-export-file-name'>
                    导出文件名
                  </Label>
                  <Input
                    id='annotation-export-file-name'
                    value={fileName}
                    placeholder={defaultFileName || 'annotation-export.zip'}
                    onChange={(event) => {
                      setCustomFileName(event.target.value)
                    }}
                  />
                  <div className='text-muted-foreground truncate text-[11px]'>
                    默认按任务名称、导出时间和批量导出生成，可在创建任务前修改。
                  </div>
                </div>

                <div className='flex items-start justify-between gap-3 rounded-md border p-3'>
                  <div className='flex min-w-0 flex-col gap-1'>
                    <Label htmlFor='annotation-export-split-metadata'>
                      Metadata 拆分为单列
                    </Label>
                    <div className='text-muted-foreground text-xs'>
                      开启后按 metadata 顶层 key 自动拆列，嵌套值保留 JSON 字符串。
                    </div>
                  </div>
                  <Switch
                    id='annotation-export-split-metadata'
                    checked={splitMetadata}
                    onCheckedChange={setSplitMetadata}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className='rounded-lg border p-4'>
            <SectionTitle title='评分指标' />
            {preview ? (
              <ScoreConfigList scoreConfigs={preview.scoreConfigs} />
            ) : (
              <div className='mt-3 flex flex-col gap-2'>
                <Skeleton className='h-8 w-full' />
                <Skeleton className='h-8 w-3/4' />
              </div>
            )}
          </section>

          <section className='rounded-lg border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <SectionTitle title='数据明细' />
              <div className='text-muted-foreground text-xs'>
                预览前 5 条，实际导出按所选范围生成 zip 文件。
              </div>
            </div>

            {previewQuery.isError ? (
              <Alert variant='destructive' className='mt-3'>
                <AlertTitle>预览加载失败</AlertTitle>
                <AlertDescription>
                  {previewQuery.error instanceof Error
                    ? previewQuery.error.message
                    : '标注数据预览加载失败'}
                </AlertDescription>
              </Alert>
            ) : null}

            {preview ? (
              <PreviewTable
                columns={previewColumns}
                rows={preview.previewItems}
                scoreConfigs={preview.scoreConfigs}
              />
            ) : previewQuery.isLoading ? (
              <div className='mt-3 flex flex-col gap-2'>
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
              </div>
            ) : (
              <div className='text-muted-foreground mt-3 rounded-md border p-4 text-sm'>
                暂无可预览数据
              </div>
            )}
          </section>
        </div>

        <DialogFooter className='border-t p-4 sm:justify-end'>
          <Button
            type='button'
            variant='outline'
            disabled={isExporting}
            onClick={() => handleDialogOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type='button'
            disabled={exportDisabled}
            onClick={() => {
              void handleCreateExport()
            }}
          >
            {isExporting ? '导出中...' : '创建导出任务'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildAnnotationExportInput({
  scope,
  filters,
  itemIds,
  previewLimit,
}: {
  scope: AnnotationExportScope
  filters: AnnotationBatchFiltersInput
  itemIds: string[]
  previewLimit: number
}): AnnotationExportPreviewInput | null {
  if (scope === 'selected') {
    if (itemIds.length === 0) return null
    return {
      scope: 'selected',
      format: 'xlsx',
      filters,
      itemIds: itemIds as NonEmptyStringArray,
      previewLimit,
      splitMetadata: false,
    }
  }

  return {
    scope: 'filtered',
    format: 'xlsx',
    filters,
    itemIds,
    previewLimit,
    splitMetadata: false,
  }
}

function deriveAnnotationExportPreview(
  preview: AnnotationExportPreview | undefined,
  splitMetadata: boolean
) {
  if (!preview || !splitMetadata) return preview

  const metadataByRow = preview.previewItems.map((row) =>
    parsePreviewMetadata(row.metadata)
  )
  const metadataKeys = Array.from(
    new Set(metadataByRow.flatMap((metadata) => Object.keys(metadata)))
  ).sort()
  const previewItems = preview.previewItems.map((row, index) => {
    const { metadata: _metadata, ...values } = row
    const metadata = metadataByRow[index] ?? {}
    for (const key of metadataKeys) {
      values[`metadata.${key}`] = formatPreviewMetadataValue(metadata[key])
    }
    return values
  })

  return { ...preview, metadataKeys, previewItems }
}

function parsePreviewMetadata(value: string | undefined) {
  if (!value) return {} as Record<string, unknown>
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function formatPreviewMetadataValue(value: unknown) {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
}

function buildPreviewColumns(preview?: AnnotationExportPreview) {
  if (!preview) return basePreviewColumns

  const columns = new Set<string>()
  for (const column of basePreviewColumns) {
    if (
      column !== 'metadata' ||
      preview.previewItems.some((row) => column in row)
    ) {
      columns.add(column)
    }
  }
  for (const key of preview.metadataKeys) {
    columns.add(`metadata.${key}`)
  }
  for (const row of preview.previewItems) {
    for (const column of Object.keys(row)) {
      columns.add(column)
    }
  }

  return Array.from(columns)
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className='text-sm font-medium'>{title}</h3>
}

function InfoItem({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='mt-1 truncate text-sm'>{value}</div>
    </div>
  )
}

function MetricItem({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-md border px-3 py-2'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='mt-1 text-lg font-semibold leading-none'>{value}</div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className='mt-3 grid gap-3 md:grid-cols-2'>
      <Skeleton className='h-10 w-full' />
      <Skeleton className='h-10 w-full' />
      <Skeleton className='h-10 w-full md:col-span-2' />
      <div className='grid gap-2 md:col-span-2 md:grid-cols-3'>
        <Skeleton className='h-14 w-full' />
        <Skeleton className='h-14 w-full' />
        <Skeleton className='h-14 w-full' />
      </div>
    </div>
  )
}

function ScoreConfigList({
  scoreConfigs,
}: {
  scoreConfigs: ScoreConfigRecord[]
}) {
  if (scoreConfigs.length === 0) {
    return (
      <div className='text-muted-foreground mt-3 rounded-md border p-4 text-sm'>
        当前任务未配置评分指标
      </div>
    )
  }

  return (
    <div className='mt-3 flex flex-wrap gap-2'>
      {scoreConfigs.map((config) => (
        <div
          key={config.id}
          className='flex max-w-full items-center gap-2 rounded-md border px-3 py-2'
        >
          <span className='truncate text-sm'>{config.name}</span>
          <Badge variant='secondary'>
            {scoreDataTypeLabels[config.dataType] ?? config.dataType}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function PreviewTable({
  columns,
  rows,
  scoreConfigs,
}: {
  columns: string[]
  rows: Record<string, string>[]
  scoreConfigs: ScoreConfigRecord[]
}) {
  if (rows.length === 0) {
    return (
      <div className='text-muted-foreground mt-3 rounded-md border p-4 text-sm'>
        当前范围内暂无标注数据
      </div>
    )
  }

  const scoreColumnNames = new Set(scoreConfigs.map((config) => config.name))

  return (
    <div className='mt-3 max-h-[320px] overflow-auto rounded-md border'>
      <Table>
        <TableHeader className='bg-muted/50 sticky top-0 z-10'>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column}
                className={cn(
                  'max-w-[220px]',
                  scoreColumnNames.has(column) ? 'bg-warning/10' : undefined
                )}
              >
                {formatColumnLabel(column)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={row.id || String(rowIndex)}>
              {columns.map((column) => (
                <TableCell key={column} className='max-w-[280px] truncate'>
                  {formatCellValue(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function formatColumnLabel(column: string) {
  return column
}

function formatCellValue(value = '') {
  return value
}

function buildDefaultExportFileName(preview: AnnotationExportPreview) {
  const queueName = preview.queue.name || preview.queue.id || 'annotation-export'
  const timestamp = formatExportTimestamp(new Date())
  return `${sanitizeExportFileNamePart(
    `${queueName}_${timestamp}_批量导出`
  )}.zip`
}

function formatExportTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('')
}

function normalizeExportFileName(value: string) {
  const sanitized = sanitizeExportFileNamePart(value)
  if (!sanitized) return ''
  return sanitized.toLowerCase().endsWith('.zip') ? sanitized : `${sanitized}.zip`
}

function sanitizeExportFileNamePart(value: string) {
  return (
    value
      .replace(invalidFileNameCharsRegex, '-')
      .replace(/\s+/g, ' ')
      .replace(/\.\.+/g, '')
      .trim()
      .replace(/^[.-\s]+|[.-\s]+$/g, '')
      .slice(0, 120)
      .replace(/[.-\s]+$/g, '') || 'annotation-export'
  )
}
