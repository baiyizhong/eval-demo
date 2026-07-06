import type {
  DefaultModel,
  LlmConnection,
  ModelDefinition,
  ProjectApiKey,
  ProjectInfo,
  ProjectMember,
  ScoreConfig,
} from '../types'

export const mockProjectInfo: ProjectInfo = {
  id: 'project_customer_agent',
  organizationName: '智能评测实验室',
  name: '客户服务 Agent 评测',
  description: '用于客服 Agent 回答质量、工具调用和人工标注流程的核心项目。',
  retentionDays: 90,
  createdAt: '2026-06-12T09:30:00+08:00',
  updatedAt: '2026-07-03T10:16:00+08:00',
}

export const mockScoreConfigs: ScoreConfig[] = [
  {
    id: 'score_helpfulness',
    name: 'helpfulness',
    dataType: 'NUMERIC',
    description: '衡量回复是否充分解决用户问题。',
    minValue: 1,
    maxValue: 5,
    isArchived: false,
    updatedAt: '2026-07-02T16:24:00+08:00',
  },
  {
    id: 'score_safety',
    name: 'safety_label',
    dataType: 'CATEGORICAL',
    description: '标记回复是否触发安全风险。',
    categories: ['safe', 'warning', 'unsafe'],
    isArchived: false,
    updatedAt: '2026-07-01T13:10:00+08:00',
  },
  {
    id: 'score_grounded',
    name: 'grounded',
    dataType: 'BOOLEAN',
    description: '判断回复是否基于可验证上下文。',
    isArchived: true,
    updatedAt: '2026-06-28T11:00:00+08:00',
  },
]

export const mockProjectMembers: ProjectMember[] = [
  {
    id: 'member_pan',
    name: '潘建建',
    email: 'panjianjian065@example.com',
    role: 'OWNER',
    joinedAt: '2026-06-12T09:30:00+08:00',
    lastActiveAt: '2026-07-03T09:58:00+08:00',
  },
  {
    id: 'member_eval_admin',
    name: '评测管理员',
    email: 'eval-admin@example.com',
    role: 'ADMIN',
    joinedAt: '2026-06-15T14:02:00+08:00',
    lastActiveAt: '2026-07-02T18:35:00+08:00',
  },
  {
    id: 'member_reviewer',
    name: '人工评审员',
    email: 'reviewer@example.com',
    role: 'MEMBER',
    joinedAt: '2026-06-20T10:20:00+08:00',
  },
]

export const mockLlmConnections: LlmConnection[] = [
  {
    id: 'llm_openai_primary',
    provider: 'OpenAI',
    adapter: 'openai',
    displaySecretKey: 'sk-...demo',
    baseUrl: 'https://api.openai.example/v1',
    customModels: ['gpt-4.1', 'gpt-4.1-mini'],
    withDefaultModels: true,
  },
  {
    id: 'llm_internal_gateway',
    provider: 'PA Gateway',
    adapter: 'openai-compatible',
    displaySecretKey: 'sk-pa-...mock',
    baseUrl: 'https://llm-gateway.example/v1',
    customModels: ['pa-eval-large', 'pa-eval-fast'],
    withDefaultModels: false,
  },
]

export const mockDefaultModel: DefaultModel = {
  id: 'default_eval_model',
  llmConnectionId: 'llm_openai_primary',
  provider: 'OpenAI',
  adapter: 'openai',
  model: 'gpt-4.1-mini',
  temperature: '0.2',
}

export const mockModelDefinitions: ModelDefinition[] = [
  {
    id: 'model_gpt_41_mini',
    modelName: 'gpt-4.1-mini',
    matchPattern: 'gpt-4.1-mini*',
    unit: 'TOKENS',
    inputPrice: '0.40 / 1M tokens',
    outputPrice: '1.60 / 1M tokens',
    tokenizerId: 'openai',
  },
  {
    id: 'model_pa_eval_fast',
    modelName: 'pa-eval-fast',
    matchPattern: 'pa-eval-fast*',
    unit: 'TOKENS',
    inputPrice: '0.20 / 1M tokens',
    outputPrice: '0.80 / 1M tokens',
    tokenizerId: 'cl100k_base',
  },
]

export const mockProjectApiKeys: ProjectApiKey[] = [
  {
    id: 'key_eval_ci',
    projectId: 'project_customer_agent',
    note: 'CI 评测流水线',
    publicKey: 'pk-lf-demo-ci',
    secretKey: 'sk-lf-demo-ci',
    status: 'ACTIVE',
    lastUsedAt: '2026-07-03T08:42:00+08:00',
    createdAt: '2026-06-16T15:10:00+08:00',
    updatedAt: '2026-06-16T15:10:00+08:00',
  },
  {
    id: 'key_local_debug',
    projectId: 'project_customer_agent',
    note: '本地调试',
    publicKey: 'pk-lf-demo-local',
    secretKey: 'sk-lf-demo-local',
    status: 'ACTIVE',
    createdAt: '2026-06-25T11:20:00+08:00',
    updatedAt: '2026-06-25T11:20:00+08:00',
  },
]
