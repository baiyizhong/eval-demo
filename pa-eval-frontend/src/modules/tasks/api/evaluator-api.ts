import type { ApiMethod } from '../../../api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '../../../components/common/data-table'
import type { AutoEvaluationEvaluatorType } from '../../app-evaluation/types'

export type TaskEvaluatorProvider =
  'LANGFUSE' | 'DIFY' | 'HIAGENT' | 'N8N' | 'OPENJUDGE'

export type TaskEvaluatorType = AutoEvaluationEvaluatorType | 'WORKFLOW' | 'SDK'

export type TaskEvaluatorRecord = {
  id: string
  name: string
  type: TaskEvaluatorType
  version: string
  variables: string[]
  inputVariables?: string[]
  outputVariables?: string[]
  outputVariableMappings?: {
    variableName: string
    scoreConfigName: string
    scoreConfigId?: string
  }[]
  description: string
  provider: TaskEvaluatorProvider
  projectId: string | null
  projectName: string
  usageCount: number
  updatedAt: string
}

export type TaskEvaluatorDetail = TaskEvaluatorRecord & {
  config?: Record<string, unknown>
  prompt?: string | null
  modelConfig?: Record<string, unknown>
  outputDefinition?: Record<string, unknown>
  sourceCode?: string | null
  sourceCodeLanguage?: string | null
}

export type CreateTaskEvaluatorFormValues = {
  name: string
  type: TaskEvaluatorType
  provider: TaskEvaluatorProvider
  projectId: string
  description: string
  variables: string
  inputVariables: string
  outputVariables: string
  outputVariableMappings: {
    variableName: string
    scoreConfigName: string
    scoreConfigId: string
  }[]
  prompt: string
  modelProvider: string
  model: string
  sourceCodeLanguage: 'PYTHON' | 'TYPESCRIPT'
  sourceCode: string
  endpointUrl: string
  authType: 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY'
  authToken: string
  inputMapping: string
  outputMapping: string
  sdkPackage: string
}

type EvaluatorApiClient = {
  getEvaluators: ApiMethod
  getEvaluator: ApiMethod
  createEvaluator: ApiMethod
  patchEvaluator: ApiMethod
  deleteEvaluator: ApiMethod
}

export function buildEvaluatorListQuery(query: DataTableQueryState) {
  const keyword = query.keyword.trim()
  const evaluatorType = getEvaluatorTypeFilter(query.filters.type)

  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(keyword ? { keyword } : {}),
    ...(evaluatorType ? { type: evaluatorType } : {}),
  }
}

export function listTaskEvaluators(
  api: EvaluatorApiClient,
  query: DataTableQueryState
) {
  return api.getEvaluators<DataTableListResponse<TaskEvaluatorRecord>>({
    query: buildEvaluatorListQuery(query),
  })
}

export function createTaskEvaluator(
  api: EvaluatorApiClient,
  values: CreateTaskEvaluatorFormValues
) {
  return api.createEvaluator<TaskEvaluatorRecord>({
    body: buildCreateEvaluatorPayload(values),
  })
}

export function updateTaskEvaluator(
  api: Pick<EvaluatorApiClient, 'patchEvaluator'>,
  evaluatorId: string,
  values: CreateTaskEvaluatorFormValues
) {
  return api.patchEvaluator<TaskEvaluatorRecord>({
    path: { evaluatorId },
    body: buildCreateEvaluatorPayload(values),
  })
}

export function getTaskEvaluator(api: EvaluatorApiClient, evaluatorId: string) {
  return api.getEvaluator<TaskEvaluatorDetail>({
    path: { evaluatorId },
  })
}

export function deleteTaskEvaluator(
  api: EvaluatorApiClient,
  evaluatorId: string
) {
  return api.deleteEvaluator<{ id: string }>({
    path: { evaluatorId },
  })
}

