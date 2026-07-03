import { mockTraceDetails } from '@/modules/app-observability/data/mock-traces'
import {
  getProjectTraceMock,
  listProjectTracesMock,
  patchProjectTraceMock,
} from '@/modules/app-observability/api/mock-trace-api'
import {
  formatLatency,
  formatPercent,
} from '@/modules/app-observability/lib/format'
import type { TraceStatus } from '@/modules/app-observability/types'

function assertType<T>(_value: T) {}

export const latencyMsUsage: string = formatLatency(345)
export const latencySecondsUsage: string = formatLatency(1234)
export const percentUsage: string = formatPercent(0.125)

const firstTrace = mockTraceDetails[0]

assertType<TraceStatus>(firstTrace.status)

export const traceDetailShapeUsage = {
  traceId: firstTrace.traceId,
  status: firstTrace.status,
  callChain: firstTrace.callChain,
}

export async function mockApiTypeUsage() {
  const response = await listProjectTracesMock({
    projectId: 'project_customer_agent',
    page: 1,
    pageSize: 10,
    keyword: 'trace_20260703_0001',
  })

  const detail = await getProjectTraceMock(
    'project_customer_agent',
    response.datas[0]?.traceId ?? 'trace_20260703_0001'
  )

  const patched = await patchProjectTraceMock(
    'project_customer_agent',
    detail.traceId,
    {
      input: 'updated input',
      output: 'updated output',
      metadata: { edited: true },
    }
  )

  return {
    total: response.total,
    traceId: patched.traceId,
    metadata: patched.metadata,
  }
}
