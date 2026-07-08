import type {
  AnnotationQueueItemRecord,
  AnnotationQueueRecord,
  ProjectUserRecord,
  ScoreConfigRecord,
} from '../types'

export const mockAnnotationUsers: ProjectUserRecord[] = [
  {
    id: 'user_annotator_a',
    name: '张三',
    email: 'zhangsan@example.com',
  },
  {
    id: 'user_annotator_b',
    name: '李四',
    email: 'lisi@example.com',
  },
]

export const mockScoreConfigs: ScoreConfigRecord[] = [
  {
    id: 'score_accuracy',
    projectId: 'project_customer_agent',
    name: '准确性',
    dataType: 'NUMERIC',
    description: '回答是否准确覆盖用户诉求',
    minValue: 1,
    maxValue: 5,
  },
  {
    id: 'score_usability',
    projectId: 'project_customer_agent',
    name: '是否可用',
    dataType: 'BOOLEAN',
    description: '该回答是否可直接沉淀为样本',
  },
  {
    id: 'score_error_type',
    projectId: 'project_customer_agent',
    name: '错误类型',
    dataType: 'CATEGORICAL',
    description: '人工归因错误类型',
    categories: [
      { label: '意图识别错误', value: 1 },
      { label: '事实错误', value: 2 },
      { label: '格式错误', value: 3 },
      { label: '无错误', value: 4 },
    ],
  },
  {
    id: 'score_comment',
    projectId: 'project_customer_agent',
    name: '综合备注',
    dataType: 'TEXT',
    description: '人工标注综合说明',
  },
]

export const mockAnnotationQueues: AnnotationQueueRecord[] = [
  {
    id: 'queue_customer_quality',
    projectId: 'project_customer_agent',
    name: '客服会话质量人工标注',
    description: '客服 Agent 回复准确性与可用性人工标注',
    scoreConfigIds: ['score_accuracy', 'score_usability', 'score_error_type'],
    assigneeIds: ['user_annotator_a', 'user_annotator_b'],
    completedCount: 0,
    pendingCount: 0,
    scoreConfigs: [],
    assignees: [],
    createdAt: '2026-07-01T09:00:00.000Z',
    updatedAt: '2026-07-03T09:00:00.000Z',
  },
  {
    id: 'queue_badcase_review',
    projectId: 'project_customer_agent',
    name: '客服 Badcase 复核',
    description: '客服 badcase 数据沉淀前人工复核',
    scoreConfigIds: ['score_accuracy', 'score_comment'],
    assigneeIds: ['user_annotator_a'],
    completedCount: 0,
    pendingCount: 0,
    scoreConfigs: [],
    assignees: [],
    createdAt: '2026-07-02T09:00:00.000Z',
    updatedAt: '2026-07-03T09:30:00.000Z',
  },
]

export const mockAnnotationQueueItems: AnnotationQueueItemRecord[] = Array.from<
  unknown,
  AnnotationQueueItemRecord
>({ length: 16 }, (_, index) => {
  const number = String(index + 1).padStart(3, '0')
  const completed = index > 11
  const objectType =
    index % 3 === 0 ? 'TRACE' : index % 3 === 1 ? 'OBSERVATION' : 'SESSION'
  const createdAt = `2026-07-03T08:${String(index).padStart(2, '0')}:00.000Z`

  return {
    id: `aqi_customer_${number}`,
    projectId: 'project_customer_agent',
    queueId: 'queue_customer_quality',
    objectId: `trace_customer_${number}`,
    objectType,
    status: completed ? 'COMPLETED' : 'PENDING',
    source: {
      objectId: `trace_customer_${number}`,
      objectType,
      title: `用户退款咨询 ${number}`,
      input: {
        userMessage: `用户要求退款并咨询订单 ${number} 的处理进度`,
      },
      output: {
        assistantMessage: '已解释退款流程，并提示预计到账时间。',
      },
      metadata: {
        channel: 'web',
        intent: 'refund',
        priority: index < 3 ? 'high' : 'normal',
      },
      traceId: `trace_customer_${number}`,
      observationId: `obs_customer_${number}`,
      sessionId: `session_customer_${Math.ceil((index + 1) / 3)}`,
      userId: `customer_${number}`,
      latencyMs: 1200 + index * 80,
      costUsd: Number((0.002 + index * 0.0001).toFixed(4)),
      createdAt,
    },
    scores: [],
    completedAt: completed ? `2026-07-03T10:${number.slice(1)}:00.000Z` : '',
    completedBy: completed ? mockAnnotationUsers[0] : null,
    createdAt,
    updatedAt: createdAt,
  }
}).concat([
  {
    id: 'aqi_badcase_001',
    projectId: 'project_customer_agent',
    queueId: 'queue_badcase_review',
    objectId: 'trace_badcase_001',
    objectType: 'TRACE',
    status: 'PENDING',
    source: {
      objectId: 'trace_badcase_001',
      objectType: 'TRACE',
      title: 'Badcase 退款拒答',
      input: { userMessage: '为什么我的退款被拒绝' },
      output: { assistantMessage: '请联系人工客服。' },
      metadata: { channel: 'app', intent: 'refund' },
      traceId: 'trace_badcase_001',
      observationId: 'obs_badcase_001',
      sessionId: 'session_badcase_001',
      userId: 'customer_badcase_001',
      latencyMs: 1800,
      costUsd: 0.0031,
      createdAt: '2026-07-03T09:10:00.000Z',
    },
    scores: [],
    completedAt: '',
    completedBy: null,
    createdAt: '2026-07-03T09:10:00.000Z',
    updatedAt: '2026-07-03T09:10:00.000Z',
  },
])
