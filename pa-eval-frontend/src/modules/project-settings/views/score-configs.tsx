import { type FormEvent, useMemo, useState } from 'react'
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { mockScoreConfigs } from '../data/mock'
import type { ScoreConfig, ScoreConfigDataType } from '../types'

const DATA_TYPE_LABELS: Record<ScoreConfigDataType, string> = {
  NUMERIC: 'Numeric',
  CATEGORICAL: 'Categorical',
  BOOLEAN: 'Boolean',
  TEXT: 'Text',
}

type ScoreConfigFormState = {
  name: string
  dataType: ScoreConfigDataType
  description: string
  minValue: string
  maxValue: string
  categories: string
}

const emptyFormState: ScoreConfigFormState = {
  name: '',
  dataType: 'NUMERIC',
  description: '',
  minValue: '1',
  maxValue: '5',
  categories: 'pass, fail',
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function toFormState(config: ScoreConfig): ScoreConfigFormState {
  return {
    name: config.name,
    dataType: config.dataType,
    description: config.description,
    minValue: String(config.minValue ?? ''),
    maxValue: String(config.maxValue ?? ''),
    categories: config.categories?.join(', ') ?? '',
  }
}

function getConfigRange(config: ScoreConfig) {
  if (config.dataType === 'NUMERIC') {
    return `${config.minValue ?? '-'} 到 ${config.maxValue ?? '-'}`
  }

  if (config.dataType === 'CATEGORICAL') {
    return config.categories?.join(', ') || '-'
  }

  return '-'
}

export function ProjectScoreConfigsSettings() {
  const [configs, setConfigs] = useState(mockScoreConfigs)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ScoreConfig | null>(null)
  const [form, setForm] = useState<ScoreConfigFormState>(emptyFormState)

  const sortedConfigs = useMemo(
    () =>
      [...configs].sort(
        (first, second) => Number(first.isArchived) - Number(second.isArchived)
      ),
    [configs]
  )

  const openCreateDialog = () => {
    setEditingConfig(null)
    setForm(emptyFormState)
    setDialogOpen(true)
  }

  const openEditDialog = (config: ScoreConfig) => {
    setEditingConfig(config)
    setForm(toFormState(config))
    setDialogOpen(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = form.name.trim()

    if (!trimmedName) {
      toast.error('请输入指标名称')
      return
    }

    const nextConfig: ScoreConfig = {
      id: editingConfig?.id ?? `score_${Date.now()}`,
      name: trimmedName,
      dataType: form.dataType,
      description: form.description.trim(),
      minValue:
        form.dataType === 'NUMERIC' ? Number(form.minValue || 0) : undefined,
      maxValue:
        form.dataType === 'NUMERIC' ? Number(form.maxValue || 0) : undefined,
      categories:
        form.dataType === 'CATEGORICAL'
          ? form.categories
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
      isArchived: editingConfig?.isArchived ?? false,
      updatedAt: new Date().toISOString(),
    }

    setConfigs((current) =>
      editingConfig
        ? current.map((item) =>
            item.id === editingConfig.id ? nextConfig : item
          )
        : [nextConfig, ...current]
    )
    setDialogOpen(false)
    toast.success(editingConfig ? '评分指标已更新' : '评分指标已新增')
  }

  const toggleArchived = (config: ScoreConfig) => {
    setConfigs((current) =>
      current.map((item) =>
        item.id === config.id
          ? {
              ...item,
              isArchived: !item.isArchived,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    )
    toast.success(config.isArchived ? '评分指标已恢复' : '评分指标已归档')
  }

  return (
    <ContentSection
      title='评分指标'
      desc='管理项目内 Score Configs，支持数值、分类、布尔和文本类型。'
    >
      <div className='flex flex-col gap-4'>
        <div className='flex justify-end'>
          <Button onClick={openCreateDialog}>
            <Plus data-icon='inline-start' />
            新增指标
          </Button>
        </div>
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
                  <TableCell>{formatDateTime(config.updatedAt)}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => openEditDialog(config)}
                      >
                        <Pencil data-icon='inline-start' />
                        编辑
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => toggleArchived(config)}
                      >
                        {config.isArchived ? (
                          <RotateCcw data-icon='inline-start' />
                        ) : (
                          <Archive data-icon='inline-start' />
                        )}
                        {config.isArchived ? '恢复' : '归档'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingConfig ? '编辑评分指标' : '新增评分指标'}
              </DialogTitle>
              <DialogDescription>
                配置指标名称、类型以及类型相关的取值范围。
              </DialogDescription>
            </DialogHeader>
            <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='score-name'>指标名称</Label>
                <Input
                  id='score-name'
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder='例如 helpfulness'
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label>指标类型</Label>
                <Select
                  value={form.dataType}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      dataType: value as ScoreConfigDataType,
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(DATA_TYPE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {form.dataType === 'NUMERIC' ? (
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='flex flex-col gap-2'>
                    <Label htmlFor='score-min'>最小值</Label>
                    <Input
                      id='score-min'
                      type='number'
                      value={form.minValue}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          minValue: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='flex flex-col gap-2'>
                    <Label htmlFor='score-max'>最大值</Label>
                    <Input
                      id='score-max'
                      type='number'
                      value={form.maxValue}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          maxValue: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ) : null}
              {form.dataType === 'CATEGORICAL' ? (
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='score-categories'>分类选项</Label>
                  <Input
                    id='score-categories'
                    value={form.categories}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        categories: event.target.value,
                      }))
                    }
                    placeholder='使用英文逗号分隔，例如 pass, fail'
                  />
                </div>
              ) : null}
              <div className='flex flex-col gap-2'>
                <Label htmlFor='score-description'>指标说明</Label>
                <Textarea
                  id='score-description'
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit'>{editingConfig ? '保存' : '创建'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </ContentSection>
  )
}
