import { db } from './_data.ts'
import { body, id, keywordIncludes, nowIso, paginate, pathParam, success } from './_utils.ts'

export default [
  {
    url: '/api/evaluators/:evaluatorId',
    method: 'get',
    response: (req: any) =>
      success(
        db.evaluators.find((item) => item.id === pathParam(req, 'evaluatorId')) ??
          db.evaluators[0]
      ),
  },
  {
    url: '/api/evaluators/:evaluatorId',
    method: 'delete',
    response: (req: any) => {
      const evaluatorId = pathParam(req, 'evaluatorId')
      db.evaluators = db.evaluators.filter((item) => item.id !== evaluatorId)
      return success({ id: evaluatorId })
    },
  },
  {
    url: '/api/evaluators',
    method: 'get',
    response: ({ query }: any) =>
      success(
        paginate(
          db.evaluators.filter((item) => keywordIncludes(item, query?.keyword)),
          query,
          10
        )
      ),
  },
  {
    url: '/api/evaluators',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const evaluator = {
        id: id('eval'),
        name: input.name,
        type: input.type ?? 'LLM_AS_JUDGE',
        version: input.version ?? '1.0.0',
        variables: Array.isArray(input.variables) ? input.variables : [],
        description: input.description ?? '',
        provider: input.provider ?? 'LANGFUSE',
        projectId: input.projectId ?? null,
        projectName: input.projectId ? '项目 A' : '全局',
        usageCount: 0,
        config: input.config ?? {},
        prompt: input.prompt ?? null,
        modelConfig: input.modelConfig ?? {},
        outputDefinition: input.outputDefinition ?? {},
        sourceCode: input.sourceCode ?? null,
        sourceCodeLanguage: input.sourceCodeLanguage ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.evaluators.unshift(evaluator)
      return success(evaluator)
    },
  },
]
