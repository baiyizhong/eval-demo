import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildEvaluatorFormValuesFromDetail,
  updateTaskEvaluator,
  type CreateTaskEvaluatorFormValues,
} from '../../modules/tasks/api/evaluator-api.ts'

test('updateTaskEvaluator patches evaluator with create-form payload shape', async () => {
  const calls: unknown[] = []
  const api = {
    patchEvaluator: <T>(input: unknown) => {
      calls.push(input)
      return Promise.resolve({ id: 'pa-evaluator-1' }) as Promise<T>
    },
  }
  const values: CreateTaskEvaluatorFormValues = {
    name: 'Dify 客诉判断',
    type: 'WORKFLOW',
    provider: 'DIFY',
    evaluationScenario: 'TOOL_CALLING',
    projectId: 'project-1',
    description: '调用 Dify 工作流',
    variables: 'input, output',
    inputVariables: 'input, output',
    outputVariables: '',
    outputVariableMappings: [
      {
        variableName: 'quality_score',
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
    inputMapping: '{"query":"{{input}}"}',
    outputMapping: '{"score":"$.data.score"}',
    sdkPackage: '',
  }

  await updateTaskEvaluator(api, 'pa-evaluator-1', values)

  assert.deepEqual(calls, [
    {
      path: { evaluatorId: 'pa-evaluator-1' },
      body: {
        name: 'Dify 客诉判断',
        type: 'WORKFLOW',
        provider: 'DIFY',
        evaluationScenario: 'TOOL_CALLING',
        projectId: 'project-1',
        description: '调用 Dify 工作流',
        variables: ['input', 'output'],
        inputVariables: ['input', 'output'],
        outputVariables: ['quality_score'],
        outputVariableMappings: [
          {
            variableName: 'quality_score',
            scoreConfigId: 'score-config-quality',
            scoreConfigName: '回答质量',
          },
        ],
        endpointUrl: 'https://dify.example.com/v1/workflows/run',
        authType: 'NONE',
        inputMapping: {
          query: '{{ sample.input }}',
          input: '{{ sample.input }}',
          output: '{{ sample.output }}',
        },
        outputMapping: { score: '$.data.score' },
      },
    },
  ])
})

test('buildEvaluatorFormValuesFromDetail maps workflow detail into editable defaults', () => {
  assert.deepEqual(
    buildEvaluatorFormValuesFromDetail(
      {
        id: 'pa-evaluator-1',
        name: 'Dify 客诉判断',
        type: 'WORKFLOW',
        version: 'v1',
        variables: ['input', 'output'],
        inputVariables: ['input', 'output'],
        outputVariables: ['quality_score'],
        outputVariableMappings: [
          {
            variableName: 'quality_score',
            scoreConfigId: 'score-config-quality',
            scoreConfigName: '回答质量',
          },
        ],
        description: '调用 Dify 工作流',
        provider: 'DIFY',
        evaluationScenario: 'SINGLE_TURN',
        projectId: 'project-1',
        projectName: '默认项目',
        usageCount: 0,
        updatedAt: '2026-07-03T09:00:00.000Z',
        config: {
          endpointUrl: 'https://dify.example.com/v1/workflows/run',
          authType: 'BEARER',
          hasAuthToken: true,
          inputMapping: { query: '{{input}}' },
          outputMapping: { score: '$.data.score' },
        },
      },
      'fallback-project'
    ),
    {
      name: 'Dify 客诉判断',
      type: 'WORKFLOW',
      provider: 'DIFY',
      evaluationScenario: 'SINGLE_TURN',
      projectId: 'project-1',
      description: '调用 Dify 工作流',
      variables: 'input, output',
      inputVariables: 'input, output',
      outputVariables: 'quality_score',
      outputVariableMappings: [
        {
          variableName: 'quality_score',
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
      authType: 'BEARER',
      authToken: '',
      inputMapping: '{\n  "query": "{{input}}"\n}',
      outputMapping: '{\n  "score": "$.data.score"\n}',
      sdkPackage: '',
    }
  )
})
