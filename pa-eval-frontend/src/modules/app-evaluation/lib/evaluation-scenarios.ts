import {
  Bot,
  Brain,
  CheckCircle2,
  FileSearch,
  GitBranch,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'

export type EvaluationScenario =
  | 'SINGLE_TURN'
  | 'MULTI_TURN'
  | 'TOOL_CALLING'
  | 'MULTI_TURN_TOOL_CALLING'
  | 'RAG_FACTUALITY'
  | 'SAFETY'
  | 'AGENT_SKILL'
  | 'CUSTOM'

export const evaluationScenarioLabels: Record<EvaluationScenario, string> = {
  SINGLE_TURN: '简单回答评估',
  MULTI_TURN: '多轮对话评估',
  TOOL_CALLING: '工具调用评估',
  MULTI_TURN_TOOL_CALLING: '多轮 + 工具调用',
  RAG_FACTUALITY: 'RAG / 事实一致性',
  SAFETY: '安全合规评估',
  AGENT_SKILL: 'Agent / Skill 评估',
  CUSTOM: '自定义评估',
}

export const evaluationScenarioDescriptions: Record<EvaluationScenario, string> =
  {
    SINGLE_TURN: '评估单轮输入输出的正确性、相关性、完整性和指令遵循。',
    MULTI_TURN: '评估 Agent 是否正确记住并使用历史对话里的偏好、约束和事实。',
    TOOL_CALLING: '评估工具选择、参数、调用顺序和工具结果使用是否正确。',
    MULTI_TURN_TOOL_CALLING: '同时检查多轮上下文记忆和工具调用轨迹。',
    RAG_FACTUALITY: '结合上下文或参考答案检查事实一致性和幻觉风险。',
    SAFETY: '检查输出是否包含有害、不合规或不符合企业政策的内容。',
    AGENT_SKILL: '评估 Agent 是否选择并遵循正确 Skill，最终产物是否满足 Skill 要求。',
    CUSTOM: '面向外部工作流、代码规则或企业自定义评价体系。',
  }

export const evaluationScenarioIcons: Record<EvaluationScenario, LucideIcon> = {
  SINGLE_TURN: CheckCircle2,
  MULTI_TURN: Brain,
  TOOL_CALLING: GitBranch,
  MULTI_TURN_TOOL_CALLING: Bot,
  RAG_FACTUALITY: FileSearch,
  SAFETY: ShieldCheck,
  AGENT_SKILL: Puzzle,
  CUSTOM: SlidersHorizontal,
}

export type EvaluationScenarioMetadata = {
  recommendedEvaluator: string
  recommendedDataShape: string
  fieldAliases: string[]
  defaultMetrics: string[]
}

export const evaluationScenarioMetadata: Record<
  EvaluationScenario,
  EvaluationScenarioMetadata
> = {
  SINGLE_TURN: {
    recommendedEvaluator: 'OpenJudge 简单回答 / 工作流评分器',
    recommendedDataShape: 'input、output、expectedOutput，适合单轮问答、摘要、分类。',
    fieldAliases: ['input', 'output', 'expected_output', 'context'],
    defaultMetrics: ['正确性', '相关性', '完整性', '指令遵循'],
  },
  MULTI_TURN: {
    recommendedEvaluator: 'OpenJudge 多轮对话评估器',
    recommendedDataShape:
      'messages、history 或 conversation，保留用户偏好、约束和多轮回复。',
    fieldAliases: ['messages', 'history', 'conversation', 'output'],
    defaultMetrics: ['上下文记忆', '约束遵循', '一致性', '幻觉风险'],
  },
  TOOL_CALLING: {
    recommendedEvaluator: 'OpenJudge 工具调用轨迹评估器',
    recommendedDataShape:
      'trajectory、tool_calls、tool_result，包含工具选择、参数和返回结果。',
    fieldAliases: ['trajectory', 'tool_calls', 'tool_result', 'output'],
    defaultMetrics: ['工具选择', '参数正确性', '调用顺序', '结果使用'],
  },
  MULTI_TURN_TOOL_CALLING: {
    recommendedEvaluator: 'OpenJudge 多轮工具轨迹评估器',
    recommendedDataShape:
      'messages + trajectory，既看多轮上下文，也看工具调用链路。',
    fieldAliases: ['messages', 'history', 'trajectory', 'tool_calls'],
    defaultMetrics: ['上下文记忆', '工具规划', '状态一致性', '最终答案质量'],
  },
  RAG_FACTUALITY: {
    recommendedEvaluator: 'RAG 事实一致性评估器',
    recommendedDataShape:
      'input、output、context / reference，适合检索增强和知识库问答。',
    fieldAliases: ['input', 'output', 'context', 'reference'],
    defaultMetrics: ['事实一致性', '引用覆盖', '无依据断言', '回答完整性'],
  },
  SAFETY: {
    recommendedEvaluator: '安全合规评估器',
    recommendedDataShape: 'input、output、policy，适合企业政策、风险和安全边界。',
    fieldAliases: ['input', 'output', 'policy', 'metadata'],
    defaultMetrics: ['安全性', '合规性', '拒答策略', '敏感信息'],
  },
  AGENT_SKILL: {
    recommendedEvaluator: 'Agent / Skill 执行评估器',
    recommendedDataShape:
      'instruction、skill、trajectory、artifact，检查 Skill 选择、执行过程和产物。',
    fieldAliases: ['instruction', 'skill', 'trajectory', 'artifact'],
    defaultMetrics: ['Skill 选择', '步骤遵循', '轨迹质量', '产物质量'],
  },
  CUSTOM: {
    recommendedEvaluator: '外部工作流或自定义 SDK 评估器',
    recommendedDataShape: '按企业工作流约定组织输入、输出、参考答案和元数据。',
    fieldAliases: ['input', 'output', 'expected_output', 'metadata'],
    defaultMetrics: ['业务规则', '稳定性', '可解释性', '人工复核'],
  },
}

export const evaluationScenarioOptions = Object.entries(
  evaluationScenarioLabels
).map(([value, label]) => ({
  value: value as EvaluationScenario,
  label,
  description: evaluationScenarioDescriptions[value as EvaluationScenario],
  icon: evaluationScenarioIcons[value as EvaluationScenario],
  ...evaluationScenarioMetadata[value as EvaluationScenario],
}))
