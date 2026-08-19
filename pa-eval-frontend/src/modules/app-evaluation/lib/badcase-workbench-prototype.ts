export type BadcaseStage =
  | 'PENDING_CONFIRM'
  | 'PENDING_ROOT_CAUSE'
  | 'FIXING'
  | 'PENDING_RETEST'
  | 'PENDING_VERIFY'
  | 'CLOSED'

export type BadcaseDatasetCandidate = {
  id: string
  name: string
  description: string
  tags: string[]
  owner: string
  totalCount: number
  openCount: number
  overdueCount: number
  highPriorityCount: number
  updatedAt: string
  stageCounts: Record<BadcaseStage, number>
}

export type BadcaseItem = {
  id: string
  title: string
  datasetId: string
  stage: BadcaseStage
  priority: 'P0' | 'P1' | 'P2'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  failureType: string
  owner: string
  fixOwner: string
  fixDueAt: string
  overdueMinutes: number
  sourceTraceId: string
  sourceObservationId: string
  summary: string
  rootCause: string
  evidence: string
  fixPlan: string
  retestResult: string
  verifyNote: string
  regressionCandidate: boolean
  updatedAt: string
  lastAction: string
  history: BadcaseHistoryEvent[]
}

export type BadcaseHistoryEvent = {
  from: BadcaseStage
  to: BadcaseStage
  operator: string
  owner: string
  reason: string
  occurredAt: string
}

export type BadcaseFilters = {
  keyword: string
  stage: BadcaseStage | 'all'
  priorities: BadcaseItem['priority'][]
  owners: string[]
  failureTypes: string[]
  overdueOnly: boolean
}

export type BadcasePrimaryTransitionInput = {
  note: string
  nextOwner: string
  targetStage?: BadcaseStage
  actionLabel?: string
}

export type BadcaseDetailTab =
  'context' | 'rootCause' | 'fixRetest' | 'regression'

export type BadcaseStageActionContent = {
  tab: BadcaseDetailTab
  required: string[]
  primaryAction: string
  secondaryActions: string[]
  inputLabel: string
  placeholder: string
}

export const lifecycleStages: {
  value: BadcaseStage
  label: string
  shortLabel: string
  description: string
}[] = [
  {
    value: 'PENDING_CONFIRM',
    label: '待确认',
    shortLabel: '确认',
    description: '确认有效性、重复性和处理必要性',
  },
  {
    value: 'PENDING_ROOT_CAUSE',
    label: '待归因',
    shortLabel: '归因',
    description: '明确失败类型、根因和影响面',
  },
  {
    value: 'FIXING',
    label: '修复中',
    shortLabel: '修复',
    description: '推进修复方案并关注 SLA',
  },
  {
    value: 'PENDING_RETEST',
    label: '待复测',
    shortLabel: '复测',
    description: '复跑样本并记录输入输出对比',
  },
  {
    value: 'PENDING_VERIFY',
    label: '待验证',
    shortLabel: '验证',
    description: '验收结果并决定是否关闭',
  },
  {
    value: 'CLOSED',
    label: '已关闭',
    shortLabel: '关闭',
    description: '沉淀回归候选与治理历史',
  },
]

export const datasetCandidates: BadcaseDatasetCandidate[] = [
  {
    id: 'dataset_badcase_customer_service',
    name: '客服多轮对话 Badcase 集',
    description: '客服问答、追问澄清和订单状态类失败样本沉淀。',
    tags: ['客服', '多轮', '线上回流'],
    owner: 'QA / Li',
    totalCount: 72,
    openCount: 31,
    overdueCount: 4,
    highPriorityCount: 8,
    updatedAt: '2026-08-18 16:20',
    stageCounts: {
      PENDING_CONFIRM: 7,
      PENDING_ROOT_CAUSE: 8,
      FIXING: 9,
      PENDING_RETEST: 4,
      PENDING_VERIFY: 3,
      CLOSED: 41,
    },
  },
  {
    id: 'dataset_badcase_policy_qa',
    name: '政策问答 Badcase 集',
    description: '政策条款理解、边界条件和拒答策略问题集合。',
    tags: ['政策', '合规', 'P1'],
    owner: '产品运营 / Chen',
    totalCount: 44,
    openCount: 16,
    overdueCount: 1,
    highPriorityCount: 5,
    updatedAt: '2026-08-18 13:45',
    stageCounts: {
      PENDING_CONFIRM: 3,
      PENDING_ROOT_CAUSE: 5,
      FIXING: 4,
      PENDING_RETEST: 2,
      PENDING_VERIFY: 2,
      CLOSED: 28,
    },
  },
  {
    id: 'dataset_badcase_tool_call',
    name: '工具调用 Badcase 集',
    description: '工具参数生成、权限边界、结果解释错误的回归候选。',
    tags: ['工具调用', 'Agent', '回归'],
    owner: '平台工程 / Wang',
    totalCount: 58,
    openCount: 22,
    overdueCount: 3,
    highPriorityCount: 6,
    updatedAt: '2026-08-17 18:05',
    stageCounts: {
      PENDING_CONFIRM: 5,
      PENDING_ROOT_CAUSE: 6,
      FIXING: 6,
      PENDING_RETEST: 3,
      PENDING_VERIFY: 2,
      CLOSED: 36,
    },
  },
]

