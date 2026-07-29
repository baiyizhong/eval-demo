const now = '2026-07-28T02:24:00.000Z'

export const sceneSeeds = [
  {
    id: 'scene_customer_full_loop',
    projectId: 'proj_a',
    name: '客服问答全链路试验',
    description: '对不同客服智能体版本执行准确性、相关性和安全性评测',
    enabled: true,
    supportsScheduledExecution: true,
    defaultScheduledWebhookIds: ['webhook_support_v23'],
    datasetId: 'dataset_qa',
    evaluatorIds: [
      'eval_dify_customer_service_quality',
      'eval_n8n_safety_review',
    ],
    webhooks: [
      {
        id: 'webhook_support_v23',
        name: '客服 Agent v2.3',
        description: '生产候选版本，用于本轮回归测试',
        url: 'https://agent.example.com/v2.3/chat',
        method: 'POST',
        authType: 'BEARER',
        maskedCredential: 'Bearer ••••••••••••2.3',
        headers: { 'X-Environment': 'staging' },
        serviceFamily: 'support-agent',
        version: '2.3.0',
      },
      {
        id: 'webhook_support_v22',
        name: '客服 Agent v2.2',
        description: '当前生产基线版本',
        url: 'https://agent.example.com/v2.2/chat',
        method: 'POST',
        authType: 'API_KEY',
        maskedCredential: 'X-API-Key ••••••••2.2',
        apiKeyHeader: 'X-API-Key',
        headers: {},
        serviceFamily: 'support-agent',
        version: '2.2.0',
      },
      {
        id: 'webhook_support_v21',
        name: '客服 Agent v2.1',
        description: '历史稳定版本',
        url: 'https://agent.example.com/v2.1/chat',
        method: 'POST',
        authType: 'NONE',
        headers: {},
        serviceFamily: 'support-agent',
        version: '2.1.0',
      },
    ],
    runParameters: {
      concurrency: 5,
      timeoutSeconds: 30,
      retryCount: 2,
      rounds: 1,
    },
    createdAt: '2026-07-12T06:22:00.000Z',
    updatedAt: now,
  },
  {
    id: 'scene_knowledge_retrieval',
    projectId: 'proj_a',
    name: '知识库召回回归',
    description: '知识库切换或索引更新后的召回质量回归',
    enabled: true,
    supportsScheduledExecution: false,
    defaultScheduledWebhookIds: [],
    datasetId: 'dataset_qa',
    evaluatorIds: ['eval_dify_customer_service_quality'],
    webhooks: [
      {
        id: 'webhook_retrieval_v4',
        name: '召回 Agent v4',
        description: '新索引候选版本',
        url: 'https://agent.example.com/retrieval/v4',
        method: 'POST',
        authType: 'BEARER',
        maskedCredential: 'Bearer ••••••••••••v4',
        headers: {},
        serviceFamily: 'retrieval-agent',
        version: '4.0.0',
      },
      {
        id: 'webhook_retrieval_v3',
        name: '召回 Agent v3',
        description: '当前生产版本',
        url: 'https://agent.example.com/retrieval/v3',
        method: 'POST',
        authType: 'NONE',
        headers: {},
        serviceFamily: 'retrieval-agent',
        version: '3.0.0',
      },
    ],
    runParameters: {
      concurrency: 10,
      timeoutSeconds: 20,
      retryCount: 1,
      rounds: 1,
    },
    createdAt: '2026-07-16T08:00:00.000Z',
    updatedAt: '2026-07-27T08:45:00.000Z',
  },
  {
    id: 'scene_legacy_risk',
    projectId: 'proj_a',
    name: '旧版风险审核',
    description: '历史版本，仅保留报告引用',
    enabled: false,
    supportsScheduledExecution: false,
    defaultScheduledWebhookIds: [],
    datasetId: 'dataset_qa',
    evaluatorIds: ['eval_n8n_safety_review'],
    webhooks: [
      {
        id: 'webhook_risk_v1',
        name: '风险 Agent v1',
        description: '历史审核服务',
        url: 'https://agent.example.com/risk/v1',
        method: 'POST',
        authType: 'NONE',
        headers: {},
        serviceFamily: 'risk-agent',
        version: '1.0.0',
      },
    ],
    runParameters: {
      concurrency: 3,
      timeoutSeconds: 60,
      retryCount: 3,
      rounds: 1,
    },
    createdAt: '2026-07-10T01:00:00.000Z',
    updatedAt: '2026-07-18T01:13:00.000Z',
  },
]

const evaluatorSnapshots = [
  {
    id: 'eval_dify_customer_service_quality',
    name: '客服回答质量工作流评估器',
    type: 'WORKFLOW',
    version: '2.3.0',
    outputVariables: ['answer_quality_score', 'customer_intent_understanding_score'],
    outputVariableMappings: [
      { variableName: 'answer_quality_score', scoreConfigName: 'accuracy' },
      {
        variableName: 'customer_intent_understanding_score',
        scoreConfigName: 'relevance',
      },
    ],
  },
  {
    id: 'eval_n8n_safety_review',
    name: '安全与合规审查工作流',
    type: 'WORKFLOW',
    version: '1.4.2',
    outputVariables: ['safety_score'],
    outputVariableMappings: [
      { variableName: 'safety_score', scoreConfigName: 'risk_score' },
    ],
  },
]

