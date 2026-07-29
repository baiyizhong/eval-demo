import type {
  ScheduledExperimentExecutionLog,
  ScheduledJobAutoEvaluationOption,
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
    description: '基于 Dify 工作流评估客服回复质量、语气和解决率。',
    variables: ['input', 'output', 'conversation_context'],
    updatedAt: '2026-07-28T10:30:00.000Z',
  },
  {
    id: 'evaluator_n8n_risk_review',
    name: 'N8N 风险复核评分器',
    provider: 'N8N',
    description: '识别投诉升级、敏感表达和合规风险。',
    variables: ['trace_id', 'input', 'output'],
    updatedAt: '2026-07-27T09:15:00.000Z',
  },
]

export const scheduledJobMockDatasets: ScheduledJobDatasetOption[] = [
  {
    id: 'dataset_customer_service_small',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    name: '客服质检抽样集',
    description: '用于每日客服质量评测的小规模数据集。',
    estimatedCount: 360,
    updatedAt: '2026-07-28T11:20:00.000Z',
  },
]

export const scheduledJobMockMappingFields: ScheduledJobMappingFieldOption[] = [
  { value: 'sample.input', label: 'sample.input', group: 'SAMPLE' },
  { value: 'sample.output', label: 'sample.output', group: 'SAMPLE' },
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
      description: '适用于投诉升级和合规风险复核。',
    },
  ]

const customerTraceSource = {
  type: 'TRACE_FILTER' as const,
  traceWindow: { mode: 'PREVIOUS_DAY' as const },
  traceFilter: {
    name: '前一日客服会话 Trace',
    userId: '',
    sessionId: '',
    tags: ['customer-service'],
    estimatedCount: 1360,
  },
  estimatedCount: 1360,
}

const riskTraceSource = {
  type: 'TRACE_FILTER' as const,
  traceWindow: { mode: 'ROLLING' as const, amount: 7, unit: 'days' as const },
  traceFilter: {
    name: '近 7 天投诉风险 Trace',
    userId: '',
    sessionId: '',
    tags: ['complaint', 'risk'],
    estimatedCount: 680,
  },
  estimatedCount: 680,
}

export const scheduledJobMockAutoEvaluationTasks: ScheduledJobAutoEvaluationOption[] =
  [
    {
      id: 'auto_eval_customer_quality_daily',
      projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
      name: '客服回复质量自动评测',
      description: '按 Trace 过滤规则评估客服回复的准确性、相关性与服务语气。',
      supportsScheduledExecution: true,
      status: 'COMPLETED',
      scoreName: 'customer_quality_score',
      evaluator: scheduledJobMockEvaluators[0],
      dataSource: customerTraceSource,
      sampleRate: 100,
      reportTemplateId: scheduledJobMockReportTemplates[0].id,
      badcase: { enabled: true, threshold: 0.6 },
      lastRunAt: '2026-07-28T01:04:12.000Z',
      updatedAt: '2026-07-28T01:05:00.000Z',
    },
    {
      id: 'auto_eval_complaint_risk',
      projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
      name: '投诉升级风险自动评测',
      description: '复核高风险会话，识别投诉升级和合规隐患。',
      supportsScheduledExecution: true,
      status: 'READY',
      scoreName: 'complaint_risk_score',
      evaluator: scheduledJobMockEvaluators[1],
      dataSource: riskTraceSource,
      sampleRate: 80,
      reportTemplateId: scheduledJobMockReportTemplates[1].id,
      badcase: { enabled: true, threshold: 0.7 },
      lastRunAt: null,
      updatedAt: '2026-07-27T14:40:00.000Z',
    },
    {
      id: 'auto_eval_manual_regression',
      projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
      name: '人工回归抽检',
      description: '仅用于人工发起，不支持定时调度。',
      supportsScheduledExecution: false,
      status: 'READY',
      scoreName: 'manual_review_score',
      evaluator: scheduledJobMockEvaluators[0],
      dataSource: customerTraceSource,
      sampleRate: 20,
      reportTemplateId: scheduledJobMockReportTemplates[0].id,
      badcase: { enabled: false, threshold: null },
      lastRunAt: null,
      updatedAt: '2026-07-26T08:20:00.000Z',
    },
  ]

