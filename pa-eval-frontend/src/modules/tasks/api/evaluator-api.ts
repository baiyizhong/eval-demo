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
  const outputVariables = splitVariables(values.outputVariables ?? '')
  const outputVariableMappings = values.outputVariableMappings
    .map((item) => ({
      variableName: item.variableName.trim(),
      scoreConfigName: item.scoreConfigName.trim(),
    }))
    .filter((item) => item.variableName && item.scoreConfigName)
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
