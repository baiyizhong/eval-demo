import type {
  ScheduledJobDatasetOption,
  ScheduledJobEvaluator,
  ScheduledJobExecutionLog,
  ScheduledJobMappingFieldOption,
  ScheduledJobReportTemplateOption,
  ScheduledJobTask,
} from './types.ts'

export const scheduledJobMockEvaluators: ScheduledJobEvaluator[] = [
  {
    id: 'evaluator_dify_customer_quality',
    name: 'Dify 客服质量评分器',
    provider: 'DIFY',
    description: '基于 Dify 工作流对客服回复质量、语气和解决率进行评分。',
    variables: ['input', 'output', 'conversation_context'],
    updatedAt: '2026-07-08T10:30:00.000Z',
  },
  {
    id: 'evaluator_n8n_risk_review',
    name: 'N8N 风险复核评分器',
    provider: 'N8N',
    description: '通过 N8N 编排多节点规则，识别投诉升级和合规风险。',
    variables: ['trace_id', 'input', 'output'],
    updatedAt: '2026-07-07T09:15:00.000Z',
  },
]

export const scheduledJobMockDatasets: ScheduledJobDatasetOption[] = [
  {
    id: 'dataset_customer_service_small',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    name: '客服质检抽样集',
    description: '用于每日客服质量评测的小规模数据集。',
    estimatedCount: 360,
    updatedAt: '2026-07-08T11:20:00.000Z',
  },
  {
    id: 'dataset_customer_service_large',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    name: '客服全量回放集',
    description: '覆盖近一周线上会话的大规模数据集。',
    estimatedCount: 2580,
    updatedAt: '2026-07-08T12:05:00.000Z',
  },
]

export const scheduledJobMockMappingFields: ScheduledJobMappingFieldOption[] = [
  { value: 'sample.input', label: 'sample.input', group: 'SAMPLE' },
  { value: 'sample.output', label: 'sample.output', group: 'SAMPLE' },
  {
    value: 'sample.expectedOutput',
    label: 'sample.expectedOutput',
    group: 'SAMPLE',
  },
  { value: 'sample.context', label: 'sample.context', group: 'SAMPLE' },
  { value: 'sample.metadata', label: 'sample.metadata', group: 'SAMPLE' },
  { value: 'sample.trace.id', label: 'sample.trace.id', group: 'SAMPLE' },
  {
    value: 'sample.observation.id',
    label: 'sample.observation.id',
    group: 'SAMPLE',
  },
  {
    value: 'sample.datasetItem.id',
    label: 'sample.datasetItem.id',
    group: 'SAMPLE',
  },
]