export function buildCreateEvaluatorPayload(
  values: CreateTaskEvaluatorFormValues
) {
  const inputVariables = splitVariables(
    values.inputVariables ?? values.variables
  )
  const outputVariableMappings = values.outputVariableMappings
    .map((item) => {
      const mapping: {
        variableName: string
        scoreConfigName: string
        scoreConfigId?: string
      } = {
        variableName: item.variableName.trim(),
        scoreConfigName: item.scoreConfigName.trim(),
      }
      const scoreConfigId = item.scoreConfigId?.trim()
      if (scoreConfigId) {
        mapping.scoreConfigId = scoreConfigId
      }
      return mapping
    })
    .filter((item) => item.variableName && item.scoreConfigName)
  const outputVariables = splitVariables(values.outputVariables ?? '')
  if (outputVariables.length === 0) {
    outputVariables.push(
      ...outputVariableMappings.map((item) => item.variableName)
    )
  }
  const base = {
    name: values.name.trim(),
    type: values.type,
    provider: values.provider,
    projectId: values.projectId,
    description: values.description.trim(),
    variables: inputVariables,
    inputVariables,
    outputVariables,
    outputVariableMappings,
  }

  if (values.type === 'LLM_AS_JUDGE') {
    return {
      ...base,
      prompt: values.prompt,
      modelConfig: {
        provider: values.modelProvider.trim(),
        model: values.model.trim(),
      },
      outputDefinition: parseJsonObject(values.outputMapping, '输出定义'),
    }
  }

  if (values.type === 'CODE') {
    return {
      ...base,
      sourceCodeLanguage: values.sourceCodeLanguage,
      sourceCode: values.sourceCode,
    }
  }

  if (values.type === 'WORKFLOW') {
    return {
      ...base,
      endpointUrl: values.endpointUrl.trim(),
      authType: values.authType,
      ...(values.authToken.trim()
        ? { authToken: values.authToken.trim() }
        : {}),
      inputMapping: parseJsonObject(values.inputMapping, '输入映射'),
      outputMapping: parseJsonObject(values.outputMapping, '输出映射'),
    }
  }

  return {
    ...base,
    sdkPackage: values.sdkPackage.trim(),
    inputMapping: parseJsonObject(values.inputMapping, '输入映射'),
    outputMapping: parseJsonObject(values.outputMapping, '输出映射'),
  }
}

export function buildEvaluatorFormValuesFromDetail(
  evaluator: TaskEvaluatorDetail,
  fallbackProjectId: string
): CreateTaskEvaluatorFormValues {
  const config = evaluator.config ?? {}
  const modelConfig = evaluator.modelConfig ?? {}
  const inputVariables = evaluator.inputVariables?.length
    ? evaluator.inputVariables
    : evaluator.variables
  const outputVariables = evaluator.outputVariables ?? []
  const outputVariableMappings = evaluator.outputVariableMappings?.length
    ? evaluator.outputVariableMappings.map((mapping) => ({
        variableName: mapping.variableName,
        scoreConfigId: mapping.scoreConfigId ?? '',
        scoreConfigName: mapping.scoreConfigName,
      }))
    : outputVariables.map((variableName) => ({
        variableName,
        scoreConfigId: '',
        scoreConfigName: '',
      }))

  return {
    name: evaluator.name,
    type: evaluator.type,
    provider: evaluator.provider,
    projectId: evaluator.projectId ?? fallbackProjectId,
    description: evaluator.description,
    variables: inputVariables.join(', '),
    inputVariables: inputVariables.join(', '),
    outputVariables: outputVariables.join(', '),
    outputVariableMappings: outputVariableMappings.length
      ? outputVariableMappings
      : [
          {
            variableName: '',
            scoreConfigId: '',
            scoreConfigName: '',
          },
        ],
    prompt: evaluator.prompt ?? '',
    modelProvider: readString(modelConfig.provider),
    model: readString(modelConfig.model),
    sourceCodeLanguage: isSourceCodeLanguage(evaluator.sourceCodeLanguage)
      ? evaluator.sourceCodeLanguage
      : 'PYTHON',
    sourceCode: evaluator.sourceCode ?? '',
    endpointUrl: readString(config.endpointUrl),
    authType: isAuthType(config.authType) ? config.authType : 'NONE',
    authToken: '',
    inputMapping: stringifyJsonObject(config.inputMapping),
    outputMapping:
      evaluator.type === 'LLM_AS_JUDGE'
        ? stringifyJsonObject(evaluator.outputDefinition)
        : stringifyJsonObject(config.outputMapping),
    sdkPackage: readString(config.sdkPackage),
  }
}

function splitVariables(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseJsonObject(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return {}
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label}必须是 JSON 对象`)
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label}不是合法 JSON`)
    }
    throw error
  }
}

function stringifyJsonObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '{}'
  }
  return JSON.stringify(value, null, 2)
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isAuthType(
  value: unknown
): value is CreateTaskEvaluatorFormValues['authType'] {
  return (
    value === 'NONE' ||
    value === 'BEARER' ||
    value === 'BASIC' ||
    value === 'API_KEY'
  )
}

function isSourceCodeLanguage(
  value: unknown
): value is CreateTaskEvaluatorFormValues['sourceCodeLanguage'] {
  return value === 'PYTHON' || value === 'TYPESCRIPT'
}

function getEvaluatorTypeFilter(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value
  if (
    candidate === 'LLM_AS_JUDGE' ||
    candidate === 'CODE' ||
    candidate === 'WORKFLOW' ||
    candidate === 'SDK'
  ) {
    return candidate
  }
  return undefined
}
