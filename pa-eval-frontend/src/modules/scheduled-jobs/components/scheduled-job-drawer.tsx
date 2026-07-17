import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import { useAPI } from '@/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import { Stepper } from '@/components/common/stepper'
import {
  scheduledJobMockDatasets,
  scheduledJobMockEvaluators,
  scheduledJobMockMappingFields,
  scheduledJobMockReportTemplates,
} from '../mock-data'
import {
  calculateNextRunAt,
  createScheduledJobId,
  formatFrequencyLabel,
  getEffectiveSampleCount,
  shouldShowSampleWarning,
} from '../mock-store'
import type {
  ScheduledJobDataSource,
  ScheduledJobDataSourceType,
  ScheduledJobEvaluator,
  ScheduledJobFrequency,
  ScheduledJobFrequencyKind,
  ScheduledJobDatasetOption,
  ScheduledJobRunMode,
  ScheduledJobMappingFieldOption,
  ScheduledJobReportTemplateOption,
  ScheduledJobTask,
  ScheduledJobTraceWindow,
} from '../types'

type ScheduledJobDrawerProps = {
  projectId: string
  open: boolean
  task?: ScheduledJobTask | null
  evaluators?: ScheduledJobEvaluator[]
  datasets?: ScheduledJobDatasetOption[]
  mappingFields?: ScheduledJobMappingFieldOption[]
  reportTemplates?: ScheduledJobReportTemplateOption[]
  onOpenChange: (open: boolean) => void
  onSave: (task: ScheduledJobTask) => void
}

type FrequencyForm = {
  mode: ScheduledJobRunMode
  kind: ScheduledJobFrequencyKind
  runAt: string
  intervalMinutes: number
  intervalHours: number
  timeOfDay: string
  weekdays: number[]
  cronExpression: string
}

type ScheduledJobForm = {
  name: string
  description: string
  scoreName: string
  scoreMapping: NonNullable<ScheduledJobTask['scoreMapping']>
  frequency: FrequencyForm
  evaluatorId: string
  variableMapping: Record<string, string>
  dataSourceType: ScheduledJobDataSourceType
  datasetId: string
  traceTimeRange: string
  traceCreatedAtRange: [string, string]
  traceUserId: string
  traceSessionId: string
  traceTags: string
  traceEstimatedCount: number
  reportTemplateId: string
  sampleRate: number
  badcase: {
    enabled: boolean
    threshold: number | null
  }
}

type TraceCountState = 'idle' | 'loading' | 'success' | 'error'

const steps = [
  { id: 'basic', title: '基础信息' },
  { id: 'config', title: '自动评测配置' },
]

