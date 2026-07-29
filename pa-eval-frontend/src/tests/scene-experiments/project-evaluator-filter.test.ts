import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ApiMethod } from '../../api/types.ts'
import {
  filterSceneBoundEvaluators,
  filterActiveProjectEvaluators,
  filterEvaluatorsByName,
  filterProjectEvaluators,
  listActiveProjectEvaluators,
  listProjectEvaluators,
} from '../../modules/scene-experiments/lib/project-evaluators.ts'
import type { TaskEvaluatorRecord } from '../../modules/tasks/api/evaluator-api.ts'

test('filterSceneBoundEvaluators keeps only scene bindings in scene order', () => {
  const evaluators = [
    evaluator('eval_a', 'proj_a'),
    evaluator('eval_b', 'proj_a'),
    evaluator('eval_c', 'proj_a'),
  ]

  assert.deepEqual(
    filterSceneBoundEvaluators(evaluators, [
      'eval_c',
      'missing',
      'eval_a',
      'eval_c',
    ]).map((item) => item.id),
    ['eval_c', 'eval_a']
  )
})

const evaluator = (
  id: string,
  projectId: string | null,
  enabled = true
): TaskEvaluatorRecord => ({
  id,
  name: id,
  type: 'WORKFLOW',
  version: '1.0.0',
  variables: [],
  description: '',
  provider: 'DIFY',
  projectId,
  projectName: projectId ?? '全局',
  enabled,
  usageCount: 0,
  updatedAt: '2026-07-28T00:00:00.000Z',
})

test('filterActiveProjectEvaluators only keeps enabled evaluators in current project', () => {
  const result = filterActiveProjectEvaluators(
    [
      evaluator('active', 'proj_a'),
      evaluator('disabled', 'proj_a', false),
      evaluator('other', 'proj_b'),
      evaluator('global', null),
    ],
    'proj_a'
  )

  assert.deepEqual(
    result.map((item) => item.id),
    ['active']
  )
})

test('filterEvaluatorsByName trims keyword and matches names case-insensitively', () => {
  const evaluators = [
    { ...evaluator('quality', 'proj_a'), name: 'Answer Quality Judge' },
    { ...evaluator('safety', 'proj_a'), name: '安全审查工作流' },
  ]

  assert.deepEqual(
    filterEvaluatorsByName(evaluators, '  QUALITY  ').map((item) => item.id),
    ['quality']
  )
  assert.deepEqual(filterEvaluatorsByName(evaluators, '不存在'), [])
  assert.equal(filterEvaluatorsByName(evaluators, '  '), evaluators)
})

test('filterProjectEvaluators only keeps evaluators owned by current project', () => {
  const result = filterProjectEvaluators(
    [
      evaluator('current', 'proj_a'),
      evaluator('global', null),
      evaluator('other', 'proj_b'),
    ],
    'proj_a'
  )

  assert.deepEqual(
    result.map((item) => item.id),
    ['current']
  )
})

test('listProjectEvaluators loads every page before filtering current project', async () => {
  const calls: number[] = []
  const pages = [
    {
      total: 3,
      datas: [evaluator('other', 'proj_b'), evaluator('global', null)],
    },
    { total: 3, datas: [evaluator('current', 'proj_a')] },
  ]
  const api = {
    getEvaluators: (async (request) => {
      const options = request as { query: { page: number } }
      calls.push(options.query.page)
      return pages[options.query.page - 1]
    }) as ApiMethod,
  }

  const result = await listProjectEvaluators(api, 'proj_a', 2)

  assert.deepEqual(calls, [1, 2])
  assert.deepEqual(
    result.map((item) => item.id),
    ['current']
  )
})

test('listActiveProjectEvaluators loads every page before filtering disabled evaluators', async () => {
  const calls: number[] = []
  const pages = [
    {
      total: 3,
      datas: [
        evaluator('disabled', 'proj_a', false),
        evaluator('other', 'proj_b'),
      ],
    },
    { total: 3, datas: [evaluator('active', 'proj_a')] },
  ]
  const api = {
    getEvaluators: (async (request) => {
      const options = request as { query: { page: number } }
      calls.push(options.query.page)
      return pages[options.query.page - 1]
    }) as ApiMethod,
  }

  const result = await listActiveProjectEvaluators(api, 'proj_a', 2)

  assert.deepEqual(calls, [1, 2])
  assert.deepEqual(
    result.map((item) => item.id),
    ['active']
  )
})