export const scheduledJobMockTasks: ScheduledJobTask[] = [
  {
    id: 'pajob_daily_customer_quality',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    type: 'AUTO_EVALUATION',
    binding: {
      type: 'AUTO_EVALUATION',
      targetId: scheduledJobMockAutoEvaluationTasks[0].id,
      targetName: scheduledJobMockAutoEvaluationTasks[0].name,
      targetDescription: scheduledJobMockAutoEvaluationTasks[0].description,
    },
    name: '每日客服质量评测',
    description: '每天凌晨运行客服回复质量自动评测。',
    scoreName: scheduledJobMockAutoEvaluationTasks[0].scoreName,
    runMode: 'RECURRING',
    frequency: { kind: 'DAILY', timeOfDay: '01:00' },
    status: 'RUNNING',
    dataSource: customerTraceSource,
    evaluator: scheduledJobMockEvaluators[0],
    variableMapping: {},
    reportTemplateId: scheduledJobMockReportTemplates[0].id,
    sampleRate: 100,
    badcase: { enabled: true, threshold: 0.6 },
    nextRunAt: '2026-07-30T01:00:00.000Z',
    lastRunAt: '2026-07-29T01:00:00.000Z',
    createdBy: 'PA Admin',
    createdAt: '2026-07-22T08:00:00.000Z',
    updatedAt: '2026-07-29T01:05:00.000Z',
  },
  {
    id: 'pajob_weekly_scene_regression',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    type: 'RUN_EXPERIMENT',
    binding: {
      type: 'RUN_EXPERIMENT',
      targetId: 'scene_customer_full_loop',
      targetName: '客服问答全链路试验',
      targetDescription: '对客服智能体候选版本执行全链路回归试验。',
    },
    name: '每周客服场景回归',
    description: '每周一执行生效中的客服问答场景。',
    scoreName: '',
    runMode: 'RECURRING',
    frequency: { kind: 'WEEKLY', weekdays: [1], timeOfDay: '09:30' },
    status: 'RUNNING',
    dataSource: {
      type: 'DATASET',
      datasetId: 'dataset_qa',
      datasetName: '客服问答数据集',
      estimatedCount: 120,
    },
    evaluator: scheduledJobMockEvaluators[0],
    variableMapping: {},
    reportTemplateId: '',
    sampleRate: 100,
    badcase: { enabled: false, threshold: null },
    nextRunAt: '2026-08-03T09:30:00.000Z',
    lastRunAt: '2026-07-27T09:30:00.000Z',
    createdBy: 'PA Admin',
    createdAt: '2026-07-21T07:30:00.000Z',
    updatedAt: '2026-07-27T09:36:00.000Z',
  },
]

export const scheduledJobMockLogs: ScheduledJobExecutionLog[] = [
  {
    id: 'pajoblog_daily_customer_quality_202607290100',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    taskId: 'pajob_daily_customer_quality',
    taskName: '每日客服质量评测',
    taskType: 'AUTO_EVALUATION',
    triggerType: 'JOB',
    autoEvaluationTaskName: '【JOB触发】每日客服质量评测-202607290100',
    autoEvaluationTaskPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/auto-evaluations/auto_eval_customer_quality_daily',
    evaluationReportPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/reports/report_customer_quality_daily',
    status: 'SUCCEEDED',
    sampleCount: 360,
    startedAt: '2026-07-29T01:00:00.000Z',
    endedAt: '2026-07-29T01:04:12.000Z',
    durationText: '4分12秒',
  },
]

export const scheduledExperimentMockLogs: ScheduledExperimentExecutionLog[] = [
  {
    id: 'scene_job_log_202607270930',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    taskId: 'pajob_weekly_scene_regression',
    taskName: '每周客服场景回归',
    triggerType: 'JOB',
    status: 'SUCCEEDED',
    scheduledAt: '2026-07-27T09:30:00.000Z',
    startedAt: '2026-07-27T09:30:08.000Z',
    endedAt: '2026-07-27T09:36:41.000Z',
    durationText: '6分33秒',
    sceneName: '客服问答全链路试验',
    experimentName: '每周客服场景回归-202607270930',
    experimentReportName: '客服 Agent v2.3 试验报告',
    experimentReportPath:
      '/projects/project_3da8d83d6d3d4b5d923a5f1466a4ad3c/evaluation/datasets/dataset_qa/experiment-reports/experiment_report_v23?source=project',
  },
  {
    id: 'scene_job_log_202607200930',
    projectId: 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c',
    taskId: 'pajob_weekly_scene_regression',
    taskName: '每周客服场景回归',
    triggerType: 'JOB',
    status: 'FAILED',
    scheduledAt: '2026-07-20T09:30:00.000Z',
    startedAt: '2026-07-20T09:30:04.000Z',
    endedAt: '2026-07-20T09:31:12.000Z',
    durationText: '1分08秒',
    sceneName: '客服问答全链路试验',
    experimentName: '每周客服场景回归-202607200930',
    experimentReportName: '运行失败，暂无报告',
    errorMessage: 'Webhook 服务响应超时。',
  },
]