export const badcaseItems: BadcaseItem[] = [
  {
    id: 'BC-20260818-0052',
    datasetId: 'dataset_badcase_customer_service',
    title: '多轮追问中误继承上一个客户的产品类型',
    stage: 'FIXING',
    priority: 'P1',
    severity: 'HIGH',
    failureType: 'MULTI_TURN_STATE_ERROR',
    owner: '平台工程 / Wang',
    fixOwner: '平台工程 / Wang',
    fixDueAt: '08-22 18:00',
    overdueMinutes: 0,
    sourceTraceId: 'trace_f4417a0e',
    sourceObservationId: 'obs_9a1b',
    summary: '用户切换客户后，模型仍沿用上一客户的产品类型并给出错误建议。',
    rootCause: 'session memory 写入缺少 projectId 与 customerId 隔离键。',
    evidence:
      'trace 中第 7 轮 customerId 已变化，但 observation 仍读取上一轮 productType。',
    fixPlan: '补齐 session key 隔离并增加多租户回归用例。',
    retestResult: '等待修复提交后触发同样本复跑。',
    verifyNote: '验证时需覆盖连续切换客户和返回上一客户两种路径。',
    regressionCandidate: true,
    updatedAt: '16:20',
    lastAction: '提交归因，转平台工程修复',
    history: [
      {
        from: 'PENDING_ROOT_CAUSE',
        to: 'FIXING',
        operator: 'QA / Li',
        owner: '平台工程 / Wang',
        reason: '根因已确认，转平台工程修复',
        occurredAt: '2026-08-18 15:20',
      },
    ],
  },
  {
    id: 'BC-20260818-0049',
    datasetId: 'dataset_badcase_customer_service',
    title: '订单取消场景未识别高风险挽留话术',
    stage: 'PENDING_ROOT_CAUSE',
    priority: 'P0',
    severity: 'HIGH',
    failureType: 'SAFETY_POLICY_MISS',
    owner: '策略产品 / Zhao',
    fixOwner: '未指派',
    fixDueAt: '待填写',
    overdueMinutes: 0,
    sourceTraceId: 'trace_b91c22d1',
    sourceObservationId: 'obs_f0ac',
    summary: '面对用户明确取消请求时，模型输出了不合规挽留措辞。',
    rootCause: '待补充根因分类和证据。',
    evidence: '人工标注命中“强挽留”标签，分数为 0。',
    fixPlan: '待归因后指定修复责任人。',
    retestResult: '尚未进入复测。',
    verifyNote: '需复核最新拒答与服务恢复策略。',
    regressionCandidate: false,
    updatedAt: '15:52',
    lastAction: '确认有效，等待归因',
    history: [
      {
        from: 'PENDING_CONFIRM',
        to: 'PENDING_ROOT_CAUSE',
        operator: 'QA / Li',
        owner: '策略产品 / Zhao',
        reason: '确认属于高风险挽留策略问题',
        occurredAt: '2026-08-18 15:52',
      },
    ],
  },
  {
    id: 'BC-20260818-0047',
    datasetId: 'dataset_badcase_customer_service',
    title: '优惠券叠加计算时漏掉会员等级限制',
    stage: 'PENDING_RETEST',
    priority: 'P2',
    severity: 'MEDIUM',
    failureType: 'BUSINESS_RULE_MISS',
    owner: 'QA / Li',
    fixOwner: '业务配置 / Sun',
    fixDueAt: '08-19 12:00',
    overdueMinutes: 0,
    sourceTraceId: 'trace_d10a83f5',
    sourceObservationId: 'obs_41de',
    summary: '模型给普通会员计算了仅黑金会员可用的叠加优惠。',
    rootCause: '优惠规则检索未返回会员等级约束字段。',
    evidence: 'retrieval 结果缺失 memberLevelLimit。',
    fixPlan: '配置检索字段白名单，补齐会员等级约束。',
    retestResult: '修复已提交，等待自动复测。',
    verifyNote: '复测通过后验证影响面。',
    regressionCandidate: true,
    updatedAt: '14:36',
    lastAction: '提交修复，等待复测',
    history: [
      {
        from: 'FIXING',
        to: 'PENDING_RETEST',
        operator: '业务配置 / Sun',
        owner: 'QA / Li',
        reason: '检索字段白名单已更新',
        occurredAt: '2026-08-18 14:36',
      },
    ],
  },
  {
    id: 'BC-20260818-0044',
    datasetId: 'dataset_badcase_customer_service',
    title: '售后工单已关闭仍继续承诺人工回访',
    stage: 'PENDING_CONFIRM',
    priority: 'P1',
    severity: 'HIGH',
    failureType: 'CONTEXT_CONFLICT',
    owner: 'QA / Li',
    fixOwner: '未指派',
    fixDueAt: '待填写',
    overdueMinutes: 0,
    sourceTraceId: 'trace_e22a1049',
    sourceObservationId: 'obs_22c8',
    summary: '系统上下文显示工单已关闭，模型仍承诺创建回访。',
    rootCause: '待确认是否为重复问题。',
    evidence: '相似 badcase BC-20260812-0018 已关闭。',
    fixPlan: '确认后再进入归因。',
    retestResult: '尚未进入复测。',
    verifyNote: '需要判断是否关闭为重复。',
    regressionCandidate: false,
    updatedAt: '13:10',
    lastAction: '从人工标注队列加入',
    history: [],
  },
  {
    id: 'BC-20260817-0031',
    datasetId: 'dataset_badcase_customer_service',
    title: '发票抬头修改后返回了旧税号',
    stage: 'PENDING_VERIFY',
    priority: 'P1',
    severity: 'HIGH',
    failureType: 'CACHE_STALE',
    owner: '业务验证 / Huang',
    fixOwner: '平台工程 / Wang',
    fixDueAt: '08-18 10:00',
    overdueMinutes: 145,
    sourceTraceId: 'trace_c71d8901',
    sourceObservationId: 'obs_1c90',
    summary: '用户已修改发票抬头，模型回答中仍使用旧税号。',
    rootCause: 'profile cache TTL 高于数据同步延迟窗口。',
    evidence: '复测中缓存刷新后问题已消失。',
    fixPlan: '降低税务资料 cache TTL 并增加变更事件失效。',
    retestResult: '自动复测通过，等待业务验收。',
    verifyNote: '需要确认历史 profile 不再被命中。',
    regressionCandidate: true,
    updatedAt: '11:08',
    lastAction: '复测通过，转业务验证',
    history: [
      {
        from: 'PENDING_RETEST',
        to: 'PENDING_VERIFY',
        operator: 'QA / Li',
        owner: '业务验证 / Huang',
        reason: '自动复测通过，等待业务验收',
        occurredAt: '2026-08-18 11:08',
      },
    ],
  },
  {
    id: 'BC-20260816-0020',
    datasetId: 'dataset_badcase_customer_service',
    title: '配送时效咨询中错误引用节假日规则',
    stage: 'CLOSED',
    priority: 'P2',
    severity: 'LOW',
    failureType: 'KNOWLEDGE_VERSION_LAG',
    owner: 'QA / Li',
    fixOwner: '知识运营 / Meng',
    fixDueAt: '08-17 20:00',
    overdueMinutes: 0,
    sourceTraceId: 'trace_11fabc02',
    sourceObservationId: 'obs_83d2',
    summary: '模型使用旧版节假日配送规则，导致承诺时效偏差。',
    rootCause: '知识版本未同步到评测环境。',
    evidence: '新版规则发布时间晚于评测环境索引时间。',
    fixPlan: '同步知识版本并补充索引更新时间校验。',
    retestResult: '复测通过。',
    verifyNote: '已关闭并加入回归集。',
    regressionCandidate: true,
    updatedAt: '昨天',
    lastAction: '验证通过并关闭',
    history: [
      {
        from: 'PENDING_VERIFY',
        to: 'CLOSED',
        operator: 'QA / Li',
        owner: 'QA / Li',
        reason: '知识版本已同步且回归通过',
        occurredAt: '2026-08-17 18:42',
      },
    ],
  },
]

