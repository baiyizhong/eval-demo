import { scheduledJobMockLogs, scheduledJobMockTasks } from './mock-data.ts'
import type {
  ScheduledJobDataSource,
  ScheduledJobExecutionLog,
  ScheduledJobFrequency,
  ScheduledJobTask,
  ScheduledJobTriggerType,
} from './types.ts'

const pad2 = (value: number) => value.toString().padStart(2, '0')

const weekdayLabels: Record<number, string> = {
  0: '周日',
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
}

const createId = (prefix: string) => {
  const randomValue =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

  return `${prefix}_${randomValue.replace(/-/g, '')}`
}

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value)) as T
}

const parseTimeOfDay = (timeOfDay: string) => {
  const [hours = '0', minutes = '0'] = timeOfDay.split(':')

  return {
    hours: Number(hours),
    minutes: Number(minutes),
  }
}

const setTimeOfDay = (date: Date, timeOfDay: string) => {
  const { hours, minutes } = parseTimeOfDay(timeOfDay)
  const next = new Date(date)
  next.setHours(hours, minutes, 0, 0)

  return next
}

const formatTimestamp = (date: Date) => {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)

  return [
    chinaTime.getUTCFullYear(),
    pad2(chinaTime.getUTCMonth() + 1),
    pad2(chinaTime.getUTCDate()),
    pad2(chinaTime.getUTCHours()),
    pad2(chinaTime.getUTCMinutes()),
  ].join('')
}

export function createScheduledJobId() {
  return createId('pajob')
}

export function createScheduledJobLogId() {
  return createId('pajoblog')
}

export function formatJobTriggeredAutoEvaluationName(
  jobName: string,
  triggeredAt: Date
) {
  return `【JOB触发】${jobName}-${formatTimestamp(triggeredAt)}`
}

export function getEstimatedCount(dataSource: ScheduledJobDataSource) {
  return dataSource.estimatedCount
}

export function getEffectiveSampleCount(
  estimatedCount: number,
  sampleRate: number
) {
  return Math.ceil((estimatedCount * sampleRate) / 100)
}

export function shouldShowSampleWarning(
  estimatedCount: number,
  sampleRate: number
) {
  return getEffectiveSampleCount(estimatedCount, sampleRate) > 1000
}

export function formatFrequencyLabel(frequency: ScheduledJobFrequency) {
  switch (frequency.kind) {
    case 'ONCE':
      return `单次执行：${frequency.runAt}`
    case 'EVERY_MINUTES':
      return `每 ${frequency.intervalMinutes} 分钟`
    case 'EVERY_HOURS':
      return `每 ${frequency.intervalHours} 小时`
    case 'DAILY':
      return `每天 ${frequency.timeOfDay}`
    case 'WEEKLY':
      return `每周 ${frequency.weekdays
        .map((weekday) => weekdayLabels[weekday] ?? `周${weekday}`)
        .join('、')} ${frequency.timeOfDay}`
    case 'CRON':
      return frequency.description ?? `Cron：${frequency.expression}`
  }
}

export function calculateNextRunAt(
  frequency: ScheduledJobFrequency,
  now = new Date()
) {
  switch (frequency.kind) {
    case 'ONCE': {
      const runAt = new Date(frequency.runAt)
      return runAt > now ? runAt.toISOString() : null
    }
    case 'EVERY_MINUTES':
      return new Date(
        now.getTime() + frequency.intervalMinutes * 60 * 1000
      ).toISOString()
    case 'EVERY_HOURS':
      return new Date(
        now.getTime() + frequency.intervalHours * 60 * 60 * 1000
      ).toISOString()
    case 'DAILY': {
      const next = setTimeOfDay(now, frequency.timeOfDay)
      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }
      return next.toISOString()
    }
    case 'WEEKLY': {
      const weekdays = frequency.weekdays.length
        ? frequency.weekdays
        : [now.getDay()]

      for (let offset = 0; offset <= 7; offset += 1) {
        const candidate = setTimeOfDay(now, frequency.timeOfDay)
        candidate.setDate(now.getDate() + offset)
        if (weekdays.includes(candidate.getDay()) && candidate > now) {
          return candidate.toISOString()
        }
      }

      return null
    }
    case 'CRON':
      return null
  }
}

export function cloneMockTasks(projectId: string) {
  return clone(
    scheduledJobMockTasks.filter((task) => task.projectId === projectId)
  )
}

export function cloneMockLogs(projectId: string) {
  return clone(
    scheduledJobMockLogs.filter((log) => log.projectId === projectId)
  )
}

export function createExecutionLog(
  task: ScheduledJobTask,
  triggerType: ScheduledJobTriggerType,
  options: { now?: Date; id?: string } = {}
): ScheduledJobExecutionLog {
  const triggeredAt = options.now ?? new Date()
  const sampleCount = getEffectiveSampleCount(
    getEstimatedCount(task.dataSource),
    task.sampleRate
  )
  const autoEvaluationTaskName =
    triggerType === 'JOB'
      ? formatJobTriggeredAutoEvaluationName(task.name, triggeredAt)
      : `${task.name}-手动运行`

  return {
    id: options.id ?? createScheduledJobLogId(),
    projectId: task.projectId,
    taskId: task.id,
    taskName: task.name,
    taskType: task.type,
    triggerType,
    autoEvaluationTaskName,
    autoEvaluationTaskPath: `/projects/${task.projectId}/evaluation/auto-evaluations/${task.id}`,
    evaluationReportPath: `/projects/${task.projectId}/evaluation/reports/${task.id}`,
    status: 'RUNNING',
    sampleCount,
    startedAt: triggeredAt.toISOString(),
    endedAt: null,
    durationText: '运行中',
  }
}
