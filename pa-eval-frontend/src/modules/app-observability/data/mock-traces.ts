import type { TraceDetail } from '../types'

const projectId = 'project_customer_agent'
const projectName = '客服 Agent'

export const mockTraceDetails: TraceDetail[] = [
  {
    traceId: 'trace_20260703_0001',
    sessionId: 'session_order_8842',
    projectId,
    projectName,
    environment: 'production',
    status: 'success',
    latency: 1234,
    createdAt: '2026-07-03T02:12:00Z',
    updatedAt: '2026-07-03T02:12:02Z',
    userId: 'user_1024',
    businessId: 'order_8842',
    tags: ['agent', 'customer-service'],
    input: '用户询问订单 order_8842 的物流进度。',
    output: '订单正在配送中，预计今天 18:00 前送达。',
    metadata: {
      channel: 'web',
      businessId: 'order_8842',
      city: '杭州',
    },
    callChain: [
      {
        id: 'root-0001',
        type: 'ingress',
        title: 'Agent request',
        duration: '1.23s',
        children: [
          {
            id: 'agent-0001',
            type: 'agent',
            title: 'CustomerSupportAgent',
            duration: '1.11s',
            children: [
              {
                id: 'tool-0001',
                type: 'tool',
                title: 'queryOrderStatus',
                duration: '0.21s',
                tags: ['order'],
              },
              {
                id: 'response-0001',
                type: 'response',
                title: 'Generate response',
                duration: '0.82s',
                tokensIn: 320,
                tokensOut: 96,
                tokensTotal: 416,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    traceId: 'trace_20260703_0002',
    sessionId: 'session_refund_1093',
    projectId,
    projectName,
    environment: 'production',
    status: 'failed',
    latency: 4680,
    createdAt: '2026-07-03T03:22:00Z',
    updatedAt: '2026-07-03T03:22:05Z',
    userId: 'user_2048',
    businessId: 'refund_1093',
    tags: ['agent', 'refund', 'timeout'],
    input: '用户要求查询退款状态。',
    output: '查询退款状态失败，请稍后重试。',
    metadata: {
      channel: 'app',
      businessId: 'refund_1093',
      errorCode: 'TOOL_TIMEOUT',
    },
    callChain: [
      {
        id: 'root-0002',
        type: 'ingress',
        title: 'Agent request',
        duration: '4.68s',
        children: [
          {
            id: 'tool-0002',
            type: 'tool',
            title: 'queryRefundStatus',
            duration: '4.12s',
            tags: ['timeout'],
          },
        ],
      },
    ],
  },
  {
    traceId: 'trace_20260703_0003',
    sessionId: 'session_order_7781',
    projectId,
    projectName,
    environment: 'staging',
    status: 'running',
    latency: 920,
    createdAt: '2026-07-03T04:05:00Z',
    updatedAt: '2026-07-03T04:05:01Z',
    userId: 'user_4096',
    businessId: 'order_7781',
    tags: ['agent', 'order'],
    input: '用户咨询订单是否可以修改地址。',
    output: '正在查询订单可修改状态。',
    metadata: {
      channel: 'web',
      businessId: 'order_7781',
    },
    callChain: [],
  },
]
