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
    method: 'patch',
    response: (req: any) => {
      const evaluatorId = pathParam(req, 'evaluatorId')
      const input = body(req)
      const evaluatorIndex = db.evaluators.findIndex(
        (item) => item.id === evaluatorId
      )
      const current = db.evaluators[evaluatorIndex]
      if (!current) return success({ id: evaluatorId })

      const nextEvaluator = {
        ...current,
        name: input.name ?? current.name,
        type: input.type ?? current.type,
        version: input.version ?? current.version,
        variables: Array.isArray(input.variables)
          ? input.variables
          : current.variables,
        inputVariables: Array.isArray(input.inputVariables)
          ? input.inputVariables
          : Array.isArray(input.variables)
            ? input.variables
            : current.inputVariables,
        outputVariables: Array.isArray(input.outputVariables)
          ? input.outputVariables
          : current.outputVariables,
        outputVariableMappings: Array.isArray(input.outputVariableMappings)
          ? input.outputVariableMappings
          : current.outputVariableMappings,
        description: input.description ?? current.description,
        provider: input.provider ?? current.provider,
        projectId: input.projectId ?? current.projectId,
        config: input.config ?? {
          endpointUrl: input.endpointUrl,
          authType: input.authType,
          inputMapping: input.inputMapping,
          outputMapping: input.outputMapping,
          sdkPackage: input.sdkPackage,
          outputVariableMappings: input.outputVariableMappings,
        },
        prompt: input.prompt ?? current.prompt,
        modelConfig: input.modelConfig ?? current.modelConfig,
        outputDefinition: input.outputDefinition ?? current.outputDefinition,
        sourceCode: input.sourceCode ?? current.sourceCode,
        sourceCodeLanguage:
          input.sourceCodeLanguage ?? current.sourceCodeLanguage,
        updatedAt: nowIso(),
      }
      db.evaluators[evaluatorIndex] = nextEvaluator
      return success(nextEvaluator)
    },
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
    response: ({ query }: any) => {
      const type = Array.isArray(query?.type) ? query.type[0] : query?.type

      return success(
        paginate(
          db.evaluators
            .filter((item) => keywordIncludes(item, query?.keyword))
            .filter((item) => !type || item.type === type),
          query,
          10
        )
      )
    },
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
        inputVariables: Array.isArray(input.inputVariables)
          ? input.inputVariables
          : Array.isArray(input.variables)
            ? input.variables
            : [],
        outputVariables: Array.isArray(input.outputVariables)
          ? input.outputVariables
          : [],
        outputVariableMappings: Array.isArray(input.outputVariableMappings)
          ? input.outputVariableMappings
          : [],
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
