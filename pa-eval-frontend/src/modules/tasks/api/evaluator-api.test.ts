import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildCreateEvaluatorPayload,
  buildEvaluatorListQuery,
  getTaskEvaluator,
} from './evaluator-api.ts'

test('buildEvaluatorListQuery keeps PA pagination names for backend evaluators', () => {
  assert.deepEqual(
    buildEvaluatorListQuery({
      page: 2,
      pageSize: 20,
      keyword: '客服',
      sorting: [],
      filters: {},
    }),
    {
      page: 2,
      pageSize: 20,
      keyword: '客服',
    }
  )
})

test('buildEvaluatorListQuery trims empty keyword', () => {
  assert.deepEqual(
    buildEvaluatorListQuery({
      page: 1,
      pageSize: 10,
      keyword: '   ',
      sorting: [],
      filters: {},
    }),
    {
      page: 1,
      pageSize: 10,
    }
  )
})

test('buildEvaluatorListQuery serializes evaluator type filter', () => {
  assert.deepEqual(
    buildEvaluatorListQuery({
      page: 1,
      pageSize: 10,
      keyword: '   ',
      sorting: [],
      filters: { type: ['WORKFLOW'] },
    }),
    {
      page: 1,
      pageSize: 10,
      type: 'WORKFLOW',
    }
  )
})

test('buildEvaluatorListQuery serializes current project filter', () => {
  assert.deepEqual(
    buildEvaluatorListQuery(
      {
        page: 1,
        pageSize: 10,
        keyword: 'OpenJudge',
        sorting: [],
        filters: { type: ['SDK'] },
      },
      'project-1'
    ),
    {
      page: 1,
      pageSize: 10,
      keyword: 'OpenJudge',
      type: 'SDK',
      projectId: 'project-1',
    }
  )
})

test('getTaskEvaluator serializes project id for built-in evaluator detail', async () => {
  let captured: unknown = null
  const api = {
    getEvaluator: async <T>(input: unknown) => {
      captured = input
      return {} as T
    },
  }

  await getTaskEvaluator(api, 'paeval_default_openjudge', 'project-1')

  assert.deepEqual(captured, {
    path: { evaluatorId: 'paeval_default_openjudge' },
    query: { projectId: 'project-1' },
  })
})

test('buildCreateEvaluatorPayload maps Langfuse code evaluator fields', () => {
  assert.deepEqual(
    buildCreateEvaluatorPayload({
      name: '答案长度检查',
      type: 'CODE',
      provider: 'LANGFUSE',
      evaluationScenario: 'SINGLE_TURN',
      projectId: 'project-1',
      description: '检查答案长度',
      variables: 'input, output',
      inputVariables: 'input, output',
      outputVariables: '',
      outputVariableMappings: [],
      prompt: '',
      modelProvider: '',
      model: '',
      sourceCodeLanguage: 'PYTHON',
      sourceCode: 'def evaluate(context):\n    return {"score": 1}',
      endpointUrl: '',
      authType: 'NONE',
      authToken: '',
      inputMapping: '{}',
      outputMapping: '{}',
      sdkPackage: '',
    }),
    {
      name: '答案长度检查',
      type: 'CODE',
      provider: 'LANGFUSE',
      evaluationScenario: 'SINGLE_TURN',
      projectId: 'project-1',
      description: '检查答案长度',
      variables: ['input', 'output'],
      inputVariables: ['input', 'output'],
      outputVariables: [],
      outputVariableMappings: [],
      sourceCodeLanguage: 'PYTHON',
      sourceCode: 'def evaluate(context):\n    return {"score": 1}',
    }
  )
})

test('buildCreateEvaluatorPayload maps workflow evaluator config', () => {
  assert.deepEqual(
    buildCreateEvaluatorPayload({
      name: 'Dify 客诉判断',
      type: 'WORKFLOW',
      provider: 'DIFY',
      evaluationScenario: 'CUSTOM',
      projectId: 'project-1',
      description: '调用 Dify 工作流',
      variables: 'input, output',
      inputVariables: 'input, output',
      outputVariables: 'quality_score, risk_score',
      outputVariableMappings: [
        {
          variableName: 'quality_score',
          scoreConfigId: 'score-config-quality',
          scoreConfigName: '回答质量',
        },
        {
          variableName: 'risk_score',
          scoreConfigId: 'score-config-risk',
          scoreConfigName: '风险评分',
        },
      ],
      prompt: '',
      modelProvider: '',
      model: '',
      sourceCodeLanguage: 'PYTHON',
      sourceCode: '',
      endpointUrl: 'https://dify.example.com/v1/workflows/run',
      authType: 'BEARER',
      authToken: 'secret-token',
      inputMapping: '{"query":"{{input}}"}',
      outputMapping: '{"score":"$.data.score"}',
      sdkPackage: '',
    }),
    {
      name: 'Dify 客诉判断',
      type: 'WORKFLOW',
      provider: 'DIFY',
      evaluationScenario: 'CUSTOM',
      projectId: 'project-1',
      description: '调用 Dify 工作流',
      variables: ['input', 'output'],
      inputVariables: ['input', 'output'],
      outputVariables: ['quality_score', 'risk_score'],
      outputVariableMappings: [
        {
          variableName: 'quality_score',
          scoreConfigId: 'score-config-quality',
          scoreConfigName: '回答质量',
        },
        {
          variableName: 'risk_score',
          scoreConfigId: 'score-config-risk',
          scoreConfigName: '风险评分',
        },
      ],
      endpointUrl: 'https://dify.example.com/v1/workflows/run',
      authType: 'BEARER',
      authToken: 'secret-token',
      inputMapping: {
        query: '{{ sample.input }}',
        input: '{{ sample.input }}',
        output: '{{ sample.output }}',
      },
      outputMapping: { score: '$.data.score' },
    }
  )
})

test('buildCreateEvaluatorPayload normalizes short workflow input mapping paths', () => {
  const payload = buildCreateEvaluatorPayload({
    name: 'Dify 客诉判断',
    type: 'WORKFLOW',
    provider: 'DIFY',
    evaluationScenario: 'CUSTOM',
    projectId: 'project-1',
    description: '调用 Dify 工作流',
    variables: 'input, output, expected_output',
    inputVariables: 'input, output, expected_output',
    outputVariables: 'score',
    outputVariableMappings: [
      {
        variableName: 'score',
        scoreConfigId: 'score-config-quality',
        scoreConfigName: '回答质量',
      },
    ],
    prompt: '',
    modelProvider: '',
    model: '',
    sourceCodeLanguage: 'PYTHON',
    sourceCode: '',
    endpointUrl: 'https://dify.example.com/v1/workflows/run',
    authType: 'NONE',
    authToken: '',
    inputMapping: JSON.stringify({
      input: 'input.question',
      output: '{output}',
      expected_output: '{{ expectedOutput }}',
    }),
    outputMapping: '{"score":"data.outputs.score"}',
    sdkPackage: '',
  })

  assert.deepEqual((payload as { inputMapping: unknown }).inputMapping, {
    input: '{{ sample.input.question }}',
    output: '{{ sample.output }}',
    expected_output: '{{ sample.expectedOutput }}',
  })
})
