import { useMemo, useState } from 'react'
import { z } from 'zod'
import type { SceneRecord } from '@/modules/scene-experiments/types'
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Database,
  FlaskConical,
  Search,
  Webhook,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BaseForm } from '@/components/common/base-form'
import { DateTimePicker } from '@/components/common/date-time/date-time-picker'
import {
  fromDateTimePickerValue,
  toDateTimePickerValue,
} from '@/components/common/date-time/date-time-utils'
import { Drawer } from '@/components/common/drawer'
import { Stepper } from '@/components/common/stepper'
import {
  scheduledJobMockAutoEvaluationTasks,
  scheduledJobMockEvaluators,
} from '../mock-data'
import { calculateNextRunAt, createScheduledJobId } from '../mock-store'
import type {
  ScheduledJobAutoEvaluationOption,
  ScheduledJobFrequency,
  ScheduledJobFrequencyKind,
  ScheduledJobRunMode,
  ScheduledJobTask,
  ScheduledJobTaskType,
} from '../types'

type ScheduledJobDrawerProps = {
  projectId: string
  open: boolean
  task?: ScheduledJobTask | null
  autoEvaluationTasks?: ScheduledJobAutoEvaluationOption[]
  scenes?: SceneRecord[]
  scenesLoading?: boolean
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
  type: ScheduledJobTaskType
  name: string
  description: string
  boundTargetId: string
  frequency: FrequencyForm
}

const steps = [
  { id: 'basic', title: '基础信息', description: '定义任务类型与用途' },
  { id: 'binding', title: '绑定任务', description: '选择本次调度对象' },
  { id: 'schedule', title: '调度配置', description: '设置执行周期与时间' },
]
const schema = z.object({})
const formId = 'scheduled-job-form'
const NAME_MAX_LENGTH = 40
const DESCRIPTION_MAX_LENGTH = 200

const nowIso = () => new Date().toISOString()

function frequencyToForm(frequency?: ScheduledJobFrequency): FrequencyForm {
  const base: FrequencyForm = {
    mode: 'RECURRING',
    kind: 'DAILY',
    runAt: nowIso(),
    intervalMinutes: 30,
    intervalHours: 1,
    timeOfDay: '01:00',
    weekdays: [1],
    cronExpression: '',
  }

  if (!frequency) return base

  switch (frequency.kind) {
    case 'ONCE':
      return { ...base, mode: 'ONCE', kind: 'ONCE', runAt: frequency.runAt }
    case 'EVERY_MINUTES':
      return {
        ...base,
        kind: frequency.kind,
        intervalMinutes: frequency.intervalMinutes,
      }
    case 'EVERY_HOURS':
      return {
        ...base,
        kind: frequency.kind,
        intervalHours: frequency.intervalHours,
      }
    case 'DAILY':
      return { ...base, kind: frequency.kind, timeOfDay: frequency.timeOfDay }
    case 'WEEKLY':
      return {
        ...base,
        kind: frequency.kind,
        weekdays: frequency.weekdays,
        timeOfDay: frequency.timeOfDay,
      }
    case 'CRON':
      return {
        ...base,
        kind: frequency.kind,
        cronExpression: frequency.expression,
      }
  }
}

function formToFrequency(form: FrequencyForm): ScheduledJobFrequency {
  if (form.mode === 'ONCE') return { kind: 'ONCE', runAt: form.runAt }

  switch (form.kind) {
    case 'EVERY_MINUTES':
      return { kind: 'EVERY_MINUTES', intervalMinutes: form.intervalMinutes }
    case 'EVERY_HOURS':
      return { kind: 'EVERY_HOURS', intervalHours: form.intervalHours }
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
    case 'DAILY':
    case 'ONCE':
      return { kind: 'DAILY', timeOfDay: form.timeOfDay }
  }
}

