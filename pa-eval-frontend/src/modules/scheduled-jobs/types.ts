export type ScheduledJobTaskType = 'AUTO_EVALUATION'

export type ScheduledJobRunMode = 'ONCE' | 'RECURRING'

export type ScheduledJobFrequencyKind =
  'ONCE' | 'EVERY_MINUTES' | 'EVERY_HOURS' | 'DAILY' | 'WEEKLY' | 'CRON'

export type ScheduledJobStatus =
  'NOT_STARTED' | 'RUNNING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED'

export type ScheduledJobLogStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export type ScheduledJobTriggerType = 'MANUAL' | 'JOB'

export type ScheduledJobDataSourceType = 'TRACE_FILTER' | 'DATASET'

export type ScheduledJobTraceWindowMode = 'FIXED' | 'ROLLING' | 'PREVIOUS_DAY'

export type ScheduledJobFrequency =
  | {
      kind: 'ONCE'
      runAt: string
    }
  | {
      kind: 'EVERY_MINUTES'
      intervalMinutes: number
    }
  | {
      kind: 'EVERY_HOURS'
      intervalHours: number
    }
  | {
      kind: 'DAILY'
      timeOfDay: string
    }
  | {
      kind: 'WEEKLY'
      weekdays: number[]
      timeOfDay: string
    }
  | {
      kind: 'CRON'
      expression: string
      description?: string
    }

export type ScheduledJobTraceWindow =
  | {
      mode: 'FIXED'
      startAt: string
      endAt: string
    }
  | {
      mode: 'ROLLING'
      amount: number
      unit: 'minutes' | 'hours' | 'days'
    }
  | {
      mode: 'PREVIOUS_DAY'
    }

export type ScheduledJobTraceFilter = {
  name: string
  environments: string[]
  userId: string
  sessionId: string
  tags: string[]
  createdAtRange?: [string, string]
  estimatedCount: number
}

export type ScheduledJobDataSource =
  | {
      type: 'TRACE_FILTER'
      traceWindow: ScheduledJobTraceWindow
      traceFilter: ScheduledJobTraceFilter
      estimatedCount: number
    }
  | {
      type: 'DATASET'
      datasetId: string
      datasetName: string
      estimatedCount: number
    }

export type ScheduledJobEvaluator = {
  id: string
  name: string
  provider: 'DIFY' | 'N8N'
  description: string
  variables: string[]
  updatedAt: string
}

export type ScheduledJobDatasetOption = {
  id: string
  projectId: string
  name: string
  description: string
  estimatedCount: number
  updatedAt: string
}

export type ScheduledJobMappingFieldOption = {
  value: string
  label: string
  group: 'SAMPLE'
}

export type ScheduledJobReportTemplateOption = {
  id: string
  name: string
  description: string
  isDefault?: boolean
}

export type ScheduledJobBadcaseConfig = {
  enabled: boolean
  threshold: number | null
}

export type ScheduledJobTask = {
  id: string
  projectId: string
  type: ScheduledJobTaskType
  name: string
  description: string
  scoreName: string
  runMode: ScheduledJobRunMode
  frequency: ScheduledJobFrequency
  status: ScheduledJobStatus
  dataSource: ScheduledJobDataSource
  evaluator: ScheduledJobEvaluator
  variableMapping: Record<string, string>
  reportTemplateId: string
  sampleRate: number
  badcase: ScheduledJobBadcaseConfig
  nextRunAt: string | null
  lastRunAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ScheduledJobExecutionLog = {
  id: string
  projectId: string
  taskId: string
  taskName: string
  taskDeleted?: boolean
  taskType?: ScheduledJobTaskType
  triggerType: ScheduledJobTriggerType
  autoEvaluationTaskName: string
  autoEvaluationTaskPath?: string
  evaluationReportPath?: string
  status: ScheduledJobLogStatus
  sampleCount: number
  startedAt: string
  endedAt: string | null
  durationText: string
  errorMessage?: string
}

export const scheduledJobTaskTypeLabels: Record<ScheduledJobTaskType, string> =
  {
    AUTO_EVALUATION: '自动评测',
  }

export const scheduledJobStatusLabels: Record<ScheduledJobStatus, string> = {
  NOT_STARTED: '未启动',
  RUNNING: '运行中',
  PAUSED: '已暂停',
  SUCCEEDED: '执行成功',
  FAILED: '执行失败',
}

export const scheduledJobLogStatusLabels: Record<
  ScheduledJobLogStatus,
  string
> = {
  RUNNING: '运行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
}

export const scheduledJobTriggerLabels: Record<
  ScheduledJobTriggerType,
  string
> = {
  MANUAL: '手动执行',
  JOB: 'JOB触发',
}
