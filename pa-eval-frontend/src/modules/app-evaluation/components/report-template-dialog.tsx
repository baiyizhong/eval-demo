import { useMemo, useState, type ReactNode } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { confirm } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  createProjectEvaluationReportTemplate,
  deleteProjectEvaluationReportTemplate,
  listProjectEvaluationReportTemplates,
  updateProjectEvaluationReportTemplate,
  type EvaluationReportTemplateInput,
} from '../api/report-template-api'
import type {
  EvaluationReportTemplateRecord,
  EvaluationReportTemplateSectionKey,
} from '../types'

const sectionLabels: Record<EvaluationReportTemplateSectionKey, string> = {
  metrics: '指标概览',
  distribution: '分数分布',
  groupAnalysis: '分组分析',
  recommendations: '改进建议',
  risks: '风险提示',
  reproduction: '复现信息',
  items: '评测数据',
  badcases: 'Badcase',
}

const defaultSections = Object.fromEntries(
  Object.keys(sectionLabels).map((key) => [key, true])
) as Record<EvaluationReportTemplateSectionKey, boolean>

const emptyForm: EvaluationReportTemplateInput = {
  name: '',
  description: '',
  isDefault: false,
  titleTemplate: '{taskName}报告',
  summaryTemplate:
    '评估完成，共运行 {sampleCount} 条样本，平均得分 {averageScore}，通过率 {passRate}。',
  sections: defaultSections,
  badcaseRule: { mode: 'EVALUATOR_RESULT' },
  recommendations: ['可结合 Badcase 明细定位低分样本，并回流到数据集复测。'],
  risks: ['当前报告由工作流后台运行生成，工作流输出质量会影响评分稳定性。'],
}

