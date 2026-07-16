import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveProjectScoreConfig,
  createProjectScoreConfig,
  listProjectScoreConfigs,
  restoreProjectScoreConfig,
  updateProjectScoreConfig,
  type ScoreConfigInput,
} from '@/modules/app-evaluation/api/annotation-api'
import { Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ContentSection } from '@/components/common/content-section'
import { Loading } from '@/components/common/loading'
import type {
  ScoreConfig,
  ScoreConfigCategory,
  ScoreConfigDataType,
} from '../types'

const DATA_TYPE_LABELS: Record<ScoreConfigDataType, string> = {
  NUMERIC: '数值',
  CATEGORICAL: '分类',
  BOOLEAN: '布尔',
  TEXT: '文本',
}

const BOOLEAN_SCORE_OPTIONS: ScoreConfigCategory[] = [
  { value: 1, label: 'True' },
  { value: 0, label: 'False' },
]

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getConfigRange(config: ScoreConfig) {
  if (config.dataType === 'NUMERIC') {
    return `${config.minValue ?? '-'} 到 ${config.maxValue ?? '-'}`
  }
  if (config.dataType === 'CATEGORICAL') {
    return config.categories?.map(formatScoreOption).join(', ') || '-'
  }
  if (config.dataType === 'BOOLEAN') {
    return formatBooleanScoreOptions(config.categories)
  }
  return '-'
}

function formatBooleanScoreOptions(categories?: ScoreConfigCategory[]) {
  return getBooleanScoreCategories(categories)
    .map((option) => option.label)
    .join(' / ')
}

