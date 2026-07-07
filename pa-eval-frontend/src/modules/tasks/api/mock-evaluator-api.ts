import { mockAutoEvaluationEvaluators } from '@/modules/app-evaluation/data/mock-auto-evaluations'
import type {
  AutoEvaluationEvaluatorType,
  MockAutoEvaluationEvaluator,
} from '@/modules/app-evaluation/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'

export type CreateEvaluatorInput = {
  name: string
  type: AutoEvaluationEvaluatorType
  version: string
  description: string
  variables: string[]
}

let evaluators = clone(mockAutoEvaluationEvaluators)

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

export function resetTaskEvaluatorMocks() {
  evaluators = clone(mockAutoEvaluationEvaluators)
}

export async function listTaskEvaluatorsMock(
  query: DataTableQueryState
): Promise<DataTableListResponse<MockAutoEvaluationEvaluator>> {
  await delay()
  const keyword = query.keyword.trim().toLowerCase()
  const rows = evaluators.filter((evaluator) => {
    if (!keyword) return true
    return [
      evaluator.name,
      evaluator.description,
      evaluator.type,
      evaluator.version,
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })

  return paginate(rows, query)
}

export async function createTaskEvaluatorMock(
  input: CreateEvaluatorInput
): Promise<MockAutoEvaluationEvaluator> {
  await delay()
  if (evaluators.some((evaluator) => evaluator.name === input.name)) {
    throw new Error('评估器名称已存在')
  }

  const now = new Date().toISOString()
  const evaluator: MockAutoEvaluationEvaluator = {
    id: `evaluator_${Date.now()}`,
    name: input.name,
    type: input.type,
    version: input.version,
    variables: input.variables,
    description: input.description,
    updatedAt: now,
  }
  evaluators = [evaluator, ...evaluators]
  return evaluator
}

function paginate<T>(
  rows: T[],
  query: DataTableQueryState
): DataTableListResponse<T> {
  const start = (query.page - 1) * query.pageSize
  return {
    total: rows.length,
    datas: rows.slice(start, start + query.pageSize),
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
