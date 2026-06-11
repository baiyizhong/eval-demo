export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  traceCount: number;
  createdAt: string;
  lastActiveAt: string;
  tenantId: string;
}

export interface Trace {
  id: string;
  projectId: string;
  sessionId: string;
  model: string;
  status: 'success' | 'error' | 'partial_error' | 'timeout';
  startTime: string;
  duration: number;
  cost: number;
  tokens: number;
  userId: string;
}

export interface EvaluationTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  dataset: string;
  evaluator: string;
  progress: number;
  total: number;
  createdAt: string;
  completedAt?: string;
  avgScore?: number;
}

export interface Evaluator {
  id: string;
  name: string;
  type: 'llm_judge' | 'code_rule' | 'heuristic';
  status: 'active' | 'inactive';
  usageCount: number;
  createdAt: string;
  judgeModel?: string;
  dimensions?: string[];
}

export interface FilterCondition {
  id: string;
  field: string;
  operator: '等于' | '不等于' | '包含' | '不包含' | '大于' | '小于' | '正则表达式';
  value: string;
}

export interface LLMJudgeTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'paused' | 'cancelled' | 'failed';
  evaluatorId: string;
  evaluatorName: string;
  judgeModel: string;
  dimensions: string[];
  datasetId: string;
  datasetName: string;
  datasetVersion: string;
  filterConditions: FilterCondition[];
  samplingMethod: '全量执行' | '随机采样N条' | '随机采样X%' | '均匀采样' | '分层采样';
  samplingValue?: number;
  progress: number;
  total: number;
  concurrency: number;
  retries: number;
  cacheEnabled: boolean;
  createdAt: string;
  startedAt?: string;
  avgScore?: number;
}

export type DatasetCategory = 'evaluation' | 'badcase' | 'golden' | 'anomaly';