export const stageActionContent: Record<
  BadcaseStage,
  BadcaseStageActionContent
> = {
  PENDING_CONFIRM: {
    tab: 'context',
    required: ['确认备注', '下一责任人'],
    primaryAction: '确认有效',
    secondaryActions: ['保存'],
    inputLabel: '确认备注',
    placeholder: '记录是否有效、是否重复，以及需要进入归因的理由。',
  },
  PENDING_ROOT_CAUSE: {
    tab: 'rootCause',
    required: ['失败类型', '根因分类', '修复责任人', '修复截止时间'],
    primaryAction: '提交归因',
    secondaryActions: ['退回确认', '保存'],
    inputLabel: '根因摘要',
    placeholder: '用一段话说明根因、证据和影响范围。',
  },
  FIXING: {
    tab: 'fixRetest',
    required: ['修复说明', '复测责任人'],
    primaryAction: '提交修复',
    secondaryActions: ['保存', '退回归因'],
    inputLabel: '修复说明',
    placeholder: '描述修复方案、关联 PR/配置/Prompt 版本和复测入口。',
  },
  PENDING_RETEST: {
    tab: 'fixRetest',
    required: ['复测方式', '复测结果', '验证责任人'],
    primaryAction: '复测通过',
    secondaryActions: ['重新触发复测'],
    inputLabel: '复测备注',
    placeholder: '记录复测运行、输入输出对比和失败原因。',
  },
  PENDING_VERIFY: {
    tab: 'regression',
    required: ['验证结论', '关闭原因'],
    primaryAction: '验证通过',
    secondaryActions: ['加入回归集'],
    inputLabel: '验证结论',
    placeholder: '说明验收标准、影响面复核和关闭建议。',
  },
  CLOSED: {
    tab: 'regression',
    required: ['重新打开原因', '下一责任人'],
    primaryAction: '重新打开',
    secondaryActions: ['导出', '查看历史'],
    inputLabel: '重新打开原因',
    placeholder: '说明为何重新打开，以及下一步谁接手。',
  },
}

