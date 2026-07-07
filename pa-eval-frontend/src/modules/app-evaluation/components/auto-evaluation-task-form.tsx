import { useEffect, useState } from 'react'
import { listTaskEvaluators } from '@/modules/tasks/api/evaluator-api'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  countProjectAutoEvaluationTraces,
  createProjectAutoEvaluationTask,
} from '../api/auto-evaluation-api'
import { listProjectAutoEvaluationDatasets } from '../api/dataset-api'
import { listProjectEvaluationReportTemplates } from '../api/report-template-api'
import type {
  AutoEvaluationTaskFormInput,
  EvaluationReportTemplateRecord,
  MockAutoEvaluationDataset,
  MockAutoEvaluationEvaluator,
} from '../types'
import { autoEvaluationStepLabels } from './auto-evaluation-steps'

const initialForm: AutoEvaluationTaskFormInput = {
  name: '',
  description: '',
  scoreName: '',
  evaluatorId: '',
  variableMapping: {},
  reportTemplateId: 'default',
  dataSource: { type: 'DATASET', datasetId: '' },
  sampleRate: 100,
  badcase: {
    enabled: true,
    scoreName: '',
    operator: 'LTE',
    threshold: 0.6,
  },
}

const sampleFieldOptions = [
  'sample.input',
  'sample.output',
  'sample.expectedOutput',
  'sample.context',
  'sample.metadata',
  'sample.trace.id',
  'sample.observation.id',
  'sample.datasetItem.id',
]

