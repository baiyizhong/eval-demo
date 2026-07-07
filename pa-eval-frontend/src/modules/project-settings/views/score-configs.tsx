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
import { Plus } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
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
import { ContentSection } from '@/components/common/content-section'
import { Loading } from '@/components/common/loading'
import type { ScoreConfig, ScoreConfigDataType } from '../types'

const DATA_TYPE_LABELS: Record<ScoreConfigDataType, string> = {
  NUMERIC: '数值',
  CATEGORICAL: '分类',
  BOOLEAN: '布尔',
  TEXT: '文本',
}

const BOOLEAN_SCORE_OPTIONS: ScoreOptionRow[] = [
  { value: '1', label: '是' },
  { value: '0', label: '否' },
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
    return formatBooleanScoreOptions()
  }
  return '-'
}

function formatBooleanScoreOptions() {
  return BOOLEAN_SCORE_OPTIONS.map((option) => option.label).join(' / ')
}

export function ProjectScoreConfigsSettings() {
  const { projectId = '' } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
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
    setEditingConfig(null)
    setFormOpen(true)
  }

  const openEdit = (config: ScoreConfig) => {
    setEditingConfig(config)
    setFormOpen(true)
  }

  return (
    <ContentSection
      title='评分指标'
      desc='查看项目内 Score Configs，支持数值、分类、布尔和文本类型。'
    >
      <div className='flex flex-col gap-4'>
        <div className='flex justify-end gap-2'>
          <Button onClick={openCreate}>
            <Plus data-icon='inline-start' />
            新增指标
          </Button>
        </div>
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
                  <TableHead className='text-end'>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedConfigs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div className='flex flex-col gap-1'>
                        <span className='font-medium'>{config.name}</span>
                        <span className='text-muted-foreground max-w-52 truncate'>
                          {config.description || '-'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{DATA_TYPE_LABELS[config.dataType]}</TableCell>
                    <TableCell>{getConfigRange(config)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={config.isArchived ? 'outline' : 'secondary'}
                      >
                        {config.isArchived ? '已归档' : '启用中'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {config.updatedAt
                        ? formatDateTime(config.updatedAt)
                        : '-'}
                    </TableCell>
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
                  </TableRow>
                ))}
                {sortedConfigs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
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
          open={formOpen}
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
    config?.minValue == null ? '1' : String(config.minValue)
  )
  const [maxValue, setMaxValue] = useState(
    config?.maxValue == null ? '5' : String(config.maxValue)
  )
  const [categoryRows, setCategoryRows] = useState<ScoreOptionRow[]>(
    getInitialScoreOptionRows(config)
  )

  const submit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('请输入指标名称')
      return
    }
    const categoryValues = categoryRows
      .map((item) => ({
        value: item.value.trim(),
        label: item.label.trim(),
      }))
      .filter((item) => item.value)
      .map((item) => encodeScoreOption(item))
    onSubmit({
      name: trimmedName,
      dataType,
      description,
      minValue:
        dataType === 'NUMERIC' && minValue !== '' ? Number(minValue) : null,
      maxValue:
        dataType === 'NUMERIC' && maxValue !== '' ? Number(maxValue) : null,
      categories:
        dataType === 'BOOLEAN'
          ? BOOLEAN_SCORE_OPTIONS.map(encodeScoreOption)
          : dataType === 'CATEGORICAL'
            ? categoryValues
            : [],
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{config ? '编辑评分指标' : '新增评分指标'}</DialogTitle>
        </DialogHeader>
        <div className='grid gap-4'>
          <Field label='名称'>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label='类型'>
            <Select
              value={dataType}
              onValueChange={(value) =>
                setDataType(value as ScoreConfigDataType)
              }
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
            />
          ) : null}
          {dataType === 'BOOLEAN' ? (
            <BooleanScoreOptionRows />
          ) : null}
        </div>
        <DialogFooter>
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

function BooleanScoreOptionRows() {
  return (
    <div className='flex flex-col gap-2'>
      <Label>选项配置</Label>
      <div className='flex flex-wrap gap-2'>
        {BOOLEAN_SCORE_OPTIONS.map((row) => (
          <Badge key={row.value} variant='secondary' className='px-3 py-1'>
            {row.label}
          </Badge>
        ))}
      </div>
      <p className='text-muted-foreground text-xs'>
        布尔类型固定为“是 / 否”，不支持自定义修改。
      </p>
    </div>
  )
}

function ScoreOptionRows({
  rows,
  onChange,
  addLabel,
}: {
  rows: ScoreOptionRow[]
  onChange: (rows: ScoreOptionRow[]) => void
  addLabel: string
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
          <div key={index} className='grid grid-cols-[1fr_1fr_auto] gap-2'>
            <Input
              value={row.value}
              onChange={(event) => updateRow(index, { value: event.target.value })}
              placeholder='值，例如 1'
            />
            <Input
              value={row.label}
              onChange={(event) => updateRow(index, { label: event.target.value })}
              placeholder='显示标签，例如 是'
            />
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                onChange(rows.filter((_, currentIndex) => currentIndex !== index))
              }
            >
              删除
            </Button>
          </div>
        ))}
      </div>
      <Button
        type='button'
        variant='outline'
        onClick={() => onChange([...rows, { value: '', label: '' }])}
      >
        {addLabel}
      </Button>
    </div>
  )
}

function getInitialScoreOptionRows(config: ScoreConfig | null): ScoreOptionRow[] {
  if (config?.dataType === 'BOOLEAN') {
    return BOOLEAN_SCORE_OPTIONS
  }
  if (config?.categories?.length) {
    return config.categories.map(parseScoreOption)
  }
  return [
    { value: 'good', label: '好' },
    { value: 'bad', label: '差' },
  ]
}

function encodeScoreOption(option: ScoreOptionRow) {
  return `${option.value}|${option.label || option.value}`
}

function parseScoreOption(value: string): ScoreOptionRow {
  const [rawValue, rawLabel] = value.split('|')
  return {
    value: rawValue || value,
    label: rawLabel || rawValue || value,
  }
}

function formatScoreOption(value: string) {
  const option = parseScoreOption(value)
  return `${option.value}（${option.label}）`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-2'>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