const scheduledJobDrawerSchema = z.object({})
const formId = 'scheduled-job-form'
const traceQuickTimeRangeOptions = [
  { value: '1d', label: '近 1 天' },
  { value: '3d', label: '近 3 天' },
  { value: '7d', label: '近 7 天' },
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

const nowIso = () => new Date().toISOString()

function createDefaultVariableMapping(
  evaluator: ScheduledJobEvaluator,
  mappingFields: ScheduledJobMappingFieldOption[]
) {
  return Object.fromEntries(
    evaluator.variables.map((variable) => [
      variable,
      toMappingTemplate(findDefaultMappingField(variable, mappingFields)),
    ])
  )
}

function getEvaluatorOutputVariables(evaluator: ScheduledJobEvaluator) {
  return evaluator.outputVariables?.length ? evaluator.outputVariables : ['score']
}

function createDefaultScoreMapping(
  evaluator: ScheduledJobEvaluator
) {
  const scoreMappingByVariable = new Map(
    (evaluator.outputVariableMappings ?? [])
      .filter((mapping) => mapping.variableName.trim())
      .map((mapping) => [mapping.variableName, mapping])
  )
  return Object.fromEntries(
    getEvaluatorOutputVariables(evaluator).map((variable) => {
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

function getBoundScoreMapping(
  scoreMapping: NonNullable<ScheduledJobTask['scoreMapping']>
) {
  return Object.fromEntries(
    Object.entries(scoreMapping).filter(
      ([, mapping]) => mapping.scoreConfigId.trim() !== ''
    )
  )
}

function getPrimaryScoreName(
  scoreMapping: NonNullable<ScheduledJobTask['scoreMapping']>
) {
  return Object.values(scoreMapping).find((item) => item.scoreConfigName)
    ?.scoreConfigName ?? 'dify_score'
}

function findDefaultMappingField(
  variable: string,
  mappingFields: ScheduledJobMappingFieldOption[]
) {
  const normalizedVariable = variable.toLowerCase()
  const defaultField = defaultSampleMappingByVariable[normalizedVariable]
  const matchedDefaultField = defaultField
    ? findMappingFieldValue(defaultField, mappingFields)
    : null

  if (matchedDefaultField) {
    return matchedDefaultField
  }

  return (
    mappingFields.find(
      (field) =>
        field.value.toLowerCase() === `sample.${normalizedVariable}` ||
        field.value.toLowerCase().endsWith(`.${normalizedVariable}`)
    )?.value ??
    mappingFields[0]?.value ??
    ''
  )
}

function findMappingFieldValue(
  value: string,
  mappingFields: ScheduledJobMappingFieldOption[]
) {
  return mappingFields.find(
    (field) => field.value.toLowerCase() === value.toLowerCase()
  )?.value
}

function toMappingTemplate(value: string) {
  return value ? `{{ ${value} }}` : ''
}

function getMappingSelectValue(value?: string) {
  const rawValue = value?.replace(/^{{\s*/, '').replace(/\s*}}$/, '') ?? ''
  return legacyMappingAliases[rawValue.toLowerCase()] ?? rawValue
}

function createTraceDateTimeRange(timeRange: string): [string, string] {
  const days = Number(timeRange.replace('d', ''))
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - (Number.isFinite(days) ? days : 1))

  return [
    toDateTimeLocalValue(start.toISOString()),
    toDateTimeLocalValue(end.toISOString()),
  ]
}

function getDefaultDataset(
  projectId: string,
  datasets: ScheduledJobDatasetOption[]
) {
  return (
    datasets.find((dataset) => dataset.projectId === projectId) ?? datasets[0]
  )
}

function frequencyToForm(frequency?: ScheduledJobFrequency): FrequencyForm {
  if (!frequency) {
    return {
      mode: 'ONCE',
      kind: 'ONCE',
      runAt: nowIso(),
      intervalMinutes: 30,
      intervalHours: 1,
      timeOfDay: '01:00',
      weekdays: [1],
      cronExpression: '',
    }
  }

  const base = frequencyToForm()

  switch (frequency.kind) {
    case 'ONCE':
      return { ...base, mode: 'ONCE', kind: 'ONCE', runAt: frequency.runAt }
    case 'EVERY_MINUTES':
      return {
        ...base,
        mode: 'RECURRING',
        kind: 'EVERY_MINUTES',
        intervalMinutes: frequency.intervalMinutes,
      }
    case 'EVERY_HOURS':
      return {
        ...base,
        mode: 'RECURRING',
        kind: 'EVERY_HOURS',
        intervalHours: frequency.intervalHours,
      }
    case 'DAILY':
      return {
        ...base,
        mode: 'RECURRING',
        kind: 'DAILY',
        timeOfDay: frequency.timeOfDay,
      }
    case 'WEEKLY':
      return {
        ...base,
        mode: 'RECURRING',
        kind: 'WEEKLY',
        weekdays: frequency.weekdays,
        timeOfDay: frequency.timeOfDay,
      }
    case 'CRON':
      return {
        ...base,
        mode: 'RECURRING',
        kind: 'CRON',
        cronExpression: frequency.expression,
      }
  }
}

function formToFrequency(form: FrequencyForm): ScheduledJobFrequency {
  if (form.mode === 'ONCE') {
    return { kind: 'ONCE', runAt: form.runAt }
  }

  switch (form.kind) {
    case 'EVERY_MINUTES':
      return { kind: 'EVERY_MINUTES', intervalMinutes: form.intervalMinutes }
    case 'EVERY_HOURS':
      return { kind: 'EVERY_HOURS', intervalHours: form.intervalHours }
    case 'DAILY':
      return { kind: 'DAILY', timeOfDay: form.timeOfDay }
    case 'WEEKLY':
      return {
        kind: 'WEEKLY',
        weekdays: form.weekdays.length ? form.weekdays : [1],
        timeOfDay: form.timeOfDay,
      }
    case 'CRON':
      return {
        kind: 'CRON',
        expression: form.cronExpression,
        description: `高级 cron：${form.cronExpression}`,
      }
    case 'ONCE':
      return { kind: 'EVERY_MINUTES', intervalMinutes: form.intervalMinutes }
  }
}

function buildTraceWindowFromFrequency(
  frequency: ScheduledJobFrequency,
  form: ScheduledJobForm
): ScheduledJobTraceWindow {
  switch (frequency.kind) {
    case 'EVERY_MINUTES':
      return {
        mode: 'ROLLING',
        amount: frequency.intervalMinutes,
        unit: 'minutes',
      }
    case 'EVERY_HOURS':
      return {
        mode: 'ROLLING',
        amount: frequency.intervalHours,
        unit: 'hours',
      }
    case 'DAILY':
      return {
        mode: 'PREVIOUS_DAY',
      }
    case 'WEEKLY':
      return {
        mode: 'ROLLING',
        amount: 7,
        unit: 'days',
      }
    case 'CRON':
      return {
        mode: 'ROLLING',
        amount: 1,
        unit: 'days',
      }
    case 'ONCE':
      return {
        mode: 'FIXED',
        startAt: toIsoFromDateTimeLocal(form.traceCreatedAtRange[0]),
        endAt: toIsoFromDateTimeLocal(form.traceCreatedAtRange[1]),
      }
  }
}

function formatTraceWindowHint(frequency: FrequencyForm) {
  if (frequency.mode === 'ONCE') {
    return '单次执行使用固定时间范围内的 Trace。'
  }

  switch (frequency.kind) {
    case 'EVERY_MINUTES':
      return `每次执行默认取当前整点向前 ${frequency.intervalMinutes} 分钟的增量 Trace。`
    case 'EVERY_HOURS':
      return `每次执行默认取当前整点向前 ${frequency.intervalHours} 小时的增量 Trace。`
    case 'DAILY':
      return '每次执行默认取上一天 0 点到当天 0 点的 Trace。'
    case 'WEEKLY':
      return '每次执行默认取近 7 天的 Trace。'
    case 'CRON':
      return '高级 cron 暂按近 1 天 Trace 预览，后端接入后可按表达式精确推导。'
    case 'ONCE':
      return '单次执行使用固定 Trace 时间范围。'
  }
}

function formatTraceWindowSummary(
  frequency: FrequencyForm,
  estimatedCount: number
) {
  return `${formatTraceWindowHint(frequency)}预估 ${estimatedCount} 条样本。`
}

function createRoundedRollingTraceWindowRange(frequency: FrequencyForm) {
  const end = new Date()

  if (frequency.kind === 'EVERY_HOURS') {
    end.setMinutes(0, 0, 0)
    const start = new Date(end)
    start.setHours(end.getHours() - frequency.intervalHours)
    return [
      toDateTimeLocalValue(start.toISOString()),
      toDateTimeLocalValue(end.toISOString()),
    ]
  }

  end.setSeconds(0, 0)
  const start = new Date(end)
  start.setMinutes(end.getMinutes() - frequency.intervalMinutes)
  return [
    toDateTimeLocalValue(start.toISOString()),
    toDateTimeLocalValue(end.toISOString()),
  ]
}

function getTracePreviewRange(
  frequency: FrequencyForm,
  traceWindow?: ScheduledJobTraceWindow
) {
  if (frequency.mode === 'ONCE') {
    return null
  }

  if (traceWindow?.mode === 'ROLLING') {
    if (traceWindow.unit === 'minutes' || traceWindow.unit === 'hours') {
      return createRoundedRollingTraceWindowRange(frequency)
    }

    const end = new Date()
    const start = new Date(end)
    start.setDate(end.getDate() - (traceWindow.amount ?? 1))
    return [
      toDateTimeLocalValue(start.toISOString()),
      toDateTimeLocalValue(end.toISOString()),
    ]
  }

  const end = new Date()

  if (traceWindow?.mode === 'PREVIOUS_DAY') {
    end.setHours(0, 0, 0, 0)
    const start = new Date(end)
    start.setDate(end.getDate() - 1)
    return [
      toDateTimeLocalValue(start.toISOString()),
      toDateTimeLocalValue(end.toISOString()),
    ]
  }

  return null
}

function getDefaultForm(
  projectId: string,
  task: ScheduledJobTask | null | undefined,
  options: {
    evaluators: ScheduledJobEvaluator[]
    datasets: ScheduledJobDatasetOption[]
    mappingFields: ScheduledJobMappingFieldOption[]
    reportTemplates: ScheduledJobReportTemplateOption[]
  }
) {
  const defaultEvaluator = options.evaluators[0]
  const defaultDataset = getDefaultDataset(projectId, options.datasets)
  const dataSourceType =
    task?.runMode === 'RECURRING' ? 'TRACE_FILTER' : task?.dataSource.type

  return {
    name: task?.name ?? '',
    description: task?.description ?? '',
    scoreName: task?.scoreName ?? '',
    scoreMapping:
      task?.scoreMapping ??
      createDefaultScoreMapping(defaultEvaluator),
    frequency: frequencyToForm(task?.frequency),
    evaluatorId: task?.evaluator.id ?? defaultEvaluator.id,
    variableMapping:
      task?.variableMapping ??
      createDefaultVariableMapping(defaultEvaluator, options.mappingFields),
    dataSourceType: dataSourceType ?? 'TRACE_FILTER',
    datasetId:
      task?.dataSource.type === 'DATASET'
        ? task.dataSource.datasetId
        : (defaultDataset?.id ?? ''),
    traceTimeRange: '1d',
    traceCreatedAtRange:
      task?.dataSource.type === 'TRACE_FILTER' &&
      task.dataSource.traceFilter.createdAtRange
        ? task.dataSource.traceFilter.createdAtRange
        : createTraceDateTimeRange('1d'),
    traceUserId:
      task?.dataSource.type === 'TRACE_FILTER'
        ? task.dataSource.traceFilter.userId
        : '',
    traceSessionId:
      task?.dataSource.type === 'TRACE_FILTER'
        ? task.dataSource.traceFilter.sessionId
        : '',
    traceTags:
      task?.dataSource.type === 'TRACE_FILTER'
        ? task.dataSource.traceFilter.tags.join(', ')
        : '',
    traceEstimatedCount:
      task?.dataSource.type === 'TRACE_FILTER'
        ? task.dataSource.estimatedCount
        : 0,
    reportTemplateId:
      task?.reportTemplateId ??
      options.reportTemplates.find((template) => template.isDefault)?.id ??
      options.reportTemplates[0]?.id ??
      '',
    sampleRate: task?.sampleRate ?? 100,
    badcase: task?.badcase ?? {
      enabled: true,
      threshold: 0.6,
    },
  } satisfies ScheduledJobForm
}

function buildDataSource(
  form: ScheduledJobForm,
  projectId: string,
  frequency: ScheduledJobFrequency,
  datasets: ScheduledJobDatasetOption[],
  traceEstimatedCount = form.traceEstimatedCount
): ScheduledJobDataSource {
  if (form.dataSourceType === 'DATASET') {
    const dataset = getDefaultDataset(projectId, datasets)
    const selectedDataset =
      datasets.find((item) => item.id === form.datasetId) ?? dataset

    return {
      type: 'DATASET',
      datasetId: selectedDataset?.id ?? form.datasetId,
      datasetName: selectedDataset?.name ?? '默认数据集',
      estimatedCount: selectedDataset?.estimatedCount ?? 0,
    }
  }

  return {
    type: 'TRACE_FILTER',
    traceWindow: buildTraceWindowFromFrequency(frequency, form),
    traceFilter: {
      name: '',
      userId: form.traceUserId,
      sessionId: form.traceSessionId,
      tags: parseCommaSeparatedValues(form.traceTags),
      createdAtRange: form.traceCreatedAtRange,
      estimatedCount: traceEstimatedCount,
    },
    estimatedCount: traceEstimatedCount,
  }
}

function buildTraceCountPayload(
  frequencyForm: FrequencyForm,
  frequency: ScheduledJobFrequency,
  form: ScheduledJobForm
) {
  const traceWindow = buildTraceWindowFromFrequency(frequency, form)
  const previewRange = getTracePreviewRange(frequencyForm, traceWindow)
  const createdAtRange =
    frequency.kind === 'ONCE' ? form.traceCreatedAtRange : previewRange

  return {
    type: 'TRACE_FILTER',
    traceName: '',
    traceWindow,
    userId: form.traceUserId,
    sessionId: form.traceSessionId,
    tags: parseCommaSeparatedValues(form.traceTags),
    createdAtRange: [
      toIsoFromDateTimeLocal(createdAtRange?.[0] ?? ''),
      toIsoFromDateTimeLocal(createdAtRange?.[1] ?? ''),
    ].filter(Boolean),
  }
}

function clampSampleRate(value: number) {
  if (Number.isNaN(value)) {
    return 1
  }

  return Math.min(100, Math.max(1, value))
}

function parseCommaSeparatedValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toIsoFromDateTimeLocal(value: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function toDateTimeLocalValue(value: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function isValidIsoDateTime(value: string) {
  if (!value.trim()) {
    return false
  }

  return Number.isFinite(new Date(value).getTime())
}

function isValidPositiveInteger(value: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 1
}

function isValidTimeOfDay(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)

  if (!match) {
    return false
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

function areValidWeekdays(weekdays: number[]) {
  return (
    weekdays.length > 0 &&
    weekdays.every(
      (weekday) =>
        Number.isFinite(weekday) &&
        Number.isInteger(weekday) &&
        weekday >= 0 &&
        weekday <= 6
    )
  )
}

export function ScheduledJobDrawer({
  projectId,
  open,
  task,
  evaluators,
  datasets,
  mappingFields,
  reportTemplates,
  onOpenChange,
  onSave,
}: ScheduledJobDrawerProps) {
  const $api = useAPI()
  const evaluatorOptions = evaluators?.length
    ? evaluators
    : scheduledJobMockEvaluators
  const datasetOptions = datasets?.length ? datasets : scheduledJobMockDatasets
  const mappingFieldOptions = mappingFields?.length
    ? mappingFields
    : scheduledJobMockMappingFields
  const reportTemplateOptions = reportTemplates?.length
    ? reportTemplates
    : scheduledJobMockReportTemplates
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ScheduledJobForm>(() =>
    getDefaultForm(projectId, task, {
      evaluators: evaluatorOptions,
      datasets: datasetOptions,
      mappingFields: mappingFieldOptions,
      reportTemplates: reportTemplateOptions,
    })
  )

  const evaluator = useMemo(
    () =>
      evaluatorOptions.find((item) => item.id === form.evaluatorId) ??
      evaluatorOptions[0],
    [evaluatorOptions, form.evaluatorId]
  )
  const currentFrequency = useMemo(
    () => formToFrequency(form.frequency),
    [form.frequency]
  )
  const traceCountPayload = useMemo(
    () =>
      form.dataSourceType === 'TRACE_FILTER'
        ? buildTraceCountPayload(form.frequency, currentFrequency, form)
        : null,
    [
      currentFrequency,
      form,
    ]
  )
  const traceCountKey = traceCountPayload
    ? JSON.stringify(traceCountPayload)
    : ''
  const traceCountQuery = useQuery({
    queryKey: [
      'scheduled-job-trace-count',
      $api,
      projectId,
      traceCountKey,
      traceCountPayload,
    ],
    queryFn: () =>
      $api.countProjectTraces<{ count: number }>({
        path: { projectId },
        body: { traceFilter: traceCountPayload ?? {} },
      }),
    enabled: Boolean(traceCountPayload && traceCountKey),
  })
  const traceCountState: TraceCountState =
    form.dataSourceType !== 'TRACE_FILTER'
      ? 'idle'
      : traceCountQuery.isLoading || traceCountQuery.isFetching
        ? 'loading'
        : traceCountQuery.isError
          ? 'error'
          : traceCountQuery.data
            ? 'success'
            : 'idle'
  const estimatedCount =
    form.dataSourceType === 'DATASET'
      ? buildDataSource(
          form,
          projectId,
          currentFrequency,
          datasetOptions
        ).estimatedCount
      : traceCountQuery.isError
        ? 0
        : Number(traceCountQuery.data?.count ?? form.traceEstimatedCount)
  const effectiveSampleCount = getEffectiveSampleCount(
    estimatedCount,
    form.sampleRate
  )

  const updateForm = (patch: Partial<ScheduledJobForm>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const updateFrequency = (patch: Partial<FrequencyForm>) => {
    setForm((current) => {
      const nextFrequency = { ...current.frequency, ...patch }
      const nextDataSourceType =
        nextFrequency.mode === 'RECURRING'
          ? 'TRACE_FILTER'
          : current.dataSourceType

      return {
        ...current,
        frequency: nextFrequency,
        dataSourceType: nextDataSourceType,
      }
    })
  }

  const validateBasic = () => {
    if (!form.name.trim()) {
      toast.error('请输入任务名称')
      return false
    }

    if (
      form.frequency.mode === 'ONCE' &&
      !isValidIsoDateTime(form.frequency.runAt)
    ) {
      toast.error('请选择有效的单次执行时间')
      return false
    }

    if (form.frequency.mode === 'RECURRING') {
      if (
        form.frequency.kind === 'EVERY_MINUTES' &&
        !isValidPositiveInteger(form.frequency.intervalMinutes)
      ) {
        toast.error('分钟间隔必须是大于等于 1 的整数')
        return false
      }

      if (
        form.frequency.kind === 'EVERY_HOURS' &&
        !isValidPositiveInteger(form.frequency.intervalHours)
      ) {
        toast.error('小时间隔必须是大于等于 1 的整数')
        return false
      }

      if (
        form.frequency.kind === 'DAILY' &&
        !isValidTimeOfDay(form.frequency.timeOfDay)
      ) {
        toast.error('请选择有效的每天执行时间')
        return false
      }

      if (
        form.frequency.kind === 'WEEKLY' &&
        (!areValidWeekdays(form.frequency.weekdays) ||
          !isValidTimeOfDay(form.frequency.timeOfDay))
      ) {
        toast.error('请选择有效的每周执行星期和时间')
        return false
      }

      if (
        form.frequency.kind === 'CRON' &&
        !form.frequency.cronExpression.trim()
      ) {
        toast.error('请输入高级 cron 表达式')
        return false
      }
    }

    return true
  }

  const validateConfig = () => {
    if (!form.evaluatorId) {
      toast.error('请选择评测器')
      return false
    }

    if (
      evaluator.variables.some((variable) => !form.variableMapping[variable])
    ) {
      toast.error('请完成评估器变量映射')
      return false
    }

    const outputVariables = getEvaluatorOutputVariables(evaluator)
    if (!outputVariables.length) {
      toast.error('请先为评估器定义输出变量')
      return false
    }

    if (!form.dataSourceType) {
      toast.error('请选择数据来源')
      return false
    }

    if (!form.reportTemplateId) {
      toast.error('请选择报告模板')
      return false
    }

    if (
      form.badcase.enabled &&
      (form.badcase.threshold === null || Number.isNaN(form.badcase.threshold))
    ) {
      toast.error('请输入有效的 Badcase 阈值')
      return false
    }

    if (
      form.dataSourceType === 'TRACE_FILTER' &&
      form.frequency.mode === 'ONCE' &&
      (!form.traceCreatedAtRange[0] || !form.traceCreatedAtRange[1])
    ) {
      toast.error('请选择 Trace 固定时间范围')
      return false
    }

    return true
  }

  const handleConfirm = async () => {
    if (step === 0) {
      if (validateBasic()) {
        setStep(1)
      }
      return
    }

    if (!validateBasic() || !validateConfig()) {
      return
    }

    if (form.dataSourceType === 'TRACE_FILTER' && estimatedCount === 0) {
      const shouldContinue = await confirm({
        title: '当前筛选无样本',
        desc:
          '当前 Trace 筛选条件没有匹配到可评测样本，保存后任务执行时可能失败。是否继续保存？',
        confirmText: '继续保存',
        cancelBtnText: '返回调整',
      })

      if (!shouldContinue) {
        return
      }
    }

    const frequency = currentFrequency
    const frequencyWithLabel = {
      ...frequency,
      label: formatFrequencyLabel(frequency),
    }
    const formWithEstimatedCount = {
      ...form,
      traceEstimatedCount: estimatedCount,
    }
    const savedTask: ScheduledJobTask = {
      id: task?.id ?? createScheduledJobId(),
      projectId,
      type: 'AUTO_EVALUATION',
      name: form.name.trim(),
      description: form.description.trim(),
      scoreName: form.scoreName.trim() || getPrimaryScoreName(form.scoreMapping),
      scoreMapping: getBoundScoreMapping(form.scoreMapping),
      runMode: form.frequency.mode,
      frequency: frequencyWithLabel,
      status: task?.status ?? 'NOT_STARTED',
      dataSource: buildDataSource(
        formWithEstimatedCount,
        projectId,
        frequency,
        datasetOptions,
        estimatedCount
      ),
      evaluator: evaluator as ScheduledJobEvaluator,
      variableMapping: form.variableMapping,
      reportTemplateId: form.reportTemplateId,
      sampleRate: form.sampleRate,
      badcase: form.badcase,
      nextRunAt:
        task?.status === 'PAUSED' ? null : calculateNextRunAt(frequency),
      lastRunAt: task?.lastRunAt ?? null,
      createdBy: task?.createdBy ?? 'PA Admin',
      createdAt: task?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    }

    onSave(savedTask)
    onOpenChange(false)
  }

  const handleCancel = () => {
    if (step === 1) {
      setStep(0)
      return
    }

    onOpenChange(false)
  }

  return (
    <Drawer
      mode='enhanced'
      showOverlay={true}
      open={open}
      onOpenChange={onOpenChange}
      title={task ? '编辑定时任务' : '创建定时任务'}
      showConfirm={false}
      showCancel={false}
    >
      <BaseForm
        id={formId}
        schema={scheduledJobDrawerSchema}
        defaultValues={{}}
        onSubmit={handleConfirm}
        className='flex flex-col gap-6'
      >
        <Stepper items={steps} currentStep={step} />

        {step === 0 ? (
          <BasicStep
            form={form}
            updateForm={updateForm}
            updateFrequency={updateFrequency}
          />
        ) : (
          <ConfigStep
            form={form}
            evaluator={evaluator}
            estimatedCount={estimatedCount}
            effectiveSampleCount={effectiveSampleCount}
            traceCountState={traceCountState}
            projectId={projectId}
            evaluators={evaluatorOptions}
            datasets={datasetOptions}
            mappingFields={mappingFieldOptions}
            reportTemplates={reportTemplateOptions}
            updateForm={updateForm}
          />
        )}
        <div className='border-border flex justify-end gap-2 border-t pt-4'>
          <Button type='button' variant='outline' onClick={handleCancel}>
            {step === 0 ? '取消' : '上一步'}
          </Button>
          <Button type='submit' form={formId}>
            {step === 0 ? '下一步' : '保存'}
          </Button>
        </div>
      </BaseForm>
    </Drawer>
  )
}

type StepProps = {
  form: ScheduledJobForm
  updateForm: (patch: Partial<ScheduledJobForm>) => void
  updateFrequency: (patch: Partial<FrequencyForm>) => void
}

function BasicStep({ form, updateForm, updateFrequency }: StepProps) {
  return (
    <div className='grid gap-5'>
      <Field label='任务类型'>
        <Select value='AUTO_EVALUATION' disabled>
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='自动评测' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='AUTO_EVALUATION'>自动评测</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <BasicCard>
        <div className='grid gap-4 md:grid-cols-2'>
          <Field label='任务名称'>
            <Input
              value={form.name}
              placeholder='输入任务名称'
              onChange={(event) => updateForm({ name: event.target.value })}
            />
          </Field>

          <Field label='任务描述' className='md:col-span-2'>
            <Textarea
              className='min-h-24 resize-none'
              value={form.description}
              placeholder='说明任务用途'
              onChange={(event) =>
                updateForm({ description: event.target.value })
              }
            />
          </Field>
        </div>
      </BasicCard>

      <BasicCard>
        <div className='grid gap-4'>
          <Field label='执行频率'>
            <ToggleGroup
              type='single'
              variant='outline'
              className='w-full'
              value={form.frequency.mode}
              onValueChange={(value) => {
                if (value === 'ONCE' || value === 'RECURRING') {
                  updateFrequency({
                    mode: value,
                    kind: value === 'ONCE' ? 'ONCE' : 'EVERY_MINUTES',
                  })
                }
              }}
            >
              <ToggleGroupItem value='ONCE' className='flex-1'>
                单次执行
              </ToggleGroupItem>
              <ToggleGroupItem value='RECURRING' className='flex-1'>
                周期性执行
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          {form.frequency.mode === 'ONCE' ? (
            <Field label='执行时间'>
              <Input
                type='datetime-local'
                value={toDateTimeLocalValue(form.frequency.runAt)}
                onChange={(event) =>
                  updateFrequency({
                    runAt: toIsoFromDateTimeLocal(event.target.value),
                  })
                }
              />
            </Field>
          ) : (
            <div className='grid gap-4 rounded-md border p-4'>
              <Field label='周期规则'>
                <Select
                  value={form.frequency.kind}
                  onValueChange={(value) =>
                    updateFrequency({
                      kind: value as ScheduledJobFrequencyKind,
                    })
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='EVERY_MINUTES'>每 N 分钟</SelectItem>
                      <SelectItem value='EVERY_HOURS'>每 N 小时</SelectItem>
                      <SelectItem value='DAILY'>每天几点</SelectItem>
                      <SelectItem value='WEEKLY'>每周几几点</SelectItem>
                      <SelectItem value='CRON'>高级 cron</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              {form.frequency.kind === 'EVERY_MINUTES' ? (
                <Field label='分钟间隔'>
                  <Input
                    type='number'
                    min={1}
                    value={form.frequency.intervalMinutes}
                    onChange={(event) =>
                      updateFrequency({
                        intervalMinutes: Number(event.target.value),
                      })
                    }
                  />
                </Field>
              ) : null}

              {form.frequency.kind === 'EVERY_HOURS' ? (
                <Field label='小时间隔'>
                  <Input
                    type='number'
                    min={1}
                    value={form.frequency.intervalHours}
                    onChange={(event) =>
                      updateFrequency({
                        intervalHours: Number(event.target.value),
                      })
                    }
                  />
                </Field>
              ) : null}

              {form.frequency.kind === 'DAILY' ||
              form.frequency.kind === 'WEEKLY' ? (
                <Field label='执行时间点'>
                  <Input
                    type='time'
                    value={form.frequency.timeOfDay}
                    onChange={(event) =>
                      updateFrequency({ timeOfDay: event.target.value })
                    }
                  />
                </Field>
              ) : null}

              {form.frequency.kind === 'WEEKLY' ? (
                <Field label='执行星期'>
                  <Select
                    value={String(form.frequency.weekdays[0] ?? 1)}
                    onValueChange={(value) =>
                      updateFrequency({ weekdays: [Number(value)] })
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='1'>周一</SelectItem>
                      <SelectItem value='2'>周二</SelectItem>
                      <SelectItem value='3'>周三</SelectItem>
                      <SelectItem value='4'>周四</SelectItem>
                      <SelectItem value='5'>周五</SelectItem>
                      <SelectItem value='6'>周六</SelectItem>
                      <SelectItem value='0'>周日</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              {form.frequency.kind === 'CRON' ? (
                <Field label='高级 cron'>
                  <Input
                    value={form.frequency.cronExpression}
                    placeholder='例如 0 1 * * *'
                    onChange={(event) =>
                      updateFrequency({ cronExpression: event.target.value })
                    }
                  />
                </Field>
              ) : null}
            </div>
          )}
        </div>
      </BasicCard>
    </div>
  )
}

type ConfigStepProps = {
  form: ScheduledJobForm
  evaluator: ScheduledJobEvaluator
  estimatedCount: number
  effectiveSampleCount: number
  traceCountState: TraceCountState
  projectId: string
  evaluators: ScheduledJobEvaluator[]
  datasets: ScheduledJobDatasetOption[]
  mappingFields: ScheduledJobMappingFieldOption[]
  reportTemplates: ScheduledJobReportTemplateOption[]
  updateForm: (patch: Partial<ScheduledJobForm>) => void
}

function ConfigStep({
  form,
  evaluator,
  estimatedCount,
  effectiveSampleCount,
  traceCountState,
  projectId,
  evaluators,
  datasets: datasetOptions,
  mappingFields,
  reportTemplates,
  updateForm,
}: ConfigStepProps) {
  const [evaluatorKeyword, setEvaluatorKeyword] = useState('')
  const datasets = datasetOptions.filter(
    (dataset) => dataset.projectId === projectId
  )
  const selectedDataset =
    (datasets.length ? datasets : datasetOptions).find(
      (dataset) => dataset.id === form.datasetId
    ) ?? null
  const normalizedEvaluatorKeyword = evaluatorKeyword.trim().toLowerCase()
  const filteredEvaluators = evaluators.filter((item) => {
    if (!normalizedEvaluatorKeyword) {
      return true
    }

    return [item.name, item.description, item.provider, ...item.variables].some(
      (value) => value.toLowerCase().includes(normalizedEvaluatorKeyword)
    )
  })
  const tracePreviewFrequency = formToFrequency(form.frequency)
  const tracePreviewRange = getTracePreviewRange(
    form.frequency,
    buildTraceWindowFromFrequency(tracePreviewFrequency, form)
  )
  const traceCountHelperText =
    traceCountState === 'loading'
      ? '正在按当前筛选条件统计 Trace 样本...'
      : traceCountState === 'error'
        ? 'Trace 样本统计失败，请检查筛选条件或稍后重试。'
        : traceCountState === 'success'
          ? '已按当前筛选条件完成 Trace 样本统计。'
          : ''
  const estimatedCountValue =
    form.dataSourceType === 'TRACE_FILTER' && traceCountState === 'loading'
      ? '统计中'
      : estimatedCount

  return (
    <div className='grid gap-5'>
      <SectionCard
        title='选择评估器'
        description='选择一个工作流评估器用于定时自动评测，并确认变量映射。'
      >
        <div className='grid gap-4 md:grid-cols-[minmax(220px,280px)_1fr]'>
          <div className='flex flex-col gap-3'>
            <div className='flex flex-col gap-1'>
              <h3 className='text-sm font-semibold'>评估器列表</h3>
              <p className='text-muted-foreground text-sm'>
                选择一个工作流评估器用于定时自动评测。
              </p>
            </div>
            <Input
              value={evaluatorKeyword}
              placeholder='搜索评估器'
              onChange={(event) => setEvaluatorKeyword(event.target.value)}
            />
            <div className='flex flex-col gap-2'>
              {filteredEvaluators.map((item) => (
                <button
                  key={item.id}
                  type='button'
                  className={cn(
                    'bg-background rounded-lg border p-3 text-left transition-colors',
                    'hover:border-primary/50 hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                    form.evaluatorId === item.id
                      ? 'border-primary bg-primary/5'
                      : ''
                  )}
                  onClick={() =>
                    updateForm({
                      evaluatorId: item.id,
                      variableMapping: createDefaultVariableMapping(
                        item,
                        mappingFields
                      ),
                      scoreMapping: createDefaultScoreMapping(item),
                      scoreName: getPrimaryScoreName(createDefaultScoreMapping(item)),
                    })
                  }
                >
                  <span className='flex flex-col gap-1'>
                    <span className='font-medium'>{item.name}</span>
                    <span className='text-muted-foreground line-clamp-2 text-xs leading-5'>
                      {item.description || '暂无描述'}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {item.provider} · {item.variables.length} 个变量
                      {getEvaluatorOutputVariables(item).length
                        ? ` · ${getEvaluatorOutputVariables(item).length} 个输出`
                        : ''}
                    </span>
                  </span>
                </button>
              ))}
              {filteredEvaluators.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  暂无匹配的评估器。
                </div>
              ) : null}
            </div>
          </div>

          <div className='bg-background flex flex-col gap-4 rounded-lg border p-4'>
            <div className='flex flex-col gap-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <h3 className='text-sm font-semibold'>{evaluator.name}</h3>
                <Badge variant='secondary'>{evaluator.provider}</Badge>
              </div>
              <p className='text-muted-foreground text-sm leading-6'>
                {evaluator.description || '暂无描述'}
              </p>
            </div>
            <div className='bg-muted/40 grid gap-3 rounded-lg p-3 text-sm sm:grid-cols-2'>
              <InfoItem label='类型' value='WORKFLOW' />
              <InfoItem
                label='变量数量'
                value={`${evaluator.variables.length} 个`}
              />
            </div>
            <div className='flex flex-col gap-3'>
              <div className='flex items-center gap-2'>
                <h4 className='text-sm font-medium'>变量映射</h4>
                <Badge variant='secondary'>自动匹配</Badge>
              </div>
              <div className='grid gap-2'>
                {evaluator.variables.map((variable) => (
                  <div
                    key={variable}
                    className='grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[minmax(120px,180px)_1fr] sm:items-center'
                  >
                    <span className='font-medium'>{variable}</span>
                    <Select
                      value={getMappingSelectValue(
                        form.variableMapping[variable]
                      )}
                      onValueChange={(value) =>
                        updateForm({
                          variableMapping: {
                            ...form.variableMapping,
                            [variable]: toMappingTemplate(value),
                          },
                        })
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='选择映射字段' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {mappingFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className='flex flex-col gap-1 pt-2'>
                <h4 className='text-sm font-medium'>输出变量绑定</h4>
                <p className='text-muted-foreground text-sm'>
                  评分指标绑定已在评估器配置中完成，此处仅展示绑定关系。如需调整，请返回评估器页面编辑。
                </p>
              </div>
              <div className='grid gap-2'>
                {getEvaluatorOutputVariables(evaluator).map((variable) => {
                  const mapping = form.scoreMapping[variable]
                  return (
                    <div
                      key={variable}
                      className='grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[minmax(120px,180px)_1fr] sm:items-center'
                    >
                      <span className='font-medium'>{variable}</span>
                      <div className='flex min-w-0 items-center gap-2'>
                        <Badge
                          variant={
                            mapping?.scoreConfigName ? 'secondary' : 'outline'
                          }
                          className='max-w-full truncate'
                        >
                          {mapping?.scoreConfigName || '未绑定评分指标'}
                        </Badge>
                        {!mapping?.scoreConfigName ? (
                          <span className='text-muted-foreground text-xs'>
                            请先在评估器中完成输出变量绑定
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title='选择评测数据来源'
        description='选择 Trace 过滤规则或固定数据集。'
      >
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <ToggleGroup
              type='single'
              variant='outline'
              className='w-full'
              value={form.dataSourceType}
              onValueChange={(value) => {
                if (value === 'TRACE_FILTER' || value === 'DATASET') {
                  updateForm({ dataSourceType: value })
                }
              }}
            >
              <ToggleGroupItem value='TRACE_FILTER' className='flex-1'>
                Trace 过滤
              </ToggleGroupItem>
              <ToggleGroupItem
                value='DATASET'
                className='flex-1'
                disabled={form.frequency.mode === 'RECURRING'}
              >
                数据集
              </ToggleGroupItem>
            </ToggleGroup>
            {form.frequency.mode === 'RECURRING' ? (
              <p className='text-muted-foreground text-xs'>
                周期性执行只支持 Trace 过滤。
              </p>
            ) : null}
          </div>

          {form.dataSourceType === 'DATASET' ? (
            <div className='grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]'>
              <Field label='数据集'>
                <Select
                  value={form.datasetId}
                  onValueChange={(value) => updateForm({ datasetId: value })}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='选择数据集' />
                  </SelectTrigger>
                  <SelectContent>
                    {(datasets.length ? datasets : datasetOptions).map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <SummaryPanel
                title='数据集摘要'
                items={[
                  ['数据集', selectedDataset?.name ?? '未选择'],
                  ['样本数', `${selectedDataset?.estimatedCount ?? 0} 条`],
                ]}
              />
            </div>
          ) : (
            <div className='grid gap-4'>
              {form.frequency.mode === 'ONCE' ? (
                <Field label='固定时间范围'>
                  <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end'>
                    <div className='grid gap-3 sm:grid-cols-2'>
                      <Input
                        type='datetime-local'
                        aria-label='开始时间'
                        value={form.traceCreatedAtRange[0]}
                        onChange={(event) =>
                          updateForm({
                            traceTimeRange: '',
                            traceCreatedAtRange: [
                              event.target.value,
                              form.traceCreatedAtRange[1],
                            ],
                          })
                        }
                      />
                      <Input
                        type='datetime-local'
                        aria-label='结束时间'
                        value={form.traceCreatedAtRange[1]}
                        onChange={(event) =>
                          updateForm({
                            traceTimeRange: '',
                            traceCreatedAtRange: [
                              form.traceCreatedAtRange[0],
                              event.target.value,
                            ],
                          })
                        }
                      />
                    </div>
                    <ToggleGroup
                      type='single'
                      variant='outline'
                      value={form.traceTimeRange}
                      onValueChange={(value) => {
                        if (!value) return
                        updateForm({
                          traceTimeRange: value,
                          traceCreatedAtRange: createTraceDateTimeRange(value),
                        })
                      }}
                      aria-label='快捷时间范围'
                      className='w-fit'
                    >
                      {traceQuickTimeRangeOptions.map((option) => (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          aria-label={option.label}
                        >
                          {option.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <p className='text-muted-foreground text-sm'>
                    {formatTraceWindowSummary(
                      form.frequency,
                      estimatedCount
                    )}
                  </p>
                  {traceCountHelperText ? (
                    <p
                      className={cn(
                        'text-xs',
                        traceCountState === 'error'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                    >
                      {traceCountHelperText}
                    </p>
                  ) : null}
                </Field>
              ) : (
                <Field label='Trace 数据范围'>
                  <div className='bg-muted/30 rounded-md border p-3 text-sm'>
                    {formatTraceWindowSummary(
                      form.frequency,
                      estimatedCount
                    )}
                    {tracePreviewRange ? (
                      <span className='text-muted-foreground block'>
                        预览：{tracePreviewRange[0]} - {tracePreviewRange[1]}
                      </span>
                    ) : null}
                  </div>
                  {traceCountHelperText ? (
                    <p
                      className={cn(
                        'text-xs',
                        traceCountState === 'error'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                    >
                      {traceCountHelperText}
                    </p>
                  ) : null}
                </Field>
              )}

              <div className='grid gap-4 md:grid-cols-2'>
                <Field label='User ID'>
                  <Input
                    value={form.traceUserId}
                    placeholder='可选，按用户标识过滤'
                    onChange={(event) =>
                      updateForm({ traceUserId: event.target.value })
                    }
                  />
                </Field>
                <Field label='Session ID'>
                  <Input
                    value={form.traceSessionId}
                    placeholder='可选，按 Session ID 过滤'
                    onChange={(event) =>
                      updateForm({ traceSessionId: event.target.value })
                    }
                  />
                </Field>
                <Field label='Tags'>
                  <Input
                    value={form.traceTags}
                    placeholder='可选，多个标签用逗号分隔'
                    onChange={(event) =>
                      updateForm({ traceTags: event.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title='执行配置'
        description='配置报告模板、采样比例和 Badcase 规则。'
      >
        <div className='grid gap-4'>
          <div className='grid gap-4 lg:grid-cols-4'>
            <Field label='报告模板'>
              <Select
                value={form.reportTemplateId}
                onValueChange={(value) =>
                  updateForm({ reportTemplateId: value })
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

            <Field label='抽样比例'>
              <Input
                type='number'
                min={1}
                max={100}
                value={form.sampleRate}
                onChange={(event) =>
                  updateForm({
                    sampleRate: clampSampleRate(Number(event.target.value)),
                  })
                }
              />
            </Field>

            <Field label='Badcase'>
              <div className='flex h-9 items-center gap-2 rounded-md border px-3'>
                <Switch
                  checked={form.badcase.enabled}
                  onCheckedChange={(checked) =>
                    updateForm({
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
                disabled={!form.badcase.enabled}
                value={form.badcase.threshold ?? ''}
                onChange={(event) =>
                  updateForm({
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

          <div className='grid gap-3 text-sm sm:grid-cols-2'>
            <SummaryStat label='预估样本量' value={estimatedCountValue} />
            <SummaryStat label='生效样本量' value={effectiveSampleCount} />
          </div>

          {shouldShowSampleWarning(estimatedCount, form.sampleRate) ? (
            <Alert>
              <AlertTriangle className='size-4' />
              <AlertDescription>
                当前配置将处理超过 1000 条样本，请确认评测器吞吐和成本预算。
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </SectionCard>
    </div>
  )
}

function BasicCard({ children }: { children: React.ReactNode }) {
  return (
    <section className='bg-card text-card-foreground rounded-lg border p-4'>
      {children}
    </section>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className='bg-card text-card-foreground rounded-lg border p-4'>
      <div className='mb-4 flex flex-col gap-1'>
        <h3 className='text-sm font-semibold'>{title}</h3>
        <p className='text-muted-foreground text-sm leading-6'>{description}</p>
      </div>
      {children}
    </section>
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
      <div className='grid gap-2 text-sm'>
        {items.map(([label, value]) => (
          <div key={label} className='flex items-center justify-between gap-3'>
            <span className='text-muted-foreground'>{label}</span>
            <span className='truncate font-medium'>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className='bg-background rounded-md border p-4'>
      <div className='text-muted-foreground'>{label}</div>
      <div className='mt-1 text-lg font-semibold'>{value}</div>
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
    <div className={cn('grid gap-2', className)}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