function scoreResults(version: 'v21' | 'v22' | 'v23') {
  const values = {
    v21: [0.8, 0.82, 0.95],
    v22: [0.84, 0.86, 0.96],
    v23: [0.91, 0.88, 0.97],
  }[version]
  return [
    {
      key: 'eval_dify_customer_service_quality:answer_quality_score',
      evaluatorId: 'eval_dify_customer_service_quality',
      evaluatorName: '客服回答质量工作流评估器',
      variableName: 'answer_quality_score',
      scoreName: 'accuracy',
      value: values[0],
      standardDeviation: 0.018,
    },
    {
      key: 'eval_dify_customer_service_quality:customer_intent_understanding_score',
      evaluatorId: 'eval_dify_customer_service_quality',
      evaluatorName: '客服回答质量工作流评估器',
      variableName: 'customer_intent_understanding_score',
      scoreName: 'relevance',
      value: values[1],
      standardDeviation: 0.014,
    },
    {
      key: 'eval_n8n_safety_review:safety_score',
      evaluatorId: 'eval_n8n_safety_review',
      evaluatorName: '安全与合规审查工作流',
      variableName: 'safety_score',
      scoreName: 'risk_score',
      value: values[2],
      standardDeviation: 0.006,
    },
  ]
}

function completedReport(
  id: string,
  groupId: string,
  experimentName: string,
  webhookIndex: number,
  version: 'v21' | 'v22' | 'v23',
  createdAt: string
) {
  const scene = sceneSeeds[0]
  const webhook = scene.webhooks[webhookIndex]
  const scores = scoreResults(version)
  return {
    id,
    projectId: 'proj_a',
    datasetId: 'dataset_qa',
    experimentGroupId: groupId,
    experimentName,
    name: `${experimentName} - ${webhook.name}`,
    sceneId: scene.id,
    sceneSnapshot: scene,
    webhookSnapshot: webhook,
    evaluatorSnapshots,
    runParameters: { ...scene.runParameters, rounds: 3 },
    status: 'COMPLETED',
    progress: 100,
    itemCount: 2,
    successfulItemCount: 2,
    failedItemCount: 0,
    scoreResults: scores,
    roundResults: [1, 2, 3].map((round) => ({
      round,
      scores: Object.fromEntries(scores.map((score) => [score.key, score.value - (3 - round) * 0.005])),
      successCount: 2,
      failureCount: 0,
    })),
    itemResults: [
      {
        itemId: 'item_001',
        input: { question: '如何重置密码？' },
        expectedOutput: { answer: '通过账户设置重置密码' },
        output: { answer: '请进入账户设置并选择重置密码。' },
        scores: Object.fromEntries(scores.map((score) => [score.key, score.value + 0.02])),
        status: 'PASSED',
      },
      {
        itemId: 'item_002',
        input: { question: '如何联系客服？' },
        expectedOutput: { answer: '可通过在线工单联系' },
        output: { answer: '可以提交在线工单联系我们。' },
        scores: Object.fromEntries(scores.map((score) => [score.key, score.value - 0.02])),
        status: 'PASSED',
      },
    ],
    insight: '候选版本在准确性维度表现更好，安全性保持稳定。',
    createdAt,
    completedAt: createdAt,
  }
}

export const experimentGroupSeeds = [
  {
    id: 'experiment_group_001',
    projectId: 'proj_a',
    datasetId: 'dataset_qa',
    name: '客服 Agent 2.3 回归',
    description: '验证候选版本在黄金数据集上的综合表现',
    sceneId: sceneSeeds[0].id,
    sceneSnapshot: sceneSeeds[0],
    evaluatorSnapshots,
    runParameters: { ...sceneSeeds[0].runParameters, rounds: 3 },
    createdAt: '2026-07-28T02:30:00.000Z',
  },
]

export const experimentReportSeeds = [
  completedReport(
    'experiment_report_v23',
    'experiment_group_001',
    '客服 Agent 2.3 回归',
    0,
    'v23',
    '2026-07-28T02:42:00.000Z'
  ),
  completedReport(
    'experiment_report_v22',
    'experiment_group_001',
    '客服 Agent 2.3 回归',
    1,
    'v22',
    '2026-07-28T02:39:00.000Z'
  ),
  completedReport(
    'experiment_report_v21',
    'experiment_group_legacy',
    '客服 Agent 历史基线',
    2,
    'v21',
    '2026-07-20T05:10:00.000Z'
  ),
  {
    ...completedReport(
      'experiment_report_running',
      'experiment_group_running',
      '知识库索引回归',
      0,
      'v23',
      new Date().toISOString()
    ),
    sceneId: sceneSeeds[1].id,
    sceneSnapshot: sceneSeeds[1],
    webhookSnapshot: sceneSeeds[1].webhooks[0],
    name: '知识库索引回归 - 召回 Agent v4',
    status: 'RUNNING',
    progress: 68,
    completedAt: undefined,
  },
]

export const experimentReportBaselineSeeds = [
  {
    id: 'experiment_report_baseline_support',
    projectId: 'proj_a',
    datasetId: 'dataset_qa',
    sceneId: 'scene_customer_full_loop',
    serviceFamily: 'support-agent',
    reportId: 'experiment_report_v21',
    createdAt: '2026-07-20T05:12:00.000Z',
    updatedAt: '2026-07-20T05:12:00.000Z',
  },
]