const primaryStageTarget: Record<BadcaseStage, BadcaseStage> = {
  PENDING_CONFIRM: 'PENDING_ROOT_CAUSE',
  PENDING_ROOT_CAUSE: 'FIXING',
  FIXING: 'PENDING_RETEST',
  PENDING_RETEST: 'PENDING_VERIFY',
  PENDING_VERIFY: 'CLOSED',
  CLOSED: 'PENDING_CONFIRM',
}

export function filterBadcaseItems(
  items: BadcaseItem[],
  filters: BadcaseFilters
) {
  const keyword = filters.keyword.trim().toLowerCase()

  return items.filter((item) => {
    const searchable = [
      item.id,
      item.title,
      item.sourceTraceId,
      item.sourceObservationId,
      item.summary,
      item.rootCause,
      item.failureType,
      item.owner,
    ]
      .join(' ')
      .toLowerCase()

    return (
      (!keyword || searchable.includes(keyword)) &&
      (filters.stage === 'all' || item.stage === filters.stage) &&
      (!filters.priorities.length ||
        filters.priorities.includes(item.priority)) &&
      (!filters.owners.length || filters.owners.includes(item.owner)) &&
      (!filters.failureTypes.length ||
        filters.failureTypes.includes(item.failureType)) &&
      (!filters.overdueOnly || item.overdueMinutes > 0)
    )
  })
}

export function applyPrimaryTransition(
  item: BadcaseItem,
  input: BadcasePrimaryTransitionInput
): BadcaseItem {
  const nextStage = input.targetStage ?? primaryStageTarget[item.stage]
  const action =
    input.actionLabel ?? stageActionContent[item.stage].primaryAction

  return {
    ...item,
    stage: nextStage,
    owner: input.nextOwner,
    overdueMinutes: nextStage === 'FIXING' ? item.overdueMinutes : 0,
    updatedAt: '刚刚',
    lastAction: action,
    history: [
      ...item.history,
      {
        from: item.stage,
        to: nextStage,
        operator: '当前用户 / Benson',
        owner: input.nextOwner,
        reason: input.note,
        occurredAt: '2026-08-18 刚刚',
      },
    ],
  }
}