export interface Dataset {
  id: string;
  name: string;
  category: DatasetCategory;
  source: 'annotation' | 'auto' | 'import' | 'trace';
  itemCount: number;
  version: string;
  createdAt: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface Tenant {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  traceUsed: number;
  traceLimit: number;
  userCount: number;
  userLimit: number;
  createdAt: string;
  status: 'active' | 'suspended';
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'invited' | 'active' | 'suspended';
  tenantId: string;
  joinedAt: string;
}

export interface AnnotationDimension {
  id: string;
  label: string;
  type: 'numeric' | 'boolean' | 'categorical';
  desc: string;
  range?: [number, number];
  options?: string[];
}

export interface AnnotationTask {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'review' | 'approved' | 'rejected';
  total: number;
  completed: number;
  assignedTo: string;
  createdAt: string;
  dimensions?: AnnotationDimension[];
}

export const mockProjects: Project[] = [
  { id: 'p1', name: '医疗问答助手', description: '面向临床决策支持的 LLM 问答系统，与医院 EMR 系统深度集成。', status: 'active', traceCount: 12847, createdAt: '2026-01-15', lastActiveAt: '2026-06-10', tenantId: 't1' },
  { id: 'p2', name: '客服智能机器人', description: '处理退款申请、技术问题和产品咨询的自动化一线客服代理。', status: 'active', traceCount: 45231, createdAt: '2026-02-03', lastActiveAt: '2026-06-10', tenantId: 't1' },
  { id: 'p3', name: '代码审查助手', description: '基于 Claude 的自动化代码审查流水线，提供安全性、正确性和风格反馈。', status: 'active', traceCount: 8932, createdAt: '2026-03-10', lastActiveAt: '2026-06-09', tenantId: 't1' },
  { id: 'p4', name: '法律文档摘要', description: '面向法务团队的合同分析与摘要工具，支持 12 种文档类型。', status: 'active', traceCount: 3201, createdAt: '2026-03-22', lastActiveAt: '2026-06-08', tenantId: 't1' },
  { id: 'p5', name: '销售智能副驾', description: '会议后实时生成跟进邮件并自动更新 CRM 的销售助手。', status: 'active', traceCount: 7654, createdAt: '2026-04-01', lastActiveAt: '2026-06-07', tenantId: 't1' },
  { id: 'p6', name: 'HR 政策机器人（旧版）', description: '已废弃的 HR 政策问答机器人，功能已迁移至客服智能机器人。', status: 'archived', traceCount: 1230, createdAt: '2025-10-10', lastActiveAt: '2026-02-01', tenantId: 't1' },
];

export const mockTraces: Trace[] = [
  { id: 'tr001', projectId: 'p1', sessionId: 'sess_8a2f', model: 'gpt-4o', status: 'success', startTime: '2026-06-10T14:32:11.453Z', duration: 1823, cost: 0.0042, tokens: 2341, userId: 'user_alice' },
  { id: 'tr002', projectId: 'p1', sessionId: 'sess_9b3g', model: 'claude-3-5-sonnet', status: 'error', startTime: '2026-06-10T14:31:05.123Z', duration: 312, cost: 0.0011, tokens: 634, userId: 'user_bob' },
  { id: 'tr003', projectId: 'p1', sessionId: 'sess_7c4h', model: 'gpt-4o-mini', status: 'success', startTime: '2026-06-10T14:30:45.789Z', duration: 945, cost: 0.0008, tokens: 1203, userId: 'user_alice' },
  { id: 'tr004', projectId: 'p1', sessionId: 'sess_6d5i', model: 'gpt-4o', status: 'timeout', startTime: '2026-06-10T14:29:33.456Z', duration: 30012, cost: 0.0231, tokens: 8932, userId: 'user_charlie' },
  { id: 'tr005', projectId: 'p1', sessionId: 'sess_5e6j', model: 'claude-3-5-sonnet', status: 'success', startTime: '2026-06-10T14:28:22.111Z', duration: 2341, cost: 0.0067, tokens: 3421, userId: 'user_diana' },
  { id: 'tr006', projectId: 'p1', sessionId: 'sess_4f7k', model: 'gemini-1.5-pro', status: 'partial_error', startTime: '2026-06-10T14:27:10.999Z', duration: 1560, cost: 0.0034, tokens: 2100, userId: 'user_bob' },
  { id: 'tr007', projectId: 'p1', sessionId: 'sess_3g8l', model: 'gpt-4o', status: 'success', startTime: '2026-06-10T14:26:55.222Z', duration: 1122, cost: 0.0028, tokens: 1876, userId: 'user_alice' },
  { id: 'tr008', projectId: 'p1', sessionId: 'sess_2h9m', model: 'gpt-4o-mini', status: 'success', startTime: '2026-06-10T14:25:43.333Z', duration: 678, cost: 0.0006, tokens: 987, userId: 'user_charlie' },
  { id: 'tr009', projectId: 'p1', sessionId: 'sess_1i0n', model: 'claude-3-5-sonnet', status: 'error', startTime: '2026-06-10T14:24:31.444Z', duration: 201, cost: 0.0003, tokens: 312, userId: 'user_diana' },
  { id: 'tr010', projectId: 'p1', sessionId: 'sess_0j1o', model: 'gpt-4o', status: 'success', startTime: '2026-06-10T14:23:19.555Z', duration: 1987, cost: 0.0055, tokens: 2987, userId: 'user_alice' },
];

export const mockEvaluationTasks: EvaluationTask[] = [
  { id: 'et001', name: '问答准确性评测 v3', status: 'completed', dataset: 'medical-qa-v3', evaluator: 'accuracy-judge', progress: 200, total: 200, createdAt: '2026-06-01', completedAt: '2026-06-01', avgScore: 7.8 },
  { id: 'et002', name: '安全性回归测试', status: 'running', dataset: 'safety-bench-v2', evaluator: 'safety-judge', progress: 87, total: 150, createdAt: '2026-06-10', avgScore: 8.4 },
  { id: 'et003', name: '幻觉检测评测', status: 'completed', dataset: 'halluc-test-v1', evaluator: 'factual-judge', progress: 100, total: 100, createdAt: '2026-05-28', completedAt: '2026-05-28', avgScore: 6.2 },
  { id: 'et004', name: '回复长度审计', status: 'pending', dataset: 'prod-sample-v1', evaluator: 'response-length', progress: 0, total: 500, createdAt: '2026-06-10' },
  { id: 'et005', name: '语气与风格审查', status: 'failed', dataset: 'style-check-v1', evaluator: 'style-judge', progress: 23, total: 200, createdAt: '2026-06-09' },
  { id: 'et006', name: '多轮对话连贯性', status: 'cancelled', dataset: 'conv-bench-v2', evaluator: 'coherence-judge', progress: 45, total: 300, createdAt: '2026-06-08' },
];

export const mockEvaluators: Evaluator[] = [
  { id: 'ev001', name: 'accuracy-judge', type: 'llm_judge', status: 'active', usageCount: 1234, createdAt: '2026-05-01', judgeModel: 'gpt-4o', dimensions: ['准确性', '完整性', '相关性'] },
  { id: 'ev002', name: 'json-valid-check', type: 'code_rule', status: 'active', usageCount: 5678, createdAt: '2026-05-03' },
  { id: 'ev003', name: 'response-length', type: 'heuristic', status: 'inactive', usageCount: 230, createdAt: '2026-04-20' },
  { id: 'ev004', name: 'safety-judge', type: 'llm_judge', status: 'active', usageCount: 891, createdAt: '2026-05-15', judgeModel: 'claude-3-5-sonnet', dimensions: ['安全性', '合规性'] },
  { id: 'ev005', name: 'factual-judge', type: 'llm_judge', status: 'active', usageCount: 456, createdAt: '2026-05-22', judgeModel: 'gpt-4o', dimensions: ['事实准确性', '幻觉检测'] },
  { id: 'ev006', name: 'keyword-presence', type: 'heuristic', status: 'active', usageCount: 3421, createdAt: '2026-04-10' },
  { id: 'ev007', name: 'coherence-judge', type: 'llm_judge', status: 'inactive', usageCount: 123, createdAt: '2026-06-01', judgeModel: 'gemini-1.5-pro', dimensions: ['连贯性', '流畅性'] },
];

export const mockDatasets: Dataset[] = [
  { id: 'ds001', name: 'medical-qa-v3', category: 'evaluation', source: 'annotation', itemCount: 200, version: 'v3', createdAt: '2026-05-15', description: '医疗问答场景的高质量标注数据集，涵盖内科、外科、药学等多个领域。', metadata: { author: '陈小丽', tags: 'medical,qa', domain: 'healthcare' } },
  { id: 'ds002', name: 'auto-generated-v1', category: 'evaluation', source: 'auto', itemCount: 500, version: 'v1', createdAt: '2026-05-20', description: '通过 few-shot prompting 自动生成的合成数据，用于快速扩充训练集。', metadata: { generator: 'gpt-4o', tags: 'synthetic' } },
  { id: 'ds003', name: 'import-chatbot', category: 'evaluation', source: 'import', itemCount: 100, version: 'v1', createdAt: '2026-04-10', description: '从外部客服系统导出的对话数据，包含用户真实问题和人工回复。' },
  { id: 'ds004', name: 'safety-bench-v2', category: 'badcase', source: 'annotation', itemCount: 150, version: 'v2', createdAt: '2026-06-01', description: '专注于安全性评测的基准数据集，包含对抗性样本和边界案例。', metadata: { author: '张明博', tags: 'safety,benchmark', version_note: '新增 30 条对抗样本' } },
  { id: 'ds005', name: 'halluc-test-v1', category: 'badcase', source: 'trace', itemCount: 100, version: 'v1', createdAt: '2026-05-28', description: '从 Trace 日志中筛选出的幻觉检测样本，包含模型错误输出的典型案例。', metadata: { source_project: 'p1', tags: 'hallucination,trace' } },
  { id: 'ds006', name: 'medical-golden-core', category: 'golden', source: 'annotation', itemCount: 80, version: 'v1', createdAt: '2026-06-08', description: '经过专家复核的核心黄金集，用于回归校准和评估器基线验证。', metadata: { author: '陈小丽', tags: 'golden,medical,baseline', review_status: 'expert_approved' } },
  { id: 'ds007', name: 'prod-anomaly-june', category: 'anomaly', source: 'trace', itemCount: 64, version: 'v1', createdAt: '2026-06-10', description: '从生产 Trace 中自动聚类出的异常样本，覆盖超时、工具调用失败和低置信度回复。', metadata: { source_project: 'p1', tags: 'anomaly,timeout,low-confidence', detector: 'trace_anomaly_v2' } },
];

export const mockTenants: Tenant[] = [
  { id: 't1', name: '安辉医疗科技', plan: 'enterprise', traceUsed: 128400, traceLimit: 500000, userCount: 24, userLimit: 50, createdAt: '2026-01-01', status: 'active' },
  { id: 't2', name: '启明信息技术', plan: 'pro', traceUsed: 45200, traceLimit: 100000, userCount: 8, userLimit: 20, createdAt: '2026-02-10', status: 'active' },
  { id: 't3', name: '星辰创业实验室', plan: 'free', traceUsed: 9800, traceLimit: 10000, userCount: 3, userLimit: 5, createdAt: '2026-03-05', status: 'active' },
  { id: 't4', name: '卓越法律合伙人', plan: 'pro', traceUsed: 31000, traceLimit: 100000, userCount: 12, userLimit: 20, createdAt: '2026-01-20', status: 'active' },
  { id: 't5', name: '零售机器人公司', plan: 'enterprise', traceUsed: 89000, traceLimit: 200000, userCount: 18, userLimit: 30, createdAt: '2025-12-01', status: 'suspended' },
];

export const mockUsers: User[] = [
  { id: 'u1', name: '陈小丽', email: 'alice@anhui-medical.com', role: 'owner', status: 'active', tenantId: 't1', joinedAt: '2026-01-01' },
  { id: 'u2', name: '张明博', email: 'bob@anhui-medical.com', role: 'admin', status: 'active', tenantId: 't1', joinedAt: '2026-01-15' },
  { id: 'u3', name: '刘成远', email: 'charlie@anhui-medical.com', role: 'member', status: 'active', tenantId: 't1', joinedAt: '2026-02-01' },
  { id: 'u4', name: '王思雨', email: 'diana@anhui-medical.com', role: 'member', status: 'active', tenantId: 't1', joinedAt: '2026-02-15' },
  { id: 'u5', name: '孙浩宇', email: 'eric@anhui-medical.com', role: 'viewer', status: 'invited', tenantId: 't1', joinedAt: '2026-06-05' },
  { id: 'u6', name: '李芳芳', email: 'frank@qiming-tech.com', role: 'owner', status: 'active', tenantId: 't2', joinedAt: '2026-02-10' },
  { id: 'u7', name: '金晓燕', email: 'grace@qiming-tech.com', role: 'member', status: 'active', tenantId: 't2', joinedAt: '2026-03-01' },
];

const DIMS_MEDICAL: AnnotationDimension[] = [
  { id: 'd1', label: '准确性', type: 'numeric', desc: '回答的事实正确性', range: [0, 10] },
  { id: 'd2', label: '相关性', type: 'numeric', desc: '是否切题回答问题', range: [0, 10] },
  { id: 'd3', label: '安全性', type: 'numeric', desc: '无有害或危险内容', range: [0, 10] },
  { id: 'd4', label: '是否合规', type: 'boolean', desc: '输出是否符合医疗合规要求' },
  { id: 'd5', label: '质量等级', type: 'categorical', desc: '综合质量评级', options: ['优', '良', '差'] },
];

const DIMS_SERVICE: AnnotationDimension[] = [
  { id: 'd1', label: '相关性', type: 'numeric', desc: '回复是否切题', range: [0, 10] },
  { id: 'd2', label: '完整性', type: 'numeric', desc: '是否充分回答用户需求', range: [0, 10] },
  { id: 'd3', label: '是否解决问题', type: 'boolean', desc: '该回复是否最终解决了用户的问题' },
  { id: 'd4', label: '满意度', type: 'categorical', desc: '预估用户满意程度', options: ['满意', '一般', '不满意'] },
];

const DIMS_CODE: AnnotationDimension[] = [
  { id: 'd1', label: '正确性', type: 'numeric', desc: '代码逻辑是否正确', range: [0, 10] },
  { id: 'd2', label: '安全性', type: 'numeric', desc: '是否存在安全漏洞', range: [0, 10] },
  { id: 'd3', label: '风格合规', type: 'boolean', desc: '是否符合项目编码规范' },
  { id: 'd4', label: '代码质量', type: 'categorical', desc: '整体代码质量评级', options: ['优秀', '合格', '需重写'] },
];

export const mockAnnotationTasks: AnnotationTask[] = [
  {
    id: 'at001', name: '医疗问答质量标注 v1',
    description: '对医疗问答助手的输出进行多维质量标注，构建高质量 Ground Truth 数据集。',
    status: 'in_progress', total: 100, completed: 45, assignedTo: '陈小丽', createdAt: '2026-06-05',
    dimensions: DIMS_MEDICAL,
  },
  {
    id: 'at002', name: '客服回复相关性标注',
    description: '评估客服智能机器人的回复质量，重点关注相关性和问题解决率。',
    status: 'review', total: 200, completed: 200, assignedTo: '张明博', createdAt: '2026-06-01',
    dimensions: DIMS_SERVICE,
  },
  {
    id: 'at003', name: '代码质量人工评审',
    description: '对代码审查助手的输出进行人工评审，验证代码分析的准确性。',
    status: 'approved', total: 50, completed: 50, assignedTo: '刘成远', createdAt: '2026-05-28',
    dimensions: DIMS_CODE,
  },
  {
    id: 'at004', name: '有害内容识别标注',
    description: '标注潜在有害内容，用于训练安全分类器和改进内容过滤策略。',
    status: 'pending', total: 150, completed: 0, assignedTo: '未分配', createdAt: '2026-06-10',
    dimensions: DIMS_MEDICAL,
  },
];

export const scoreDistribution = [
  { range: '0-2', count: 8 },
  { range: '3-5', count: 24 },
  { range: '6-8', count: 98 },
  { range: '9-10', count: 70 },
];

export const radarData = [
  { dimension: '准确性', score: 7.8 },
  { dimension: '相关性', score: 8.4 },
  { dimension: '安全性', score: 9.1 },
  { dimension: '完整性', score: 6.9 },
  { dimension: '流畅性', score: 8.2 },
];

export const mockLLMJudgeTasks: LLMJudgeTask[] = [
  {
    id: 'jt001',
    name: '问答准确性 LLM Judge v4',
    status: 'running',
    evaluatorId: 'ev001',
    evaluatorName: 'accuracy-judge',
    judgeModel: 'gpt-4o',
    dimensions: ['准确性', '完整性', '相关性'],
    datasetId: 'ds001',
    datasetName: 'medical-qa-v3',
    datasetVersion: 'v3',
    filterConditions: [{ id: 'f1', field: 'reference_output', operator: '不等于', value: '' }],
    samplingMethod: '全量执行',
    progress: 134,
    total: 200,
    concurrency: 5,
    retries: 2,
    cacheEnabled: true,
    createdAt: '2026-06-10T09:00:00Z',
    startedAt: '2026-06-10T09:01:12Z',
    avgScore: 7.6,
  },
  {
    id: 'jt002',
    name: '安全性回归 v2',
    status: 'running',
    evaluatorId: 'ev004',
    evaluatorName: 'safety-judge',
    judgeModel: 'claude-3-5-sonnet',
    dimensions: ['安全性', '合规性'],
    datasetId: 'ds004',
    datasetName: 'safety-bench-v2',
    datasetVersion: 'v2',
    filterConditions: [],
    samplingMethod: '随机采样N条',
    samplingValue: 100,
    progress: 67,
    total: 100,
    concurrency: 10,
    retries: 1,
    cacheEnabled: true,
    createdAt: '2026-06-10T10:30:00Z',
    startedAt: '2026-06-10T10:31:05Z',
    avgScore: 8.9,
  },
  {
    id: 'jt003',
    name: '幻觉检测 — 产线样本',
    status: 'pending',
    evaluatorId: 'ev005',
    evaluatorName: 'factual-judge',
    judgeModel: 'gpt-4o',
    dimensions: ['事实准确性', '幻觉检测'],
    datasetId: 'ds002',
    datasetName: 'auto-generated-v1',
    datasetVersion: 'v1',
    filterConditions: [{ id: 'f1', field: 'metadata.model', operator: '等于', value: 'gpt-4o' }],
    samplingMethod: '随机采样X%',
    samplingValue: 20,
    progress: 0,
    total: 100,
    concurrency: 5,
    retries: 2,
    cacheEnabled: false,
    createdAt: '2026-06-10T11:00:00Z',
  },
  {
    id: 'jt004',
    name: '客服回复质量评测',
    status: 'pending',
    evaluatorId: 'ev001',
    evaluatorName: 'accuracy-judge',
    judgeModel: 'gpt-4o',
    dimensions: ['准确性', '完整性', '相关性'],
    datasetId: 'ds003',
    datasetName: 'import-chatbot',
    datasetVersion: 'v1',
    filterConditions: [{ id: 'f1', field: 'input', operator: '不包含', value: '敏感词' }],
    samplingMethod: '均匀采样',
    progress: 0,
    total: 80,
    concurrency: 3,
    retries: 3,
    cacheEnabled: true,
    createdAt: '2026-06-10T11:15:00Z',
  },
];

export const traceOverTimeData = [
  { time: '00:00', count: 120, errors: 3 },
  { time: '02:00', count: 89, errors: 1 },
  { time: '04:00', count: 45, errors: 0 },
  { time: '06:00', count: 67, errors: 2 },
  { time: '08:00', count: 234, errors: 8 },
  { time: '10:00', count: 456, errors: 12 },
  { time: '12:00', count: 512, errors: 15 },
  { time: '14:00', count: 489, errors: 11 },
  { time: '16:00', count: 534, errors: 9 },
  { time: '18:00', count: 378, errors: 7 },
  { time: '20:00', count: 234, errors: 5 },
  { time: '22:00', count: 156, errors: 3 },
];
