import type { ApiMethod } from '../../../api/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
} from '../../../components/common/data-table'
import type { AutoEvaluationEvaluatorType } from '../../app-evaluation/types'
import type { EvaluationScenario } from '../../app-evaluation/lib/evaluation-scenarios'

export type TaskEvaluatorProvider =
  'LANGFUSE' | 'DIFY' | 'HIAGENT' | 'N8N' | 'OPENJUDGE'

export type TaskEvaluatorType = AutoEvaluationEvaluatorType | 'WORKFLOW' | 'SDK'
export type { EvaluationScenario }

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
  evaluationScenario?: EvaluationScenario
  projectId: string | null
  projectName: string
  usageCount: number
  updatedAt: string
  isBuiltin?: boolean
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
  evaluationScenario: EvaluationScenario
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

export function buildEvaluatorListQuery(
  query: DataTableQueryState,
  projectId?: string
) {
  const keyword = query.keyword.trim()
  const evaluatorType = getEvaluatorTypeFilter(query.filters.type)

  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(keyword ? { keyword } : {}),
    ...(evaluatorType ? { type: evaluatorType } : {}),
    ...(projectId ? { projectId } : {}),
  }
}

export function listTaskEvaluators(
  api: EvaluatorApiClient,
  query: DataTableQueryState,
  projectId?: string
) {
  return api.getEvaluators<DataTableListResponse<TaskEvaluatorRecord>>({
    query: buildEvaluatorListQuery(query, projectId),
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

export function getTaskEvaluator(
  api: Pick<EvaluatorApiClient, 'getEvaluator'>,
  evaluatorId: string,
  projectId?: string
) {
  return api.getEvaluator<TaskEvaluatorDetail>({
    path: { evaluatorId },
    query: projectId ? { projectId } : undefined,
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
    evaluationScenario: values.evaluationScenario,
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

  if (values.type === 'SKILL') {
    return {
      ...base,
      provider: 'PI',
      endpointUrl: values.endpointUrl.trim(),
      ...(values.model.trim()
        ? {
            modelConfig: {
              provider: values.modelProvider.trim(),
              model: values.model.trim(),
            },
          }
        : {}),
      inputMapping: normalizeInputMapping(
        parseJsonObject(values.inputMapping, '输入映射'),
        inputVariables
      ),
      outputMapping: parseJsonObject(values.outputMapping, '输出映射'),
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
      inputMapping: normalizeInputMapping(
        parseJsonObject(values.inputMapping, '输入映射'),
        inputVariables
      ),
      outputMapping: parseJsonObject(values.outputMapping, '输出映射'),
    }
  }

  return {
    ...base,
    sdkPackage: values.sdkPackage.trim(),
    inputMapping: normalizeInputMapping(
      parseJsonObject(values.inputMapping, '输入映射'),
      inputVariables
    ),
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
    evaluationScenario: isEvaluationScenario(evaluator.evaluationScenario)
      ? evaluator.evaluationScenario
      : isEvaluationScenario(config.evaluationScenario)
        ? config.evaluationScenario
        : 'SINGLE_TURN',
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

export function normalizeInputMapping(
  mapping: Record<string, unknown>,
  inputVariables: string[] = []
) {
  const normalized = Object.fromEntries(
    Object.entries(mapping).map(([key, value]) => [
      key,
      normalizeInputMappingValue(value),
    ])
  )
  for (const variable of inputVariables) {
    if (!normalized[variable]) {
      normalized[variable] = normalizeInputMappingValue(variable)
    }
  }
  return normalized
}

function normalizeInputMappingValue(value: unknown) {
  if (typeof value !== 'string') return value

  const template = value.trim()
  if (!template) return value

  if (template.includes('{{') && template.includes('}}')) {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, expression) => {
      const normalized = normalizeSamplePathExpression(String(expression))
      return normalized ? `{{ ${normalized} }}` : match
    })
  }

  if (template.startsWith('{') && template.endsWith('}')) {
    const normalized = normalizeSamplePathExpression(template.slice(1, -1))
    return normalized ? `{{ ${normalized} }}` : value
  }

  const normalized = normalizeSamplePathExpression(template)
  return normalized ? `{{ ${normalized} }}` : value
}

function normalizeSamplePathExpression(expression: string) {
  const path = expression.trim().replace(/^\.+|\.+$/g, '')
  const samplePath = path.startsWith('sample.') ? path.slice(7) : path
  const parts = samplePath.split('.').filter(Boolean)
  if (!parts.length) return ''

  const root = sampleRootAliases[parts[0].replace(/-/g, '_').toLowerCase()]
  if (!root) return ''

  return ['sample', root, ...parts.slice(1)].join('.')
}

const sampleRootAliases: Record<string, string> = {
  input: 'input',
  output: 'output',
  expectedoutput: 'expectedOutput',
  expected_output: 'expectedOutput',
  context: 'context',
  metadata: 'metadata',
  trace: 'trace',
  observation: 'observation',
  datasetitem: 'datasetItem',
  dataset_item: 'datasetItem',
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

function isEvaluationScenario(value: unknown): value is EvaluationScenario {
  return (
    value === 'SINGLE_TURN' ||
    value === 'MULTI_TURN' ||
    value === 'TOOL_CALLING' ||
    value === 'MULTI_TURN_TOOL_CALLING' ||
    value === 'RAG_FACTUALITY' ||
    value === 'SAFETY' ||
    value === 'AGENT_SKILL' ||
    value === 'CUSTOM'
  )
}

function getEvaluatorTypeFilter(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value
  if (
    candidate === 'LLM_AS_JUDGE' ||
    candidate === 'CODE' ||
    candidate === 'WORKFLOW' ||
    candidate === 'SDK' ||
    candidate === 'SKILL'
  ) {
    return candidate
  }
  return undefined
}
