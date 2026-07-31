import type { TaskEvaluatorRecord } from '@/modules/tasks/api/evaluator-api'
import type { ApiMethod } from '@/api/types'

type EvaluatorListApi = {
  getEvaluators: ApiMethod
}

export function filterProjectEvaluators(
  evaluators: TaskEvaluatorRecord[],
  projectId: string
) {
  return evaluators.filter(
    (evaluator) => evaluator.projectId === projectId || evaluator.projectId == null
  )
}

export function filterActiveProjectEvaluators(
  evaluators: TaskEvaluatorRecord[],
  projectId: string
) {
  return filterProjectEvaluators(evaluators, projectId).filter(
    (evaluator) => evaluator.enabled !== false
  )
}

export function filterSceneBoundEvaluators(
  evaluators: TaskEvaluatorRecord[],
  sceneEvaluatorIds: string[]
) {
  const evaluatorsById = new Map(
    evaluators.map((evaluator) => [evaluator.id, evaluator])
  )
  return Array.from(new Set(sceneEvaluatorIds)).flatMap((evaluatorId) => {
    const evaluator = evaluatorsById.get(evaluatorId)
    return evaluator ? [evaluator] : []
  })
}

export function filterEvaluatorsByName(
  evaluators: TaskEvaluatorRecord[],
  keyword: string
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  if (!normalizedKeyword) return evaluators

  return evaluators.filter((evaluator) =>
    evaluator.name.toLocaleLowerCase().includes(normalizedKeyword)
  )
}

export async function listProjectEvaluators(
  api: EvaluatorListApi,
  projectId: string,
  pageSize = 200
) {
  const evaluators: TaskEvaluatorRecord[] = []
  let page = 1
  let total = 0

  do {
    const response = await api.getEvaluators<{
      total: number
      datas: TaskEvaluatorRecord[]
    }>({ query: { page, pageSize } })
    evaluators.push(...response.datas)
    total = response.total
    page += 1
  } while (evaluators.length < total)

  return filterProjectEvaluators(evaluators, projectId)
}

export async function listActiveProjectEvaluators(
  api: EvaluatorListApi,
  projectId: string,
  pageSize = 200
) {
  const evaluators = await listProjectEvaluators(api, projectId, pageSize)
  return filterActiveProjectEvaluators(evaluators, projectId)
}