export function AutoEvaluationTaskForm({
  projectId,
  onDirtyChange,
  onCancel,
  onCompleted,
}: {
  projectId: string
  onDirtyChange?: (dirty: boolean) => void
  onCancel?: () => void
  onCompleted?: (taskId: string, mode: 'create' | 'run') => void
}) {
  const $api = useAPI()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<AutoEvaluationTaskFormInput>(initialForm)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [evaluatorKeyword, setEvaluatorKeyword] = useState('')
  const [datasetKeyword, setDatasetKeyword] = useState('')
  const [evaluators, setEvaluators] = useState<MockAutoEvaluationEvaluator[]>(
    []
  )
  const [datasets, setDatasets] = useState<MockAutoEvaluationDataset[]>([])
  const [reportTemplates, setReportTemplates] = useState<
    EvaluationReportTemplateRecord[]
  >([])

  useEffect(() => {
    void listTaskEvaluators($api, {
      page: 1,
      pageSize: 50,
      keyword: evaluatorKeyword,
      filters: {},
      sorting: [],
    }).then((result) => {
      setEvaluators(
        result.datas
          .filter((evaluator) => evaluator.type === 'WORKFLOW')
          .map((evaluator) => ({
            id: evaluator.id,
            name: evaluator.name,
            type: 'WORKFLOW',
            version: evaluator.version,
            variables: evaluator.variables,
            description: evaluator.description,
            updatedAt: evaluator.updatedAt,
          }))
      )
    })
  }, [$api, evaluatorKeyword, projectId])

  useEffect(() => {
    void listProjectAutoEvaluationDatasets(
      $api,
      projectId,
      datasetKeyword
    ).then(setDatasets)
  }, [$api, datasetKeyword, projectId])

  useEffect(() => {
    void listProjectEvaluationReportTemplates($api, projectId).then(
      (result) => {
        setReportTemplates(result.datas)
      }
    )
  }, [$api, projectId])

  const selectedEvaluator = evaluators.find(
    (item) => item.id === form.evaluatorId
  )
  let selectedDataset: MockAutoEvaluationDataset | null = null
  if (form.dataSource.type === 'DATASET') {
    const datasetId = form.dataSource.datasetId
    selectedDataset = datasets.find((item) => item.id === datasetId) ?? null
  }
  const sourceSampleCount =
    form.dataSource.type === 'DATASET'
      ? (selectedDataset?.itemCount ?? 0)
      : form.dataSource.estimatedCount
  const estimatedRunCount = getEstimatedRunCount(
    sourceSampleCount,
    form.sampleRate
  )

  const updateForm = (next: AutoEvaluationTaskFormInput) => {
    setForm(next)
    setDirty(true)
    onDirtyChange?.(true)
    setError('')
  }

  const validateStep = () => {
    const message = getStepError(step, form, selectedEvaluator)
    setError(message)
    return !message
  }

  const handleBack = async () => {
    if (!dirty) {
      onCancel?.()
      if (!onCancel)
        navigate(`/projects/${projectId}/evaluation/auto-evaluations`)
      return
    }
    const confirmed = await confirm({
      title: '离开新建自动评测？',
      desc: '当前自动评测任务尚未保存，离开后已填写内容将丢失。',
      confirmText: '离开',
    })
    if (confirmed) {
      onDirtyChange?.(false)
      onCancel?.()
      if (!onCancel)
        navigate(`/projects/${projectId}/evaluation/auto-evaluations`)
    }
  }

  const handleSubmit = async (mode: 'create' | 'run') => {
    const currentStep = step
    for (let index = 0; index < 3; index += 1) {
      const message = getStepError(index, form, selectedEvaluator)
      if (message) {
        setStep(index)
        setError(message)
        return
      }
    }
    setStep(currentStep)
    const task = await createProjectAutoEvaluationTask($api, projectId, {
      name: form.name,
      description: form.description,
      scoreName: form.scoreName,
      evaluatorId: form.evaluatorId,
      sampleRate: form.sampleRate,
      dataSource: form.dataSource,
      variableMapping: form.variableMapping,
      reportTemplateId: form.reportTemplateId,
    })
    onDirtyChange?.(false)
    toast.success('自动评测任务已创建并开始运行')
    if (onCompleted) {
      onCompleted(task.id, mode)
      return
    }
    navigate(
      mode === 'run'
        ? `/projects/${projectId}/evaluation/auto-evaluations/${task.id}`
        : `/projects/${projectId}/evaluation/auto-evaluations`
    )
  }

  const estimateTrace = async () => {
    const traceFilter =
      form.dataSource.type === 'TRACE_FILTER'
        ? form.dataSource
        : {
            type: 'TRACE_FILTER' as const,
            timeRange: '24h',
            environments: ['production'],
            traceName: '',
            userId: '',
            sessionId: '',
            tags: [],
            estimatedCount: 0,
          }
    const result = await countProjectAutoEvaluationTraces(
      $api,
      projectId,
      traceFilter
    )
    const count = result.count
    updateForm({
      ...form,
      dataSource:
        form.dataSource.type === 'TRACE_FILTER'
          ? { ...traceFilter, estimatedCount: count }
          : { ...traceFilter, estimatedCount: count },
    })
    toast.success(`Trace 过滤预估命中 ${count} 条`)
  }

  return (
    <div className='flex flex-col gap-5'>
      <div className='flex flex-col gap-1'>
        <h2 className='text-base font-semibold'>新建自动评测</h2>
        <p className='text-muted-foreground text-sm'>
          按步骤配置基础信息、评估器和评测数据来源。
        </p>
      </div>
        <div className='flex flex-wrap gap-2'>
          {autoEvaluationStepLabels.map((label, index) => (
            <Button
              key={label}
              type='button'
              variant={step === index ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStep(index)}
            >
              {label}
            </Button>
          ))}
        </div>
        {error ? <p className='text-destructive text-sm'>{error}</p> : null}
        {step === 0 ? (
          <div className='grid gap-4 md:grid-cols-2'>
            <Field label='任务名称'>
              <Input
                value={form.name}
                onChange={(event) =>
                  updateForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label='Score Name'>
              <Input
                value={form.scoreName}
                onChange={(event) =>
                  updateForm({
                    ...form,
                    scoreName: event.target.value,
                    badcase: { ...form.badcase, scoreName: event.target.value },
                  })
                }
              />
            </Field>
            <Field label='任务描述' className='md:col-span-2'>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  updateForm({ ...form, description: event.target.value })
                }
              />
            </Field>
          </div>
        ) : null}
        {step === 1 ? (
          <div className='grid gap-4 lg:grid-cols-[280px_1fr]'>
            <Field label='搜索评估器'>
              <Input
                value={evaluatorKeyword}
                onChange={(event) => setEvaluatorKeyword(event.target.value)}
              />
            </Field>
            <div className='flex flex-col gap-3'>
              {evaluators.map((evaluator) => (
                <Button
                  key={evaluator.id}
                  type='button'
                  variant={
                    form.evaluatorId === evaluator.id ? 'default' : 'outline'
                  }
                  className='h-auto justify-start px-4 py-3'
                  onClick={() =>
                    updateForm({
                      ...form,
                      evaluatorId: evaluator.id,
                      variableMapping: Object.fromEntries(
                        evaluator.variables.map((item) => [item, ''])
                      ),
                    })
                  }
                >
                  <span className='flex flex-col items-start gap-1'>
                    <span>{evaluator.name}</span>
                    <span className='text-xs'>{evaluator.description}</span>
                  </span>
                </Button>
              ))}
              {selectedEvaluator ? (
                <div className='grid gap-3 md:grid-cols-3'>
                  {selectedEvaluator.variables.map((variable) => (
                    <Field key={variable} label={variable}>
                      <Select
                        value={getMappingSelectValue(
                          form.variableMapping[variable]
                        )}
                        onValueChange={(value) =>
                          updateForm({
                            ...form,
                            variableMapping: {
                              ...form.variableMapping,
                              [variable]: toMappingTemplate(value),
                            },
                          })
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='选择字段' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {sampleFieldOptions.map((field) => (
                              <SelectItem key={field} value={field}>
                                {field}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className='flex flex-col gap-4'>
            <Tabs
              value={form.dataSource.type}
              onValueChange={(value) =>
                updateForm({
                  ...form,
                  dataSource:
                    value === 'DATASET'
                      ? { type: 'DATASET', datasetId: '' }
                      : {
                          type: 'TRACE_FILTER',
                          timeRange: '24h',
                          environments: ['production'],
                          traceName: '',
                          userId: '',
                          sessionId: '',
                          tags: [],
                          estimatedCount: 0,
                        },
                })
              }
            >
              <TabsList>
                <TabsTrigger value='DATASET'>数据集</TabsTrigger>
                <TabsTrigger value='TRACE_FILTER'>Trace 过滤</TabsTrigger>
              </TabsList>
              <TabsContent
                value='DATASET'
                className='grid gap-4 md:grid-cols-2'
              >
                <Field label='搜索数据集'>
                  <Input
                    value={datasetKeyword}
                    onChange={(event) => setDatasetKeyword(event.target.value)}
                  />
                </Field>
                <Field label='选择数据集'>
                  <Select
                    value={
                      form.dataSource.type === 'DATASET'
                        ? form.dataSource.datasetId
                        : ''
                    }
                    onValueChange={(value) => {
                      const dataset = datasets.find((item) => item.id === value)
                      updateForm({
                        ...form,
                        dataSource: {
                          type: 'DATASET',
                          datasetId: value,
                          projectId: dataset?.projectId,
                        },
                      })
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='选择数据集' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {datasets.map((dataset) => (
                          <SelectItem key={dataset.id} value={dataset.id}>
                            {dataset.name} · {dataset.itemCount} 条
                            {dataset.projectName
                              ? ` · ${dataset.projectName}`
                              : ''}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </TabsContent>
              <TabsContent
                value='TRACE_FILTER'
                className='grid gap-4 md:grid-cols-3'
              >
                <Field label='时间范围'>
                  <Input
                    value={
                      form.dataSource.type === 'TRACE_FILTER'
                        ? form.dataSource.timeRange
                        : '24h'
                    }
                    onChange={(event) =>
                      form.dataSource.type === 'TRACE_FILTER'
                        ? updateForm({
                            ...form,
                            dataSource: {
                              ...form.dataSource,
                              timeRange: event.target.value,
                            },
                          })
                        : undefined
                    }
                  />
                </Field>
                <Field label='Trace Name'>
                  <Input
                    value={
                      form.dataSource.type === 'TRACE_FILTER'
                        ? form.dataSource.traceName
                        : ''
                    }
                    onChange={(event) =>
                      form.dataSource.type === 'TRACE_FILTER'
                        ? updateForm({
                            ...form,
                            dataSource: {
                              ...form.dataSource,
                              traceName: event.target.value,
                            },
                          })
                        : undefined
                    }
                  />
                </Field>
                <Field label='预估命中'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => void estimateTrace()}
                  >
                    {form.dataSource.type === 'TRACE_FILTER'
                      ? `${form.dataSource.estimatedCount} 条`
                      : '开始预估'}
                  </Button>
                </Field>
              </TabsContent>
            </Tabs>
            <div className='grid gap-4 md:grid-cols-3'>
              <Field label='报告模板'>
                <Select
                  value={form.reportTemplateId}
                  onValueChange={(value) =>
                    updateForm({ ...form, reportTemplateId: value })
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='选择报告模板' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {reportTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                          {template.isDefault ? ' · 默认' : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`采样率：预计运行 ${estimatedRunCount} 条`}>
                <Input
                  type='number'
                  min={1}
                  max={100}
                  value={form.sampleRate}
                  onChange={(event) =>
                    updateForm({
                      ...form,
                      sampleRate: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label='Badcase'>
                <div className='flex h-9 items-center gap-2'>
                  <Switch
                    checked={form.badcase.enabled}
                    onCheckedChange={(checked) =>
                      updateForm({
                        ...form,
                        badcase: { ...form.badcase, enabled: checked },
                      })
                    }
                  />
                  <span className='text-sm'>启用</span>
                </div>
              </Field>
              <Field label='Badcase 阈值'>
                <Input
                  type='number'
                  step='0.01'
                  value={form.badcase.threshold ?? ''}
                  onChange={(event) =>
                    updateForm({
                      ...form,
                      badcase: {
                        ...form.badcase,
                        threshold:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
            </div>
          </div>
        ) : null}
        <div className='flex flex-wrap justify-between gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => void handleBack()}
          >
            取消
          </Button>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              上一步
            </Button>
            {step < 2 ? (
              <Button
                type='button'
                onClick={() => {
                  if (validateStep()) setStep((value) => value + 1)
                }}
              >
                下一步
              </Button>
            ) : (
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => void handleSubmit('create')}
                >
                  仅创建
                </Button>
                <Button type='button' onClick={() => void handleSubmit('run')}>
                  创建并运行
                </Button>
              </>
            )}
          </div>
        </div>
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function getStepError(
  step: number,
  form: AutoEvaluationTaskFormInput,
  evaluator?: MockAutoEvaluationEvaluator
) {
  if (step === 0) {
    if (!form.name.trim()) return '任务名称不能为空'
    if (!form.scoreName.trim()) return 'Score Name 不能为空'
    if (!isScoreNameValid(form.scoreName)) {
      return 'Score Name 只允许英文、数字、下划线和短横线'
    }
  }
  if (step === 1) {
    if (!form.evaluatorId) return '请选择评估器'
    if (
      evaluator?.variables.some(
        (variable) => !form.variableMapping[variable]
      ) ??
      true
    ) {
      return '请完成评估器变量映射'
    }
  }
  if (step === 2) {
    if (form.dataSource.type === 'DATASET' && !form.dataSource.datasetId) {
      return '请选择数据集或完成 Trace 过滤预估'
    }
    if (
      form.dataSource.type === 'TRACE_FILTER' &&
      form.dataSource.estimatedCount === 0
    ) {
      return 'Trace 命中数量为 0，请调整过滤条件'
    }
    if (form.sampleRate < 1 || form.sampleRate > 100) {
      return '采样率必须在 1% 到 100% 之间'
    }
    if (
      form.badcase.enabled &&
      (form.badcase.threshold === null || Number.isNaN(form.badcase.threshold))
    ) {
      return 'Badcase 阈值必须为数字'
    }
  }
  return ''
}

function isScoreNameValid(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value)
}

function getEstimatedRunCount(sampleCount: number, sampleRate: number) {
  return Math.ceil((sampleCount * sampleRate) / 100)
}

function toMappingTemplate(value: string) {
  return `{{ ${value} }}`
}

function getMappingSelectValue(value?: string) {
  return value?.replace(/^{{\s*/, '').replace(/\s*}}$/, '') ?? ''
}