function getDefaultForm(task?: ScheduledJobTask | null): ScheduledJobForm {
  return {
    type: task?.type ?? 'AUTO_EVALUATION',
    name: task?.name ?? '',
    description: task?.description ?? '',
    boundTargetId: task?.binding?.targetId ?? '',
    frequency: frequencyToForm(task?.frequency),
  }
}

export function ScheduledJobDrawer({
  projectId,
  open,
  task,
  autoEvaluationTasks = scheduledJobMockAutoEvaluationTasks,
  scenes = [],
  scenesLoading = false,
  onOpenChange,
  onSave,
}: ScheduledJobDrawerProps) {
  const [step, setStep] = useState(0)
  const [bindingKeyword, setBindingKeyword] = useState('')
  const [form, setForm] = useState<ScheduledJobForm>(() => getDefaultForm(task))

  const schedulableAutoEvaluationTasks = useMemo(
    () =>
      autoEvaluationTasks.filter(
        (task) =>
          task.projectId === projectId && task.supportsScheduledExecution
      ),
    [autoEvaluationTasks, projectId]
  )
  const availableScenes = useMemo(
    () =>
      scenes.filter((scene) => scene.projectId === projectId && scene.enabled),
    [projectId, scenes]
  )
  const normalizedKeyword = bindingKeyword.trim().toLowerCase()
  const filteredAutoEvaluationTasks = schedulableAutoEvaluationTasks.filter(
    (task) =>
      !normalizedKeyword ||
      [task.name, task.description, task.evaluator.name, task.scoreName].some(
        (value) => value.toLowerCase().includes(normalizedKeyword)
      )
  )
  const filteredScenes = availableScenes.filter(
    (scene) =>
      !normalizedKeyword ||
      [scene.name, scene.description, scene.datasetId].some((value) =>
        value.toLowerCase().includes(normalizedKeyword)
      )
  )
  const selectedAutoEvaluationTask = schedulableAutoEvaluationTasks.find(
    (item) => item.id === form.boundTargetId
  )
  const selectedScene = availableScenes.find(
    (item) => item.id === form.boundTargetId
  )

  const updateForm = (patch: Partial<ScheduledJobForm>) => {
    setForm((current) => ({ ...current, ...patch }))
  }
  const updateFrequency = (patch: Partial<FrequencyForm>) => {
    setForm((current) => ({
      ...current,
      frequency: { ...current.frequency, ...patch },
    }))
  }
  const changeTaskType = (type: ScheduledJobTaskType) => {
    setBindingKeyword('')
    setForm((current) => ({ ...current, type, boundTargetId: '' }))
  }

  const validateBasic = () => {
    if (!form.name.trim()) {
      toast.error('请输入任务名称')
      return false
    }
    if (form.name.length > NAME_MAX_LENGTH) {
      toast.error('任务名称不能超过40个字')
      return false
    }
    if (form.description.length > DESCRIPTION_MAX_LENGTH) {
      toast.error('任务描述不能超过200个字')
      return false
    }
    return true
  }

  const validateBinding = () => {
    if (!form.boundTargetId) {
      toast.error(
        form.type === 'AUTO_EVALUATION'
          ? '请选择一个自动评测任务'
          : '请选择一个运行场景'
      )
      return false
    }
    return true
  }

  const validateSchedule = () => {
    if (
      form.frequency.mode === 'ONCE' &&
      !Number.isFinite(new Date(form.frequency.runAt).getTime())
    ) {
      toast.error('请选择有效的单次执行时间')
      return false
    }
    if (
      form.frequency.mode === 'RECURRING' &&
      form.frequency.kind === 'CRON' &&
      !form.frequency.cronExpression.trim()
    ) {
      toast.error('请输入高级 cron 表达式')
      return false
    }
    return true
  }

  const handleConfirm = () => {
    if (step === 0) {
      if (validateBasic()) setStep(1)
      return
    }
    if (step === 1) {
      if (validateBinding()) setStep(2)
      return
    }
    if (!validateBasic() || !validateBinding() || !validateSchedule()) return

    const frequency = formToFrequency(form.frequency)
    const fallbackEvaluator = scheduledJobMockEvaluators[0]
    const autoEvaluation = selectedAutoEvaluationTask
    const scene = selectedScene
    const targetName =
      autoEvaluation?.name ?? scene?.name ?? task?.binding.targetName ?? ''
    const targetDescription =
      autoEvaluation?.description ??
      scene?.description ??
      task?.binding.targetDescription ??
      ''
    const savedTask: ScheduledJobTask = {
      id: task?.id ?? createScheduledJobId(),
      projectId,
      type: form.type,
      binding: {
        type: form.type,
        targetId: form.boundTargetId,
        targetName,
        targetDescription,
      },
      name: form.name.trim(),
      description: form.description.trim(),
      scoreName: autoEvaluation?.scoreName ?? '',
      scoreMapping: task?.scoreMapping ?? {},
      runMode: form.frequency.mode,
      frequency,
      status: task?.status ?? 'NOT_STARTED',
      dataSource:
        autoEvaluation?.dataSource ??
        (scene
          ? {
              type: 'DATASET',
              datasetId: scene.datasetId,
              datasetName: scene.datasetId,
              estimatedCount: 0,
            }
          : (task?.dataSource ?? {
              type: 'DATASET',
              datasetId: '',
              datasetName: '',
              estimatedCount: 0,
            })),
      evaluator:
        autoEvaluation?.evaluator ?? task?.evaluator ?? fallbackEvaluator,
      variableMapping: task?.variableMapping ?? {},
      reportTemplateId:
        autoEvaluation?.reportTemplateId ?? task?.reportTemplateId ?? '',
      sampleRate: autoEvaluation?.sampleRate ?? task?.sampleRate ?? 100,
      badcase: autoEvaluation?.badcase ??
        task?.badcase ?? { enabled: false, threshold: null },
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
    if (step > 0) {
      setStep((current) => current - 1)
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
      actions={
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => onOpenChange(false)}
        >
          关闭
        </Button>
      }
    >
      <BaseForm
        id={formId}
        schema={schema}
        defaultValues={{}}
        onSubmit={handleConfirm}
        className='flex min-h-full flex-col gap-6'
      >
        <Stepper items={steps} currentStep={step} />

        {step === 0 ? (
          <BasicStep
            form={form}
            onTypeChange={changeTaskType}
            updateForm={updateForm}
          />
        ) : null}
        {step === 1 ? (
          <BindingStep
            projectId={projectId}
            form={form}
            bindingKeyword={bindingKeyword}
            filteredAutoEvaluationTasks={filteredAutoEvaluationTasks}
            filteredScenes={filteredScenes}
            selectedAutoEvaluationTask={selectedAutoEvaluationTask}
            selectedScene={selectedScene}
            scenesLoading={scenesLoading}
            onKeywordChange={setBindingKeyword}
            onSelect={(boundTargetId) => updateForm({ boundTargetId })}
          />
        ) : null}
        {step === 2 ? (
          <ScheduleStep
            form={form}
            targetName={
              selectedAutoEvaluationTask?.name ??
              selectedScene?.name ??
              task?.binding.targetName ??
              '-'
            }
            updateFrequency={updateFrequency}
          />
        ) : null}

        <div className='bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 -mx-4 mt-auto -mb-4 flex justify-end gap-2 border-t px-4 pt-4 backdrop-blur'>
          <Button type='button' variant='outline' onClick={handleCancel}>
            {step === 0 ? '取消' : '上一步'}
          </Button>
          <Button type='submit' form={formId}>
            {step === steps.length - 1 ? '保存' : '下一步'}
          </Button>
        </div>
      </BaseForm>
    </Drawer>
  )
}

function BasicStep({
  form,
  onTypeChange,
  updateForm,
}: {
  form: ScheduledJobForm
  onTypeChange: (type: ScheduledJobTaskType) => void
  updateForm: (patch: Partial<ScheduledJobForm>) => void
}) {
  return (
    <div className='grid gap-5'>
      <section className='grid gap-3'>
        <Label>任务类型</Label>
        <RadioGroup
          value={form.type}
          onValueChange={(value) => onTypeChange(value as ScheduledJobTaskType)}
          className='grid gap-3 md:grid-cols-2'
        >
          <TaskTypeOption
            value='AUTO_EVALUATION'
            selected={form.type === 'AUTO_EVALUATION'}
            icon={<Bot />}
            title='自动评测'
            description='按计划运行一个已开启定时执行的自动评测任务。'
          />
          <TaskTypeOption
            value='RUN_EXPERIMENT'
            selected={form.type === 'RUN_EXPERIMENT'}
            icon={<FlaskConical />}
            title='运行试验'
            description='按计划运行当前项目中已生效的场景。'
          />
        </RadioGroup>
      </section>

      <section className='grid gap-4 border-t pt-5'>
        <Field label='任务名称' htmlFor='scheduled-job-name'>
          <Input
            id='scheduled-job-name'
            value={form.name}
            maxLength={NAME_MAX_LENGTH}
            placeholder={
              form.type === 'AUTO_EVALUATION'
                ? '例如：每日客服质量评测'
                : '例如：每周客服场景回归'
            }
            onChange={(event) => updateForm({ name: event.target.value })}
          />
        </Field>
        <Field label='任务描述' htmlFor='scheduled-job-description'>
          <Textarea
            id='scheduled-job-description'
            className='min-h-28 resize-none'
            value={form.description}
            maxLength={DESCRIPTION_MAX_LENGTH}
            placeholder='说明该定时任务的用途和执行目标'
            onChange={(event) =>
              updateForm({ description: event.target.value })
            }
          />
        </Field>
      </section>
    </div>
  )
}

function TaskTypeOption({
  value,
  selected,
  icon,
  title,
  description,
}: {
  value: ScheduledJobTaskType
  selected: boolean
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Label
      htmlFor={`scheduled-job-type-${value}`}
      className={cn(
        'hover:bg-accent/50 flex min-h-28 cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
        selected && 'border-primary bg-primary/5'
      )}
    >
      <RadioGroupItem id={`scheduled-job-type-${value}`} value={value} />
      <span className='grid min-w-0 gap-2'>
        <span className='flex items-center gap-2 font-medium'>
          <span className='text-primary [&_svg]:size-4'>{icon}</span>
          {title}
        </span>
        <span className='text-muted-foreground text-sm leading-6'>
          {description}
        </span>
      </span>
    </Label>
  )
}

function BindingStep({
  projectId,
  form,
  bindingKeyword,
  filteredAutoEvaluationTasks,
  filteredScenes,
  selectedAutoEvaluationTask,
  selectedScene,
  scenesLoading,
  onKeywordChange,
  onSelect,
}: {
  projectId: string
  form: ScheduledJobForm
  bindingKeyword: string
  filteredAutoEvaluationTasks: ScheduledJobAutoEvaluationOption[]
  filteredScenes: SceneRecord[]
  selectedAutoEvaluationTask?: ScheduledJobAutoEvaluationOption
  selectedScene?: SceneRecord
  scenesLoading: boolean
  onKeywordChange: (value: string) => void
  onSelect: (value: string) => void
}) {
  const isAutoEvaluation = form.type === 'AUTO_EVALUATION'
  const title = isAutoEvaluation ? '绑定自动评测任务' : '绑定运行场景'
  const description = isAutoEvaluation
    ? '仅展示创建时已开启“支持定时执行”的自动评测任务。'
    : '仅展示当前项目下已创建且生效中的场景。'
  const emptyText = scenesLoading
    ? '正在加载运行场景...'
    : isAutoEvaluation
      ? '暂无匹配且支持定时执行的自动评测任务。'
      : '暂无匹配的生效场景。'

  return (
    <section className='grid gap-4'>
      <div>
        <h3 className='font-semibold'>{title}</h3>
        <p className='text-muted-foreground mt-1 text-sm'>{description}</p>
      </div>
      <div className='grid min-h-[26rem] gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(22rem,1.1fr)]'>
        <div className='flex min-w-0 flex-col gap-3 rounded-lg border p-4'>
          <div className='relative'>
            <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' />
            <Input
              value={bindingKeyword}
              className='pl-9'
              placeholder={
                isAutoEvaluation ? '搜索自动评测任务' : '搜索运行场景'
              }
              onChange={(event) => onKeywordChange(event.target.value)}
            />
          </div>
          <RadioGroup
            value={form.boundTargetId}
            onValueChange={onSelect}
            className='max-h-[25rem] overflow-y-auto pr-1'
          >
            {isAutoEvaluation
              ? filteredAutoEvaluationTasks.map((task) => (
                  <BindingOption
                    key={task.id}
                    value={task.id}
                    title={task.name}
                    description={task.description}
                    meta={`${task.evaluator.name} · ${task.sampleRate}% 采样`}
                    selected={form.boundTargetId === task.id}
                  />
                ))
              : filteredScenes.map((scene) => (
                  <BindingOption
                    key={scene.id}
                    value={scene.id}
                    title={scene.name}
                    description={scene.description}
                    meta={`${scene.evaluatorIds.length} 个评估器 · ${scene.webhooks.length} 个 Webhook`}
                    selected={form.boundTargetId === scene.id}
                  />
                ))}
          </RadioGroup>
          {(
            isAutoEvaluation
              ? filteredAutoEvaluationTasks.length === 0
              : filteredScenes.length === 0
          ) ? (
            <div className='text-muted-foreground flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm'>
              {emptyText}
            </div>
          ) : null}
        </div>

        {selectedAutoEvaluationTask ? (
          <AutoEvaluationOverview task={selectedAutoEvaluationTask} />
        ) : selectedScene ? (
          <SceneOverview projectId={projectId} scene={selectedScene} />
        ) : (
          <div className='text-muted-foreground flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center'>
            {isAutoEvaluation ? (
              <Bot className='size-8' />
            ) : (
              <FlaskConical className='size-8' />
            )}
            <div>
              <p className='text-foreground font-medium'>尚未选择绑定对象</p>
              <p className='mt-1 text-sm'>从左侧列表选择后将在这里展示概览。</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function BindingOption({
  value,
  title,
  description,
  meta,
  selected,
}: {
  value: string
  title: string
  description: string
  meta: string
  selected: boolean
}) {
  return (
    <Label
      htmlFor={`scheduled-binding-${value}`}
      className={cn(
        'hover:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        selected && 'border-primary bg-primary/5'
      )}
    >
      <RadioGroupItem id={`scheduled-binding-${value}`} value={value} />
      <span className='grid min-w-0 flex-1 gap-1'>
        <span className='truncate font-medium'>{title}</span>
        <span className='text-muted-foreground line-clamp-2 text-xs leading-5'>
          {description || '暂无描述'}
        </span>
        <span className='text-muted-foreground truncate text-xs'>{meta}</span>
      </span>
      {selected ? <CheckCircle2 className='text-primary size-4' /> : null}
    </Label>
  )
}

function AutoEvaluationOverview({
  task,
}: {
  task: ScheduledJobAutoEvaluationOption
}) {
  return (
    <Overview title='自动评测任务概览' badge='支持定时执行'>
      <div>
        <h4 className='font-semibold'>{task.name}</h4>
        <p className='text-muted-foreground mt-1 text-sm leading-6'>
          {task.description}
        </p>
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <Metric icon={<Bot />} label='评估器' value={task.evaluator.name} />
        <Metric
          icon={<Database />}
          label='数据来源'
          value={
            task.dataSource.type === 'TRACE_FILTER' ? 'Trace 过滤' : '数据集'
          }
        />
        <Metric label='评分指标' value={task.scoreName} />
        <Metric label='采样比例' value={`${task.sampleRate}%`} />
        <Metric
          label='任务状态'
          value={formatAutoEvaluationStatus(task.status)}
        />
        <Metric
          label='最近运行'
          value={task.lastRunAt ? formatDateTime(task.lastRunAt) : '尚未运行'}
        />
      </div>
    </Overview>
  )
}

function SceneOverview({
  projectId,
  scene,
}: {
  projectId: string
  scene: SceneRecord
}) {
  return (
    <Overview title='运行场景概览' badge='生效中'>
      <div>
        <h4 className='font-semibold'>{scene.name}</h4>
        <p className='text-muted-foreground mt-1 text-sm leading-6'>
          {scene.description}
        </p>
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <Metric
          icon={<Database />}
          label='默认数据集'
          value={scene.datasetId}
        />
        <Metric
          icon={<Bot />}
          label='评估器'
          value={`${scene.evaluatorIds.length} 个`}
        />
        <Metric
          icon={<Webhook />}
          label='Webhook 服务'
          value={`${scene.webhooks.length} 个`}
        />
        <Metric
          label='运行参数'
          value={`${scene.runParameters.concurrency} 并发 · ${scene.runParameters.rounds} 轮`}
        />
        <Metric label='项目' value={projectId} />
        <Metric label='场景状态' value='生效中' />
      </div>
    </Overview>
  )
}

function Overview({
  title,
  badge,
  children,
}: {
  title: string
  badge: string
  children: React.ReactNode
}) {
  return (
    <div className='bg-card flex min-w-0 flex-col gap-4 rounded-lg border p-4'>
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-sm font-semibold'>{title}</h3>
        <Badge variant='secondary'>{badge}</Badge>
      </div>
      {children}
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className='bg-muted/40 min-w-0 rounded-md p-3'>
      <span className='text-muted-foreground flex items-center gap-2 text-xs [&_svg]:size-3.5'>
        {icon}
        {label}
      </span>
      <span className='mt-1 block truncate text-sm font-medium'>{value}</span>
    </div>
  )
}

function ScheduleStep({
  form,
  targetName,
  updateFrequency,
}: {
  form: ScheduledJobForm
  targetName: string
  updateFrequency: (patch: Partial<FrequencyForm>) => void
}) {
  return (
    <div className='grid gap-5'>
      <div className='bg-muted/40 flex items-center gap-3 rounded-lg border p-4'>
        <CalendarClock className='text-primary size-5' />
        <div className='min-w-0'>
          <p className='text-sm font-medium'>已绑定：{targetName}</p>
          <p className='text-muted-foreground mt-1 text-xs'>
            调度触发时将直接运行该绑定对象的既有配置。
          </p>
        </div>
      </div>

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
                kind: value === 'ONCE' ? 'ONCE' : 'DAILY',
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
          <DateTimePicker
            value={toDateTimePickerValue(
              toDateTimeLocalValue(form.frequency.runAt)
            )}
            showTime
            timeFormat='HH:mm'
            placeholder='选择执行时间'
            onChange={(nextValue) =>
              updateFrequency({
                runAt: toIsoFromDateTimeLocal(
                  fromDateTimePickerValue(nextValue)
                ),
              })
            }
          />
        </Field>
      ) : (
        <div className='grid gap-4 rounded-lg border p-4'>
          <Field label='周期规则'>
            <Select
              value={form.frequency.kind}
              onValueChange={(value) =>
                updateFrequency({ kind: value as ScheduledJobFrequencyKind })
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
                  updateFrequency({ intervalHours: Number(event.target.value) })
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
  )
}

function formatAutoEvaluationStatus(
  status: ScheduledJobAutoEvaluationOption['status']
) {
  return {
    READY: '待运行',
    RUNNING: '运行中',
    COMPLETED: '已完成',
    FAILED: '失败',
  }[status]
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function toIsoFromDateTimeLocal(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className='grid gap-2'>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