export const scheduledJobMockReportTemplates: ScheduledJobReportTemplateOption[] =
  [
    {
      id: 'template_customer_quality_default',
      name: '客服质量评测报告',
      description: '适用于客服回复质量、语气和解决率评测。',
      isDefault: true,
    },
    {
      id: 'template_risk_review',
      name: '风险复核报告',
      description: '适用于投诉升级、合规风险和高风险样本复核。',
    },
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

const createDefaultVariableMapping = (variables: string[]) =>
  Object.fromEntries(
    variables.map((variable) => {
      const defaultField = defaultSampleMappingByVariable[variable.toLowerCase()]
      const matchedField =
        scheduledJobMockMappingFields.find(
          (field) =>
            field.value.toLowerCase() ===
            (defaultField ?? `sample.${variable}`).toLowerCase()
        ) ?? scheduledJobMockMappingFields[0]

      return [variable, `{{ ${matchedField.value} }}`]
    })
  )

export const scheduledJobMockTasks: ScheduledJobTask[] = [
  {
    id: 'pajob_daily_customer_quality',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    type: 'AUTO_EVALUATION',
    name: '每日客服质量评测',
    description: '每天凌晨对前一日客服会话进行自动评测。',
    scoreName: 'customer_quality_score',
    runMode: 'RECURRING',
    frequency: {
      kind: 'DAILY',
      timeOfDay: '01:00',
    },
    status: 'RUNNING',
    dataSource: {
      type: 'TRACE_FILTER',
      traceWindow: {
        mode: 'PREVIOUS_DAY',
      },
      traceFilter: {
        name: '前一日客服会话 Trace',
        userId: '',
        sessionId: '',
        tags: ['customer-service'],
        estimatedCount: 1360,
      },
      estimatedCount: 1360,
    },
    evaluator: scheduledJobMockEvaluators[0],
    variableMapping: createDefaultVariableMapping(
      scheduledJobMockEvaluators[0].variables
    ),
    reportTemplateId: scheduledJobMockReportTemplates[0].id,
    sampleRate: 100,
    badcase: {
      enabled: true,
      threshold: 0.6,
    },
    nextRunAt: '2026-07-10T01:00:00.000Z',
    lastRunAt: '2026-07-09T01:00:00.000Z',
    createdBy: 'PA Admin',
    createdAt: '2026-07-02T08:00:00.000Z',
    updatedAt: '2026-07-09T01:05:00.000Z',
  },
  {
    id: 'pajob_weekly_risk_review',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    type: 'AUTO_EVALUATION',
    name: '每周投诉风险复核',
    description: '每周一回放高风险标签 Trace，辅助定位投诉升级隐患。',
    scoreName: 'complaint_risk_score',
    runMode: 'RECURRING',
    frequency: {
      kind: 'WEEKLY',
      weekdays: [1],
      timeOfDay: '09:30',
    },
    status: 'PAUSED',
    dataSource: {
      type: 'TRACE_FILTER',
      traceWindow: {
        mode: 'ROLLING',
        amount: 7,
        unit: 'days',
      },
      traceFilter: {
        name: '近 7 天投诉风险 Trace',
        userId: '',
        sessionId: '',
        tags: ['complaint', 'risk'],
        estimatedCount: 1680,
      },
      estimatedCount: 1680,
    },
    evaluator: scheduledJobMockEvaluators[1],
    variableMapping: createDefaultVariableMapping(
      scheduledJobMockEvaluators[1].variables
    ),
    reportTemplateId: scheduledJobMockReportTemplates[1].id,
    sampleRate: 80,
    badcase: {
      enabled: true,
      threshold: 0.7,
    },
    nextRunAt: null,
    lastRunAt: '2026-07-06T09:30:00.000Z',
    createdBy: 'PA Admin',
    createdAt: '2026-07-01T07:30:00.000Z',
    updatedAt: '2026-07-08T14:40:00.000Z',
  },
]

export const scheduledJobMockLogs: ScheduledJobExecutionLog[] = [
  {
    id: 'pajoblog_daily_customer_quality_202607090100',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    taskId: 'pajob_daily_customer_quality',
    taskName: '每日客服质量评测',
    taskType: 'AUTO_EVALUATION',
    triggerType: 'JOB',
    autoEvaluationTaskName: '【JOB触发】每日客服质量评测-202607090100',
    autoEvaluationTaskPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/auto-evaluations/pajob_daily_customer_quality',
    evaluationReportPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/reports/pajob_daily_customer_quality',
    status: 'SUCCEEDED',
    sampleCount: 360,
    startedAt: '2026-07-09T01:00:00.000Z',
    endedAt: '2026-07-09T01:04:12.000Z',
    durationText: '4分12秒',
  },
  {
    id: 'pajoblog_daily_customer_quality_manual',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    taskId: 'pajob_daily_customer_quality',
    taskName: '每日客服质量评测',
    taskType: 'AUTO_EVALUATION',
    triggerType: 'MANUAL',
    autoEvaluationTaskName: '每日客服质量评测-手动运行',
    autoEvaluationTaskPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/auto-evaluations/pajob_daily_customer_quality',
    evaluationReportPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/reports/pajob_daily_customer_quality',
    status: 'FAILED',
    sampleCount: 360,
    startedAt: '2026-07-08T15:20:00.000Z',
    endedAt: '2026-07-08T15:21:18.000Z',
    durationText: '1分18秒',
    errorMessage: '评测工作流返回异常，请稍后重试。',
  },
]