export function ReportTemplateDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState('new')
  const [form, setForm] = useState<EvaluationReportTemplateInput>(emptyForm)

  const query = useQuery({
    queryKey: ['project-report-templates', $api, projectId],
    queryFn: () => listProjectEvaluationReportTemplates($api, projectId),
    enabled: open,
  })
  const templates = useMemo(() => query.data?.datas ?? [], [query.data?.datas])
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId),
    [selectedId, templates]
  )

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['project-report-templates', $api, projectId],
    })
  }

  const saveTemplate = async () => {
    if (!form.name.trim()) {
      toast.error('请输入模板名称')
      return
    }
    if (selectedTemplate && selectedTemplate.id !== 'default') {
      await updateProjectEvaluationReportTemplate(
        $api,
        projectId,
        selectedTemplate.id,
        form
      )
      toast.success('报告模板已更新')
    } else {
      const created = await createProjectEvaluationReportTemplate(
        $api,
        projectId,
        form
      )
      setSelectedId(created.id)
      toast.success('报告模板已创建')
    }
    await invalidate()
  }

  const deleteTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.id === 'default') return
    const confirmed = await confirm({
      title: '删除报告模板',
      desc: `删除「${selectedTemplate.name}」后，新建自动评测不能再选择该模板，历史报告不受影响。确定继续吗？`,
      confirmText: '删除',
      destructive: true,
    })
    if (!confirmed) return
    await deleteProjectEvaluationReportTemplate($api, projectId, selectedTemplate.id)
    setSelectedId('new')
    await invalidate()
    toast.success('报告模板已删除')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[86svh] overflow-hidden sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>报告模板</DialogTitle>
          <DialogDescription>
            模板会在自动评测创建时保存为快照，历史报告不会随模板修改变化。
          </DialogDescription>
        </DialogHeader>
        <div className='grid min-h-0 gap-4 overflow-hidden md:grid-cols-[260px_1fr]'>
          <div className='flex min-h-0 flex-col gap-2 overflow-auto border-r pr-3'>
            <Button
              type='button'
              variant={selectedId === 'new' ? 'default' : 'outline'}
              className='justify-start gap-2'
              onClick={() => {
                setSelectedId('new')
                setForm(emptyForm)
              }}
            >
              <Plus className='size-4' />
              新建模板
            </Button>
            {templates.map((template) => (
              <Button
                key={template.id}
                type='button'
                variant={selectedId === template.id ? 'secondary' : 'ghost'}
                className='h-auto justify-start px-3 py-2 text-left'
                onClick={() => {
                  setSelectedId(template.id)
                  setForm(toInput(template))
                }}
              >
                <span className='flex min-w-0 flex-col'>
                  <span className='truncate'>{template.name}</span>
                  <span className='text-muted-foreground truncate text-xs'>
                    {template.isDefault ? '默认模板' : template.description || '自定义模板'}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          <div className='min-h-0 overflow-auto pr-1'>
            <div className='grid gap-4 md:grid-cols-2'>
              <Field label='模板名称'>
                <Input
                  value={form.name}
                  disabled={selectedTemplate?.id === 'default'}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label='默认模板'>
                <div className='flex h-9 items-center gap-2'>
                  <Switch
                    checked={form.isDefault}
                    disabled={selectedTemplate?.id === 'default'}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, isDefault: checked })
                    }
                  />
                  <span className='text-sm'>新建任务默认使用</span>
                </div>
              </Field>
              <Field label='模板描述' className='md:col-span-2'>
                <Input
                  value={form.description}
                  disabled={selectedTemplate?.id === 'default'}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </Field>
              <Field label='标题模板'>
                <Input
                  value={form.titleTemplate}
                  disabled={selectedTemplate?.id === 'default'}
                  onChange={(event) =>
                    setForm({ ...form, titleTemplate: event.target.value })
                  }
                />
              </Field>
              <Field label='Badcase 规则'>
                <div className='grid grid-cols-[1fr_92px] gap-2'>
                  <Select
                    value={form.badcaseRule.mode}
                    disabled={selectedTemplate?.id === 'default'}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        badcaseRule:
                          value === 'SCORE_THRESHOLD'
                            ? {
                                mode: 'SCORE_THRESHOLD',
                                operator: 'LTE',
                                threshold: form.badcaseRule.threshold ?? 0.6,
                              }
                            : { mode: 'EVALUATOR_RESULT' },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value='EVALUATOR_RESULT'>评估器结果</SelectItem>
                        <SelectItem value='SCORE_THRESHOLD'>分数阈值</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Input
                    type='number'
                    step='0.01'
                    min='0'
                    max='1'
                    disabled={
                      selectedTemplate?.id === 'default' ||
                      form.badcaseRule.mode !== 'SCORE_THRESHOLD'
                    }
                    value={form.badcaseRule.threshold ?? ''}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        badcaseRule: {
                          mode: 'SCORE_THRESHOLD',
                          operator: 'LTE',
                          threshold: Number(event.target.value || 0),
                        },
                      })
                    }
                  />
                </div>
              </Field>
              <Field label='摘要模板' className='md:col-span-2'>
                <Textarea
                  value={form.summaryTemplate}
                  disabled={selectedTemplate?.id === 'default'}
                  onChange={(event) =>
                    setForm({ ...form, summaryTemplate: event.target.value })
                  }
                />
              </Field>
              <Field label='展示章节' className='md:col-span-2'>
                <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
                  {Object.entries(sectionLabels).map(([key, label]) => (
                    <label
                      key={key}
                      className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'
                    >
                      <span>{label}</span>
                      <Switch
                        checked={
                          form.sections[key as EvaluationReportTemplateSectionKey]
                        }
                        disabled={selectedTemplate?.id === 'default'}
                        onCheckedChange={(checked) =>
                          setForm({
                            ...form,
                            sections: { ...form.sections, [key]: checked },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </Field>
              <Field label='默认建议' className='md:col-span-2'>
                <Textarea
                  value={form.recommendations.join('\n')}
                  disabled={selectedTemplate?.id === 'default'}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      recommendations: splitLines(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label='默认风险' className='md:col-span-2'>
                <Textarea
                  value={form.risks.join('\n')}
                  disabled={selectedTemplate?.id === 'default'}
                  onChange={(event) =>
                    setForm({ ...form, risks: splitLines(event.target.value) })
                  }
                />
              </Field>
            </div>
            <div className='mt-4 flex justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={!selectedTemplate || selectedTemplate.id === 'default'}
                onClick={() => void deleteTemplate()}
              >
                <Trash2 className='size-4' />
                删除
              </Button>
              <Button
                type='button'
                disabled={selectedTemplate?.id === 'default'}
                onClick={() => void saveTemplate()}
              >
                <Save className='size-4' />
                保存模板
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function toInput(
  template: EvaluationReportTemplateRecord
): EvaluationReportTemplateInput {
  return {
    name: template.name,
    description: template.description,
    isDefault: template.isDefault,
    titleTemplate: template.titleTemplate,
    summaryTemplate: template.summaryTemplate,
    sections: { ...defaultSections, ...template.sections },
    badcaseRule: template.badcaseRule,
    recommendations: template.recommendations,
    risks: template.risks,
  }
}

function splitLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}