export function ProjectScoreConfigsSettings() {
  const { projectId = '' } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditScoreConfigs = can('project:score-config:edit')
  const [editingConfig, setEditingConfig] = useState<ScoreConfig | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const configsQuery = useQuery({
    queryKey: ['project-score-configs', $api, projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const records = await listProjectScoreConfigs($api, projectId, true)
      return records.map((record): ScoreConfig => ({
        id: record.id,
        name: record.name,
        dataType: record.dataType,
        description: record.description,
        minValue: record.minValue,
        maxValue: record.maxValue,
        categories: record.categories,
        isArchived: Boolean(record.archived),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt || record.createdAt || '',
      }))
    },
  })
  const saveMutation = useMutation({
    mutationFn: (input: ScoreConfigInput) =>
      editingConfig
        ? updateProjectScoreConfig($api, projectId, editingConfig.id, input)
        : createProjectScoreConfig($api, projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['project-score-configs'],
      })
      setFormOpen(false)
      setEditingConfig(null)
      toast.success(editingConfig ? '评分指标已更新' : '评分指标已创建')
    },
  })
  const archiveMutation = useMutation({
    mutationFn: (config: ScoreConfig) =>
      config.isArchived
        ? restoreProjectScoreConfig($api, projectId, config.id)
        : archiveProjectScoreConfig($api, projectId, config.id),
    onSuccess: async (_result, config) => {
      await queryClient.invalidateQueries({
        queryKey: ['project-score-configs'],
      })
      toast.success(config.isArchived ? '评分指标已恢复' : '评分指标已归档')
    },
  })

  const sortedConfigs = useMemo(
    () =>
      [...(configsQuery.data ?? [])].sort(
        (first, second) => Number(first.isArchived) - Number(second.isArchived)
      ),
    [configsQuery.data]
  )
  const openCreate = () => {
    if (!canEditScoreConfigs) return
    setEditingConfig(null)
    setFormOpen(true)
  }

  const openEdit = (config: ScoreConfig) => {
    if (!canEditScoreConfigs) return
    setEditingConfig(config)
    setFormOpen(true)
  }

  return (
    <ContentSection
      title='评分指标'
      desc='查看项目内 Score Configs，支持数值、分类、布尔和文本类型。'
    >
      <div className='flex flex-col gap-4'>
        {canEditScoreConfigs ? (
          <div className='flex justify-end gap-2'>
            <Button onClick={openCreate}>
              <Plus data-icon='inline-start' />
              新增指标
            </Button>
          </div>
        ) : null}
        {configsQuery.isLoading ? (
          <Loading text='加载评分指标中...' className='min-h-24' />
        ) : null}
        {configsQuery.isError ? (
          <div className='text-destructive rounded-lg border p-4 text-sm'>
            评分指标加载失败，请确认项目权限和后端服务。
          </div>
        ) : null}
        {!configsQuery.isLoading && !configsQuery.isError ? (
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>范围/选项</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>更新时间</TableHead>
                  {canEditScoreConfigs ? (
                    <TableHead className='text-end'>操作</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedConfigs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div className='flex flex-col gap-1'>
                        <span className='max-w-52 truncate font-medium'>
                          {config.name}
                        </span>
                        {config.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className='text-muted-foreground max-w-52 truncate'>
                                {config.description}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className='max-w-80 break-words whitespace-normal'>
                              {config.description}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className='text-muted-foreground max-w-52 truncate'>
                            -
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{DATA_TYPE_LABELS[config.dataType]}</TableCell>
                    <TableCell className='max-w-80 break-words whitespace-normal'>
                      {getConfigRange(config)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={config.isArchived ? 'outline' : 'secondary'}
                        className={
                          config.isArchived
                            ? 'border-border bg-muted text-muted-foreground'
                            : 'border-success/20 bg-success/10 text-success'
                        }
                      >
                        {config.isArchived ? '已归档' : '启用中'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {config.updatedAt
                        ? formatDateTime(config.updatedAt)
                        : '-'}
                    </TableCell>
                    {canEditScoreConfigs ? (
                      <TableCell>
                        <div className='flex justify-end gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => openEdit(config)}
                          >
                            编辑
                          </Button>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={archiveMutation.isPending}
                            onClick={() => archiveMutation.mutate(config)}
                          >
                            {config.isArchived ? '恢复' : '归档'}
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {sortedConfigs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canEditScoreConfigs ? 6 : 5}
                      className='text-muted-foreground h-24 text-center'
                    >
                      当前项目暂无评分指标
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <ScoreConfigDialog
          key={formOpen ? (editingConfig?.id ?? 'new') : 'closed'}
          open={canEditScoreConfigs && formOpen}
          config={editingConfig}
          saving={saveMutation.isPending}
          onOpenChange={(open) => {
            setFormOpen(open)
            if (!open) setEditingConfig(null)
          }}
          onSubmit={(input) => saveMutation.mutate(input)}
        />
      </div>
    </ContentSection>
  )
}

function ScoreConfigDialog({
  open,
  config,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  config: ScoreConfig | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ScoreConfigInput) => void
}) {
  const [name, setName] = useState(config?.name ?? '')
  const [dataType, setDataType] = useState<ScoreConfigDataType>(
    config?.dataType ?? 'NUMERIC'
  )
  const [description, setDescription] = useState(config?.description ?? '')
  const [minValue, setMinValue] = useState(
    config?.minValue == null ? '' : String(config.minValue)
  )
  const [maxValue, setMaxValue] = useState(
    config?.maxValue == null ? '' : String(config.maxValue)
  )
  const [categoryRows, setCategoryRows] = useState<ScoreOptionRow[]>(
    getInitialScoreOptionRows(config)
  )

  function handleDataTypeChange(value: string) {
    const nextDataType = value as ScoreConfigDataType
    setDataType(nextDataType)
    setCategoryRows(getInitialScoreOptionRows({ dataType: nextDataType }))
    if (nextDataType !== 'NUMERIC') {
      setMinValue('')
      setMaxValue('')
    }
  }

  const submit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('请输入指标名称')
      return
    }
    const categoryValues = categoryRows
      .map((item) => ({
        value: Number(item.value.trim()),
        label: item.label.trim(),
      }))
      .filter((item) => Number.isFinite(item.value) && item.label)
    if (dataType === 'CATEGORICAL' && categoryValues.length === 0) {
      toast.error('请至少配置一个有效分类选项')
      return
    }
    if (dataType === 'BOOLEAN' && categoryValues.length < 2) {
      toast.error('请配置两个有效布尔标签')
      return
    }
    onSubmit({
      name: trimmedName,
      dataType,
      description,
      minValue:
        dataType === 'NUMERIC' && minValue !== '' ? Number(minValue) : null,
      maxValue:
        dataType === 'NUMERIC' && maxValue !== '' ? Number(maxValue) : null,
      categories:
        dataType === 'CATEGORICAL' || dataType === 'BOOLEAN'
          ? categoryValues
          : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl'>
        <DialogHeader className='border-b p-6 pb-4 text-start'>
          <DialogTitle>{config ? '编辑评分指标' : '新增评分指标'}</DialogTitle>
        </DialogHeader>
        <div className='grid min-h-0 flex-1 gap-4 overflow-y-auto p-6'>
          <Field label='名称'>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label='类型'>
            <Select
              value={dataType}
              disabled={Boolean(config)}
              onValueChange={handleDataTypeChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DATA_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='说明'>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          {dataType === 'NUMERIC' ? (
            <div className='grid gap-3 md:grid-cols-2'>
              <Field label='最小值'>
                <Input
                  type='number'
                  value={minValue}
                  onChange={(event) => setMinValue(event.target.value)}
                />
              </Field>
              <Field label='最大值'>
                <Input
                  type='number'
                  value={maxValue}
                  onChange={(event) => setMaxValue(event.target.value)}
                />
              </Field>
            </div>
          ) : null}
          {dataType === 'CATEGORICAL' ? (
            <ScoreOptionRows
              rows={categoryRows}
              onChange={setCategoryRows}
              addLabel='新增分类'
              readOnlyValue
            />
          ) : null}
          {dataType === 'BOOLEAN' ? (
            <ScoreOptionRows
              rows={categoryRows}
              onChange={setCategoryRows}
              readOnlyValue
            />
          ) : null}
        </div>
        <DialogFooter className='border-t p-6 pt-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type='button' disabled={saving} onClick={submit}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ScoreOptionRow = {
  value: string
  label: string
}

function ScoreOptionRows({
  rows,
  onChange,
  addLabel,
  readOnlyValue = false,
  readOnlyLabel = false,
}: {
  rows: ScoreOptionRow[]
  onChange: (rows: ScoreOptionRow[]) => void
  addLabel?: string
  readOnlyValue?: boolean
  readOnlyLabel?: boolean
}) {
  const updateRow = (index: number, patch: Partial<ScoreOptionRow>) => {
    onChange(
      rows.map((row, currentIndex) =>
        currentIndex === index ? { ...row, ...patch } : row
      )
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      <Label>选项配置</Label>
      <div className='grid gap-2'>
        {rows.map((row, index) => (
          <div
            key={index}
            className='grid items-end gap-2 sm:grid-cols-[1fr_3fr_auto]'
          >
            <Field label='值'>
              <Input
                value={row.value}
                disabled={readOnlyValue}
                readOnly={readOnlyValue}
                inputMode='numeric'
                className='text-center'
                onChange={(event) =>
                  updateRow(index, { value: event.target.value })
                }
                placeholder='值，例如 1'
              />
            </Field>
            <Field label='标签'>
              <Input
                value={row.label}
                readOnly={readOnlyLabel}
                onChange={(event) =>
                  updateRow(index, { label: event.target.value })
                }
                placeholder='显示标签，例如 True'
              />
            </Field>
            {addLabel ? (
              <Button
                type='button'
                variant='outline'
                size='icon'
                aria-label='删除分类'
                disabled={index === 0 || index !== rows.length - 1}
                onClick={() =>
                  onChange(
                    rows.filter((_, currentIndex) => currentIndex !== index)
                  )
                }
              >
                <Trash2 className='size-4' />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {addLabel ? (
        <Button
          type='button'
          variant='outline'
          onClick={() => onChange([...rows, getNextScoreOptionRow(rows)])}
        >
          {addLabel}
        </Button>
      ) : (
        <p className='text-muted-foreground text-xs'>
          布尔类型固定使用 1 / 0，标签可按业务含义修改。
        </p>
      )}
    </div>
  )
}

function getInitialScoreOptionRows(
  config: Pick<ScoreConfig, 'dataType'> & { categories?: ScoreConfigCategory[] }
): ScoreOptionRow[]
function getInitialScoreOptionRows(config: ScoreConfig | null): ScoreOptionRow[]
function getInitialScoreOptionRows(
  config:
    | (Pick<ScoreConfig, 'dataType'> & { categories?: ScoreConfigCategory[] })
    | null
): ScoreOptionRow[] {
  if (config?.dataType === 'BOOLEAN') {
    return getBooleanScoreCategories(config.categories).map((option) => ({
      value: String(option.value),
      label: option.label,
    }))
  }
  if (config?.categories?.length) {
    return config.categories.map((category) => ({
      value: String(category.value),
      label: category.label,
    }))
  }
  return [{ value: '0', label: '' }]
}

function getNextScoreOptionRow(rows: ScoreOptionRow[]): ScoreOptionRow {
  const numericValues = rows
    .map((row) => Number(row.value.trim()))
    .filter(Number.isFinite)
  const nextValue = numericValues.length ? Math.max(...numericValues) + 1 : 0
  return { value: String(nextValue), label: '' }
}

function formatScoreOption(option: ScoreConfigCategory) {
  return `${option.label}（${option.value}）`
}

function getBooleanScoreCategories(
  categories?: ScoreConfigCategory[]
): ScoreConfigCategory[] {
  const trueOption =
    categories?.find((category) => Number(category.value) === 1) ??
    categories?.[0]
  const falseOption =
    categories?.find((category) => Number(category.value) === 0) ??
    categories?.[1]

  return [
    {
      value: 1,
      label: trueOption?.label?.trim() || BOOLEAN_SCORE_OPTIONS[0].label,
    },
    {
      value: 0,
      label: falseOption?.label?.trim() || BOOLEAN_SCORE_OPTIONS[1].label,
    },
  ]
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-2'>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
