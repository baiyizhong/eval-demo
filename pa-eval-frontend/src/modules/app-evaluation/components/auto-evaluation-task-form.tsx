import { useEffect, useState } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from '@radix-ui/react-icons'
import { listTaskEvaluators } from '@/modules/tasks/api/evaluator-api'
import { Info } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { cn, getPageNumbers } from '@/lib/utils'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DateTimeRangePicker } from '@/components/common/date-time/date-time-range-picker'
import {
  fromDateTimePickerValue,
  toDateTimePickerValue,
} from '@/components/common/date-time/date-time-utils'
import { Stepper } from '@/components/common/stepper'
import {
  countProjectAutoEvaluationTraces,
  createProjectAutoEvaluationTask,
  listProjectAutoEvaluationTracePreview,
  type TraceLogRow,
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

const AUTO_EVALUATION_DEFAULT_TRACE_TIME_RANGE = '1d'
const AUTO_EVALUATION_NAME_MAX_LENGTH = 40
const AUTO_EVALUATION_DESCRIPTION_MAX_LENGTH = 200
const AUTO_EVALUATION_TRACE_QUICK_TIME_RANGE_OPTIONS = [
  { label: '1d', value: '1d' },
  { label: '3d', value: '3d' },
  { label: '7d', value: '7d' },
] as const
const TRACE_PREVIEW_PAGE_SIZE = 10
const TRACE_PREVIEW_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const
const AUTO_EVALUATION_SUPPORTED_WORKFLOW_PROVIDERS: readonly string[] = [
  'DIFY',
  'N8N',
]

const initialForm: AutoEvaluationTaskFormInput = {
  name: '',
  description: '',
  scoreName: '',
  scoreMapping: {},
  evaluatorId: '',
  variableMapping: {},
  reportTemplateId: 'default',
  dataSource: createDefaultTraceFilter(),
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
const defaultSampleMappingByVariable: Record<string, string> = {
  input: 'sample.input',
  output: 'sample.output',
  expected_output: 'sample.expectedOutput',
  expectedoutput: 'sample.expectedOutput',
  context: 'sample.context',
  conversation_context: 'sample.context',
  trace_id: 'sample.trace.id',
  observation_id: 'sample.observation.id',
  dataset_item_id: 'sample.datasetItem.id',
  datasetitem_id: 'sample.datasetItem.id',
  metadata: 'sample.metadata',
}
const legacyMappingAliases: Record<string, string> = {
  'trace.input': 'sample.input',
  'dataset.input': 'sample.input',
  'trace.output': 'sample.output',
  'dataset.output': 'sample.output',
  'trace.expectedoutput': 'sample.expectedOutput',
  'dataset.expectedoutput': 'sample.expectedOutput',
  'trace.expected_output': 'sample.expectedOutput',
  'dataset.expected_output': 'sample.expectedOutput',
  'trace.context': 'sample.context',
  'dataset.context': 'sample.context',
  'trace.conversation_context': 'sample.context',
  'dataset.conversation_context': 'sample.context',
  'trace.trace_id': 'sample.trace.id',
  'trace.observation_id': 'sample.observation.id',
  'dataset.dataset_item_id': 'sample.datasetItem.id',
}

const autoEvaluationStepItems = autoEvaluationStepLabels.map(
  (label, index) => ({
    title: label,
    description:
      index === 0
        ? '命名任务并定义评分字段'
        : index === 1
          ? '选择工作流评估器并映射变量'
          : '设置样本来源、采样与报告',
  })
)

export function AutoEvaluationTaskForm({
  projectId,
  onDirtyChange,
  onCompleted,
}: {
  projectId: string
  onDirtyChange?: (dirty: boolean) => void
  onCompleted?: (taskId: string, mode: 'create' | 'run') => void
}) {
  const $api = useAPI()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<AutoEvaluationTaskFormInput>(initialForm)
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
  const [traceCountState, setTraceCountState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [tracePreviewOpen, setTracePreviewOpen] = useState(false)
  const [tracePreviewLoading, setTracePreviewLoading] = useState(false)
  const [tracePreviewError, setTracePreviewError] = useState('')
  const [tracePreviewRows, setTracePreviewRows] = useState<TraceLogRow[]>([])
  const [tracePreviewTotal, setTracePreviewTotal] = useState(0)
  const [tracePreviewPage, setTracePreviewPage] = useState(1)
  const [tracePreviewPageSize, setTracePreviewPageSize] = useState(
    TRACE_PREVIEW_PAGE_SIZE
  )
  const [submittingMode, setSubmittingMode] = useState<'create' | 'run' | null>(
    null
  )

  useEffect(() => {
    void listTaskEvaluators($api, {
      page: 1,
      pageSize: 50,
      keyword: evaluatorKeyword,
      filters: { type: ['WORKFLOW'] },
      sorting: [],
    }).then((result) => {
      setEvaluators(
        result.datas
          .filter(
            (evaluator) =>
              evaluator.type === 'WORKFLOW' &&
              AUTO_EVALUATION_SUPPORTED_WORKFLOW_PROVIDERS.includes(
                evaluator.provider
              )
          )
          .map((evaluator) => ({
            id: evaluator.id,
            name: evaluator.name,
            type: 'WORKFLOW',
            version: evaluator.version,
            variables: evaluator.variables,
            outputVariables: evaluator.outputVariables ?? [],
            outputVariableMappings: evaluator.outputVariableMappings ?? [],
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

  const traceFilterKey =
    form.dataSource.type === 'TRACE_FILTER'
      ? getTraceFilterKey(form.dataSource)
      : ''

  useEffect(() => {
    if (!traceFilterKey) {
      return
    }

    let canceled = false
    const traceFilter = parseTraceFilterKey(traceFilterKey)

    void Promise.resolve()
      .then(() => {
        if (!canceled) setTraceCountState('loading')
        return countProjectAutoEvaluationTraces($api, projectId, traceFilter)
      })
      .then((result) => {
        if (canceled) return
        setTraceCountState('success')
        setForm((current) => {
          if (
            current.dataSource.type !== 'TRACE_FILTER' ||
            getTraceFilterKey(current.dataSource) !== traceFilterKey
          ) {
            return current
          }
          return {
            ...current,
            dataSource: {
              ...current.dataSource,
              estimatedCount: result.count,
            },
          }
        })
      })
      .catch(() => {
        if (canceled) return
        setTraceCountState('error')
        setForm((current) => {
          if (
            current.dataSource.type !== 'TRACE_FILTER' ||
            getTraceFilterKey(current.dataSource) !== traceFilterKey
          ) {
            return current
          }
          return {
            ...current,
            dataSource: { ...current.dataSource, estimatedCount: 0 },
          }
        })
      })

    return () => {
      canceled = true
    }
  }, [$api, projectId, traceFilterKey])

  useEffect(() => {
    if (!tracePreviewOpen || !traceFilterKey) return

    let canceled = false
    const traceFilter = parseTraceFilterKey(traceFilterKey)

    async function loadTracePreview() {
      await Promise.resolve()
      if (canceled) return
      setTracePreviewLoading(true)
      setTracePreviewError('')
      setTracePreviewRows([])

      const pageResult = await listProjectAutoEvaluationTracePreview(
        $api,
        projectId,
        traceFilter,
        { page: tracePreviewPage, pageSize: tracePreviewPageSize }
      )

      if (canceled) return
      setTracePreviewRows(pageResult.datas)
      setTracePreviewTotal(pageResult.total)
    }

    void loadTracePreview()
      .catch(() => {
        if (canceled) return
        setTracePreviewRows([])
        setTracePreviewTotal(0)
        setTracePreviewError('Trace 数据加载失败，请稍后重试')
      })
      .finally(() => {
        if (!canceled) setTracePreviewLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [
    $api,
    projectId,
    traceFilterKey,
    tracePreviewOpen,
    tracePreviewPage,
    tracePreviewPageSize,
  ])

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
    onDirtyChange?.(true)
    setError('')
  }

  const validateStep = () => {
    const message = getStepError(step, form, selectedEvaluator)
    setError(message)
    return !message
  }

  const handleStepChange = (nextStep: number) => {
    if (nextStep <= step) {
      setStep(nextStep)
      setError('')
      return
    }

    for (let index = step; index < nextStep; index += 1) {
      const message = getStepError(index, form, selectedEvaluator)
      if (message) {
        setStep(index)
        setError(message)
        return
      }
    }

    setStep(nextStep)
    setError('')
  }

  const handleSubmit = async (mode: 'create' | 'run') => {
    if (submittingMode) return

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
    setSubmittingMode(mode)
    try {
      const task = await createProjectAutoEvaluationTask($api, projectId, {
        name: form.name,
        description: form.description,
        scoreName: form.scoreName,
        scoreMapping: getBoundScoreMapping(form.scoreMapping),
        evaluatorId: form.evaluatorId,
        sampleRate: form.sampleRate,
        badcase: { ...form.badcase, enabled: true },
        dataSource: form.dataSource,
        variableMapping: form.variableMapping,
        reportTemplateId: form.reportTemplateId,
      })
      onDirtyChange?.(false)
      toast.success(
        mode === 'run' ? '自动评测任务已创建并开始运行' : '自动评测任务已创建'
      )
      if (onCompleted) {
        onCompleted(task.id, mode)
        return
      }
      navigate(
        mode === 'run'
          ? `/projects/${projectId}/evaluation/auto-evaluations/${task.id}`
          : `/projects/${projectId}/evaluation/auto-evaluations`
      )
    } catch (submitError) {
      const message = getSubmitErrorMessage(submitError)
      setError(message)
      toast.error(message)
    } finally {
      setSubmittingMode(null)
    }
  }

  return (
    <div className='flex min-h-full min-w-0 flex-1 flex-col gap-5 overflow-x-clip'>
      <Stepper
        items={autoEvaluationStepItems}
        currentStep={step}
        onStepChange={handleStepChange}
      />

      {error ? (
        <div className='border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm'>
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <section className='bg-card text-card-foreground rounded-lg border p-4'>
          <div className='mb-4 flex flex-col gap-1'>
            <h3 className='text-sm font-semibold'>基础信息</h3>
            <p className='text-muted-foreground text-sm'>
              基础信息会展示在任务列表和报告详情中，评分字段在评估器配置中绑定。
            </p>
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            <Field label='任务名称'>
              <Input
                placeholder='例如：客服回答质量自动评测'
                maxLength={AUTO_EVALUATION_NAME_MAX_LENGTH}
                value={form.name}
                onChange={(event) =>
                  updateForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label='任务描述' className='md:col-span-2'>
              <Textarea
                className='min-h-28 resize-none'
                placeholder='描述本次自动评测的目标、样本范围或执行策略'
                maxLength={AUTO_EVALUATION_DESCRIPTION_MAX_LENGTH}
                value={form.description}
                onChange={(event) =>
                  updateForm({ ...form, description: event.target.value })
                }
              />
            </Field>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className='grid w-full max-w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]'>
          <div className='bg-card text-card-foreground flex min-h-[420px] max-w-full min-w-0 flex-col gap-3 rounded-lg border p-4'>
            <div>
              <h3 className='text-sm font-semibold'>评估器列表</h3>
            </div>
            <Input
              aria-label='搜索评估器'
              placeholder='输入评估器名称或描述'
              value={evaluatorKeyword}
              onChange={(event) => setEvaluatorKeyword(event.target.value)}
            />
            <div className='flex min-h-0 max-h-[min(560px,calc(100vh-320px))] flex-1 flex-col gap-2'>
              {evaluators.map((evaluator) => (
                <button
                  key={evaluator.id}
                  type='button'
                  className={cn(
                    'bg-background w-full min-w-0 rounded-lg border p-3 text-left transition-colors',
                    'hover:border-primary/50 hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                    form.evaluatorId === evaluator.id &&
                      'border-primary bg-primary/5'
                  )}
                  onClick={() =>
                    updateForm({
                      ...form,
                      evaluatorId: evaluator.id,
                      variableMapping: createDefaultVariableMapping(evaluator),
                      scoreMapping: createDefaultScoreMapping(evaluator),
                      scoreName: getPrimaryScoreName(
                        createDefaultScoreMapping(evaluator)
                      ),
                    })
                  }
                >
                  <span className='flex min-w-0 flex-col gap-1'>
                    <span className='truncate font-medium'>
                      {evaluator.name}
                    </span>
                    <span className='text-muted-foreground line-clamp-2 text-xs leading-5'>
                      {evaluator.description || '暂无描述'}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      v{evaluator.version} · {evaluator.variables.length} 个变量
                      {getEvaluatorOutputVariables(evaluator).length
                        ? ` · ${getEvaluatorOutputVariables(evaluator).length} 个输出`
                        : ''}
                    </span>
                  </span>
                </button>
              ))}
              {evaluators.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  暂无匹配的评估器。
                </div>
              ) : null}
            </div>
          </div>

          <div className='bg-card text-card-foreground flex min-h-[420px] max-w-full min-w-0 flex-col gap-4 rounded-lg border p-4'>
            {selectedEvaluator ? (
              <>
                <div className='flex min-w-0 flex-col gap-1'>
                  <h3 className='text-sm font-semibold break-words'>
                    {selectedEvaluator.name}
                  </h3>
                  <p className='text-muted-foreground text-sm leading-6 break-words'>
                    {selectedEvaluator.description || '暂无描述'}
                  </p>
                </div>
                <div className='bg-muted/40 grid gap-3 rounded-lg p-3 text-sm md:grid-cols-3'>
                  <InfoItem label='类型' value={selectedEvaluator.type} />
                  <InfoItem
                    label='版本'
                    value={`v${selectedEvaluator.version}`}
                  />
                  <InfoItem
                    label='变量数量'
                    value={`${selectedEvaluator.variables.length} 个`}
                  />
                </div>
                <div className='flex flex-col gap-3'>
                  <div className='flex flex-col gap-1'>
                    <h4 className='text-sm font-medium'>输入变量绑定</h4>
                    <p className='text-muted-foreground text-sm'>
                      将评估器输入变量绑定到评测样本字段。
                    </p>
                  </div>
                  {selectedEvaluator.variables.map((variable) => (
                    <div
                      key={variable}
                      className='bg-background grid max-w-full min-w-0 gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center'
                    >
                      <Label className='min-w-0 truncate text-sm font-medium'>
                        {variable}
                      </Label>
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
                        <SelectTrigger className='w-full min-w-0'>
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
                    </div>
                  ))}
                </div>
                <div className='flex flex-col gap-3'>
                  <div className='flex flex-col gap-1'>
                    <h4 className='text-sm font-medium'>输出变量绑定</h4>
                    <p className='text-muted-foreground text-sm'>
                      评分指标绑定已在评估器配置中完成，此处仅展示绑定关系。如需调整，请返回评估器页面编辑。
                    </p>
                  </div>
                  {getEvaluatorOutputVariables(selectedEvaluator).length ? (
                    getEvaluatorOutputVariables(selectedEvaluator).map(
                      (variable) => {
                        const mapping = form.scoreMapping[variable]
                        return (
                          <div
                            key={variable}
                            className='bg-background grid max-w-full min-w-0 gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center'
                          >
                            <Label className='min-w-0 truncate text-sm font-medium'>
                              {variable}
                            </Label>
                            <div className='flex min-w-0 items-center gap-2'>
                              <Badge
                                variant={
                                  mapping?.scoreConfigName
                                    ? 'secondary'
                                    : 'outline'
                                }
                                className='max-w-full truncate'
                              >
                                {mapping?.scoreConfigName || '未绑定评分指标'}
                              </Badge>
                              {!mapping?.scoreConfigName ? (
                                <span className='text-muted-foreground min-w-0 truncate text-xs'>
                                  请先在评估器中完成输出变量绑定
                                </span>
                              ) : null}
                            </div>
                          </div>
                        )
                      }
                    )
                  ) : (
                    <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                      当前评估器未定义输出变量。
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className='flex min-h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center'>
                <h3 className='text-sm font-semibold'>请选择评估器</h3>
                <p className='text-muted-foreground max-w-sm text-sm leading-6'>
                  选择后将在这里配置评估器输入变量绑定。
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className='flex flex-col gap-4'>
          <div className='bg-card text-card-foreground rounded-lg border p-4'>
            <div className='mb-4 flex flex-col gap-1'>
              <h3 className='text-sm font-semibold'>评测数据来源</h3>
              <p className='text-muted-foreground text-sm'>
                选择固定数据集，或通过 Trace 过滤条件动态抽样。
              </p>
            </div>
            <Tabs
              value={form.dataSource.type}
              onValueChange={(value) =>
                updateForm({
                  ...form,
                  dataSource:
                    value === 'DATASET'
                      ? { type: 'DATASET', datasetId: '' }
                      : createDefaultTraceFilter(),
                })
              }
            >
              <TabsList className='mb-4'>
                <TabsTrigger value='TRACE_FILTER'>Trace 过滤</TabsTrigger>
                <TabsTrigger value='DATASET'>数据集</TabsTrigger>
              </TabsList>
              <TabsContent
                value='TRACE_FILTER'
                className='grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]'
              >
                <div className='grid gap-4 md:grid-cols-2'>
                  <Field label='时间范围' className='md:col-span-2'>
                    <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end'>
                      <DateTimeRangePicker
                        value={
                          form.dataSource.type === 'TRACE_FILTER'
                            ? form.dataSource.createdAtRange.map(
                                toDateTimePickerValue
                              )
                            : []
                        }
                        showTime
                        timeFormat='HH:mm'
                        startPlaceholder='开始时间'
                        endPlaceholder='结束时间'
                        onChange={(nextValue) => {
                          if (form.dataSource.type !== 'TRACE_FILTER') return
                          updateForm({
                            ...form,
                            dataSource: {
                              ...form.dataSource,
                              timeRange: '',
                              createdAtRange: nextValue.map(
                                fromDateTimePickerValue
                              ),
                            },
                          })
                        }}
                      />
                      <ToggleGroup
                        type='single'
                        variant='outline'
                        size='default'
                        value={
                          form.dataSource.type === 'TRACE_FILTER'
                            ? form.dataSource.timeRange
                            : AUTO_EVALUATION_DEFAULT_TRACE_TIME_RANGE
                        }
                        onValueChange={(value) => {
                          if (form.dataSource.type !== 'TRACE_FILTER' || !value)
                            return
                          const timeRange =
                            value as (typeof AUTO_EVALUATION_TRACE_QUICK_TIME_RANGE_OPTIONS)[number]['value']
                          updateForm({
                            ...form,
                            dataSource: {
                              ...form.dataSource,
                              timeRange,
                              createdAtRange:
                                createTraceDateTimeRange(timeRange),
                            },
                          })
                        }}
                        aria-label='快捷时间范围'
                        className='w-fit'
                      >
                        {AUTO_EVALUATION_TRACE_QUICK_TIME_RANGE_OPTIONS.map(
                          (option) => (
                            <ToggleGroupItem
                              key={option.value}
                              value={option.value}
                              aria-label={`最近 ${option.label}`}
                            >
                              {option.label}
                            </ToggleGroupItem>
                          )
                        )}
                      </ToggleGroup>
                    </div>
                  </Field>
                  <Field label='User ID'>
                    <Input
                      placeholder='可选，按用户标识过滤'
                      value={
                        form.dataSource.type === 'TRACE_FILTER'
                          ? form.dataSource.userId
                          : ''
                      }
                      onChange={(event) =>
                        form.dataSource.type === 'TRACE_FILTER'
                          ? updateForm({
                              ...form,
                              dataSource: {
                                ...form.dataSource,
                                userId: event.target.value,
                              },
                            })
                          : undefined
                      }
                    />
                  </Field>
                  <Field label='Session ID'>
                    <Input
                      placeholder='可选，按 Session ID 过滤'
                      value={
                        form.dataSource.type === 'TRACE_FILTER'
                          ? form.dataSource.sessionId
                          : ''
                      }
                      onChange={(event) =>
                        form.dataSource.type === 'TRACE_FILTER'
                          ? updateForm({
                              ...form,
                              dataSource: {
                                ...form.dataSource,
                                sessionId: event.target.value,
                              },
                            })
                          : undefined
                      }
                    />
                  </Field>
                  <Field label='Tags' className='md:col-span-2'>
                    <Input
                      placeholder='可选，多个标签用逗号分隔'
                      value={
                        form.dataSource.type === 'TRACE_FILTER'
                          ? form.dataSource.tags.join(', ')
                          : ''
                      }
                      onChange={(event) =>
                        form.dataSource.type === 'TRACE_FILTER'
                          ? updateForm({
                              ...form,
                              dataSource: {
                                ...form.dataSource,
                                tags: parseCommaSeparatedValues(
                                  event.target.value
                                ),
                              },
                            })
                          : undefined
                      }
                    />
                  </Field>
                </div>
                <div className='bg-background flex flex-col justify-between gap-3 rounded-lg border p-4'>
                  <div className='flex flex-col gap-1'>
                    <span className='text-sm font-medium'>预估命中</span>
                    <span className='text-muted-foreground text-sm'>
                      运行前先统计符合过滤条件的 Trace 数量。
                    </span>
                    {traceCountState === 'loading' ? (
                      <span className='text-muted-foreground text-xs'>
                        正在统计...
                      </span>
                    ) : null}
                    {traceCountState === 'error' ? (
                      <span className='text-destructive text-xs'>
                        统计失败，请调整条件或稍后重试。
                      </span>
                    ) : null}
                  </div>
                  <div className='flex items-end justify-between gap-3'>
                    <span className='text-2xl font-semibold'>
                      {form.dataSource.type === 'TRACE_FILTER'
                        ? form.dataSource.estimatedCount
                        : 0}
                    </span>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={form.dataSource.type !== 'TRACE_FILTER'}
                      onClick={() => {
                        setTracePreviewPage(1)
                        setTracePreviewOpen(true)
                      }}
                    >
                      查看数据
                    </Button>
                  </div>
                </div>
              </TabsContent>
              <TabsContent
                value='DATASET'
                className='grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]'
              >
                <div className='grid gap-4 md:grid-cols-2'>
                  <Field label='搜索数据集'>
                    <Input
                      placeholder='搜索数据集名称'
                      value={datasetKeyword}
                      onChange={(event) =>
                        setDatasetKeyword(event.target.value)
                      }
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
                        const dataset = datasets.find(
                          (item) => item.id === value
                        )
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
                </div>
                <SummaryPanel
                  title='数据集摘要'
                  items={[
                    ['样本数', `${selectedDataset?.itemCount ?? 0} 条`],
                    ['所属项目', selectedDataset?.projectName ?? '当前项目'],
                    ['预计运行', `${estimatedRunCount} 条`],
                  ]}
                />
              </TabsContent>
            </Tabs>
          </div>

          <div className='bg-card text-card-foreground rounded-lg border p-4'>
            <div className='mb-4 flex flex-col gap-1'>
              <h3 className='text-sm font-semibold'>执行配置</h3>
              <p className='text-muted-foreground text-sm'>
                配置报告模板、采样比例和 Badcase 阈值。
              </p>
            </div>
            <div className='grid gap-4 lg:grid-cols-3'>
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
        </section>
      ) : null}

      <div className='bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 -mx-4 -mb-4 mt-auto flex flex-wrap justify-between gap-2 border-t px-4 py-4 backdrop-blur'>
        <div className='ml-auto flex gap-2'>
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
                disabled={submittingMode !== null}
                onClick={() => void handleSubmit('create')}
              >
                {submittingMode === 'create' ? '创建中...' : '仅创建'}
              </Button>
              <Button
                type='button'
                disabled={submittingMode !== null}
                onClick={() => void handleSubmit('run')}
              >
                {submittingMode === 'run' ? '创建中...' : '创建并运行'}
              </Button>
            </>
          )}
        </div>
      </div>
      <TracePreviewDialog
        open={tracePreviewOpen}
        onOpenChange={setTracePreviewOpen}
        rows={tracePreviewRows}
        total={tracePreviewTotal}
        page={tracePreviewPage}
        pageSize={tracePreviewPageSize}
        loading={tracePreviewLoading}
        error={tracePreviewError}
        onPageChange={setTracePreviewPage}
        onPageSizeChange={(pageSize) => {
          setTracePreviewPageSize(pageSize)
          setTracePreviewPage(1)
        }}
      />
    </div>
  )
}

function Field({
  label,
  description,
  tooltip,
  className,
  children,
}: {
  label: string
  description?: string
  tooltip?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-1.5'>
          <Label>{label}</Label>
          {tooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  aria-label={`${label}说明`}
                  className='text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-4 items-center justify-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none'
                >
                  <Info className='size-3.5' />
                </button>
              </TooltipTrigger>
              <TooltipContent side='top'>{tooltip}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {description ? (
          <span className='text-muted-foreground text-xs leading-5'>
            {description}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className='truncate font-medium'>{value}</span>
    </div>
  )
}

function SummaryPanel({
  title,
  items,
}: {
  title: string
  items: [string, React.ReactNode][]
}) {
  return (
    <div className='bg-background rounded-lg border p-4'>
      <h4 className='mb-3 text-sm font-medium'>{title}</h4>
      <dl className='flex flex-col gap-3'>
        {items.map(([label, value]) => (
          <div key={label} className='flex items-center justify-between gap-3'>
            <dt className='text-muted-foreground text-sm'>{label}</dt>
            <dd className='min-w-0 truncate text-sm font-medium'>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function TracePreviewDialog({
  open,
  onOpenChange,
  rows,
  total,
  page,
  pageSize,
  loading,
  error,
  onPageChange,
  onPageSizeChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: TraceLogRow[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  error: string
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex h-[50svh] max-h-[calc(100svh-2rem)] w-[50vw] max-w-[calc(100vw-2rem)] min-w-[600px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[50vw]'>
        <DialogHeader className='border-b p-6 pb-4 text-start'>
          <DialogTitle>查看 Trace 数据</DialogTitle>
          <DialogDescription>
            当前过滤条件共命中 {total} 条 Trace。
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 flex-1 overflow-auto p-6'>
          {loading ? (
            <div className='text-muted-foreground flex min-h-40 items-center justify-center text-sm'>
              加载 Trace 数据中...
            </div>
          ) : error ? (
            <div className='text-destructive flex min-h-40 items-center justify-center text-sm'>
              {error}
            </div>
          ) : rows.length ? (
            <div className='rounded-md border'>
              <Table className='table-fixed'>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-[30%]'>Trace ID</TableHead>
                    <TableHead className='w-[20%]'>Session ID</TableHead>
                    <TableHead className='w-[12%]'>环境</TableHead>
                    <TableHead className='w-[10%]'>状态</TableHead>
                    <TableHead className='w-[16%]'>用户</TableHead>
                    <TableHead className='w-[12%]'>创建时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((trace) => (
                    <TableRow key={trace.traceId}>
                      <TableCell className='font-medium break-all whitespace-normal'>
                        {trace.traceId}
                      </TableCell>
                      <TableCell className='break-all whitespace-normal'>
                        {trace.sessionId || '-'}
                      </TableCell>
                      <TableCell>{trace.environment || '-'}</TableCell>
                      <TableCell>{trace.status || '-'}</TableCell>
                      <TableCell className='break-all whitespace-normal'>
                        {trace.userId || '-'}
                      </TableCell>
                      <TableCell>{formatDateTime(trace.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className='text-muted-foreground flex min-h-40 items-center justify-center rounded-md border border-dashed text-sm'>
              当前过滤条件下暂无 Trace 数据。
            </div>
          )}
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4'>
          <div className='flex items-center gap-2'>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => onPageSizeChange(Number(value))}
              disabled={loading}
            >
              <SelectTrigger className='h-8 w-[70px]'>
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side='top'>
                <SelectGroup>
                  {TRACE_PREVIEW_PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={`${option}`}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className='text-sm font-medium'>每页行数</span>
          </div>

          <div className='flex flex-wrap items-center gap-3'>
            <span className='text-muted-foreground text-sm'>
              共 {total.toLocaleString()} 条，第 {currentPage} / {totalPages} 页
            </span>
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                className='size-8 p-0'
                disabled={loading || currentPage <= 1}
                onClick={() => onPageChange(1)}
              >
                <span className='sr-only'>跳到第一页</span>
                <DoubleArrowLeftIcon />
              </Button>
              <Button
                type='button'
                variant='outline'
                className='size-8 p-0'
                disabled={loading || currentPage <= 1}
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              >
                <span className='sr-only'>跳到上一页</span>
                <ChevronLeftIcon />
              </Button>
              {pageNumbers.map((pageNumber, index) => (
                <div
                  key={`${pageNumber}-${index}`}
                  className='flex items-center'
                >
                  {pageNumber === '...' ? (
                    <span className='text-muted-foreground px-1 text-sm'>
                      ...
                    </span>
                  ) : (
                    <Button
                      type='button'
                      variant={
                        currentPage === pageNumber ? 'default' : 'outline'
                      }
                      className='h-8 min-w-8 px-2'
                      disabled={loading}
                      onClick={() => onPageChange(pageNumber as number)}
                    >
                      <span className='sr-only'>跳到第 {pageNumber} 页</span>
                      {pageNumber}
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type='button'
                variant='outline'
                className='size-8 p-0'
                disabled={loading || currentPage >= totalPages}
                onClick={() =>
                  onPageChange(Math.min(totalPages, currentPage + 1))
                }
              >
                <span className='sr-only'>跳到下一页</span>
                <ChevronRightIcon />
              </Button>
              <Button
                type='button'
                variant='outline'
                className='size-8 p-0'
                disabled={loading || currentPage >= totalPages}
                onClick={() => onPageChange(totalPages)}
              >
                <span className='sr-only'>跳到最后一页</span>
                <DoubleArrowRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getStepError(
  step: number,
  form: AutoEvaluationTaskFormInput,
  evaluator?: MockAutoEvaluationEvaluator
) {
  if (step === 0) {
    if (!form.name.trim()) return '任务名称不能为空'
    if (form.name.length > AUTO_EVALUATION_NAME_MAX_LENGTH) {
      return '任务名称不能超过40个字'
    }
    if (form.description.length > AUTO_EVALUATION_DESCRIPTION_MAX_LENGTH) {
      return '任务描述不能超过200个字'
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
      return '请完成评估器输入变量绑定'
    }
    const outputVariables = evaluator
      ? getEvaluatorOutputVariables(evaluator)
      : []
    if (!outputVariables.length) return '请先为评估器定义输出变量'
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
      form.badcase.threshold === null ||
      Number.isNaN(form.badcase.threshold)
    ) {
      return 'Badcase 阈值必须为数字'
    }
  }
  return ''
}

function getEstimatedRunCount(sampleCount: number, sampleRate: number) {
  return Math.ceil((sampleCount * sampleRate) / 100)
}

function getEvaluatorOutputVariables(evaluator: MockAutoEvaluationEvaluator) {
  return evaluator.outputVariables?.length
    ? evaluator.outputVariables
    : ['score']
}

function createDefaultScoreMapping(evaluator: MockAutoEvaluationEvaluator) {
  return getEvaluatorScoreMapping(evaluator)
}

function getEvaluatorScoreMapping(evaluator: MockAutoEvaluationEvaluator) {
  const outputVariables = getEvaluatorOutputVariables(evaluator)
  const scoreMappingByVariable = new Map(
    (evaluator.outputVariableMappings ?? [])
      .filter((item) => item.variableName.trim())
      .map((item) => [item.variableName, item])
  )
  return Object.fromEntries(
    outputVariables.map((variable) => {
      const mapping = scoreMappingByVariable.get(variable)
      const scoreConfigName = mapping?.scoreConfigName.trim() ?? ''
      return [
        variable,
        {
          scoreConfigId: mapping?.scoreConfigId?.trim() || scoreConfigName,
          scoreConfigName,
        },
      ]
    })
  )
}

function createDefaultVariableMapping(evaluator: MockAutoEvaluationEvaluator) {
  return Object.fromEntries(
    evaluator.variables.map((variable) => [
      variable,
      toMappingTemplate(findDefaultMappingField(variable)),
    ])
  )
}

function findDefaultMappingField(variable: string) {
  const normalizedVariable = variable.toLowerCase()
  const defaultField = defaultSampleMappingByVariable[normalizedVariable]
  const matchedDefaultField = defaultField
    ? findMappingFieldValue(defaultField)
    : null

  if (matchedDefaultField) {
    return matchedDefaultField
  }

  return (
    sampleFieldOptions.find(
      (field) =>
        field.toLowerCase() === `sample.${normalizedVariable}` ||
        field.toLowerCase().endsWith(`.${normalizedVariable}`)
    ) ??
    sampleFieldOptions[0] ??
    ''
  )
}

function findMappingFieldValue(value: string) {
  return sampleFieldOptions.find(
    (field) => field.toLowerCase() === value.toLowerCase()
  )
}

function getBoundScoreMapping(
  scoreMapping: AutoEvaluationTaskFormInput['scoreMapping']
) {
  return Object.fromEntries(
    Object.entries(scoreMapping).filter(
      ([, mapping]) => mapping.scoreConfigId.trim() !== ''
    )
  )
}

function getPrimaryScoreName(
  scoreMapping: AutoEvaluationTaskFormInput['scoreMapping']
) {
  return (
    Object.values(scoreMapping).find((item) => item.scoreConfigName)
      ?.scoreConfigName ?? 'dify_score'
  )
}

function createDefaultTraceFilter(): Extract<
  AutoEvaluationTaskFormInput['dataSource'],
  { type: 'TRACE_FILTER' }
> {
  return {
    type: 'TRACE_FILTER',
    timeRange: AUTO_EVALUATION_DEFAULT_TRACE_TIME_RANGE,
    createdAtRange: createTraceDateTimeRange(
      AUTO_EVALUATION_DEFAULT_TRACE_TIME_RANGE
    ),
    environments: [],
    userId: '',
    sessionId: '',
    tags: [],
    estimatedCount: 0,
  }
}

function getTraceFilterKey(
  traceFilter: Extract<
    AutoEvaluationTaskFormInput['dataSource'],
    { type: 'TRACE_FILTER' }
  >
) {
  return JSON.stringify({
    type: 'TRACE_FILTER',
    timeRange: traceFilter.timeRange,
    createdAtRange: traceFilter.createdAtRange,
    environments: traceFilter.environments,
    userId: traceFilter.userId,
    sessionId: traceFilter.sessionId,
    tags: traceFilter.tags,
  })
}

function parseTraceFilterKey(
  key: string
): Extract<
  AutoEvaluationTaskFormInput['dataSource'],
  { type: 'TRACE_FILTER' }
> {
  const parsed = JSON.parse(key) as Omit<
    Extract<
      AutoEvaluationTaskFormInput['dataSource'],
      { type: 'TRACE_FILTER' }
    >,
    'estimatedCount'
  >

  return {
    ...parsed,
    estimatedCount: 0,
  }
}

function createTraceDateTimeRange(
  timeRange: (typeof AUTO_EVALUATION_TRACE_QUICK_TIME_RANGE_OPTIONS)[number]['value']
) {
  const days = Number(timeRange.replace('d', ''))
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - days)
  return [toDateTimeLocalValue(start), toDateTimeLocalValue(end)]
}

function toDateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function parseCommaSeparatedValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSubmitErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '')
    if (message) return message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '自动评测任务创建失败，请稍后重试'
}

function toMappingTemplate(value: string) {
  return value ? `{{ ${value} }}` : ''
}

function getMappingSelectValue(value?: string) {
  const rawValue = value?.replace(/^{{\s*/, '').replace(/\s*}}$/, '') ?? ''
  return legacyMappingAliases[rawValue.toLowerCase()] ?? rawValue
}
