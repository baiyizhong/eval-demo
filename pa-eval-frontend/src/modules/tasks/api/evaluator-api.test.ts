import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildCreateEvaluatorPayload,
  buildEvaluatorListQuery,
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

test('buildCreateEvaluatorPayload maps Langfuse code evaluator fields', () => {
  assert.deepEqual(
    buildCreateEvaluatorPayload({
      name: '答案长度检查',
      type: 'CODE',
      provider: 'LANGFUSE',
      projectId: 'project-1',
      description: '检查答案长度',
      variables: 'input, output',
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
      projectId: 'project-1',
      description: '检查答案长度',
      variables: ['input', 'output'],
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
      projectId: 'project-1',
      description: '调用 Dify 工作流',
      variables: 'input, output',
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
      projectId: 'project-1',
      description: '调用 Dify 工作流',
      variables: ['input', 'output'],
      endpointUrl: 'https://dify.example.com/v1/workflows/run',
      authType: 'BEARER',
      authToken: 'secret-token',
      inputMapping: { query: '{{input}}' },
      outputMapping: { score: '$.data.score' },
    }
  )
})
