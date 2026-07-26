import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildAnnotationScoreDefaultValues,
  getBooleanScoreOptions,
  normalizeAnnotationScoreFormInput,
} from '../../modules/app-evaluation/components/annotation-score-values.ts'
import type {
  AnnotationQueueItemRecord,
  ScoreConfigRecord,
} from '../../modules/app-evaluation/types.ts'

const scoreConfigs: ScoreConfigRecord[] = [
  {
    id: 'numeric_config',
    projectId: 'project_a',
    name: '准确性',
    dataType: 'NUMERIC',
    description: '',
    minValue: 1,
    maxValue: 5,
  },
  {
    id: 'boolean_config',
    projectId: 'project_a',
    name: '是否合格',
    dataType: 'BOOLEAN',
    description: '',
    categories: [
      { label: 'True', value: 1 },
      { label: 'False', value: 0 },
    ],
  },
  {
    id: 'category_config',
    projectId: 'project_a',
    name: '问题类型',
    dataType: 'CATEGORICAL',
    description: '',
    categories: [
      { label: '工具', value: 1 },
      { label: '答案', value: 2 },
    ],
  },
  {
    id: 'text_config',
    projectId: 'project_a',
    name: '备注说明',
    dataType: 'TEXT',
    description: '',
  },
]

const item = {
  id: 'item_a',
  projectId: 'project_a',
  queueId: 'queue_a',
  objectId: 'trace_a',
  objectType: 'TRACE',
  status: 'PENDING',
  scores: [
    {
      id: 'score_numeric',
      configId: 'numeric_config',
      name: '准确性',
      dataType: 'NUMERIC',
      value: 4,
      stringValue: 'should-clear',
      comment: '数字备注',
      authorUserId: 'user_a',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'score_boolean',
      configId: 'boolean_config',
      name: '是否合格',
      dataType: 'BOOLEAN',
      value: 0,
      stringValue: 'false',
      comment: '布尔备注',
      authorUserId: 'user_a',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'score_category',
      configId: 'category_config',
      name: '问题类型',
      dataType: 'CATEGORICAL',
      value: 2,
      stringValue: '答案',
      comment: '',
      authorUserId: 'user_a',
      createdAt: '',
      updatedAt: '',
    },
  ],
  completedAt: '',
  completedBy: null,
  assignee: null,
  createdAt: '',
  updatedAt: '',
  source: {
    objectId: 'trace_a',
    objectType: 'TRACE',
    title: 'Trace A',
    input: {},
    output: {},
    metadata: {},
    traceId: 'trace_a',
    observationId: '',
    sessionId: '',
    userId: '',
    latencyMs: 0,
    costUsd: 0,
    createdAt: '',
  },
} satisfies AnnotationQueueItemRecord

test('boolean score options use backend category labels when available', () => {
  assert.deepEqual(getBooleanScoreOptions(scoreConfigs[1]), [
    { value: '1', label: 'True' },
    { value: '0', label: 'False' },
  ])
})

test('boolean score options fall back to default labels without categories', () => {
  assert.deepEqual(getBooleanScoreOptions(), [
    { value: '1', label: '通过' },
    { value: '0', label: '不通过' },
  ])
})

test('annotation score defaults map each score type into the field it actually edits', () => {
  const defaults = buildAnnotationScoreDefaultValues(item, scoreConfigs)

  assert.deepEqual(defaults.scores, [
    {
      configId: 'numeric_config',
      value: 4,
      stringValue: '',
      comment: '数字备注',
    },
    {
      configId: 'boolean_config',
      value: false,
      stringValue: '',
      comment: '布尔备注',
    },
    {
      configId: 'category_config',
      value: 2,
      stringValue: '答案',
      comment: '',
    },
    {
      configId: 'text_config',
      value: null,
      stringValue: '',
      comment: '',
    },
  ])
})

test('annotation score defaults recover completed scores without a frontend config id', () => {
  const completedItem = {
    ...item,
    status: 'COMPLETED',
    scores: [
      {
        id: 'score_numeric_without_config_id',
        configId: '',
        scoreConfigId: 'numeric_config',
        name: '准确性',
        dataType: 'NUMERIC',
        value: 5,
        stringValue: '',
        comment: '通过 scoreConfigId 回显',
        authorUserId: 'user_a',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'score_boolean_without_config_id',
        configId: '',
        name: '是否合格',
        dataType: 'BOOLEAN',
        value: 1,
        stringValue: 'true',
        comment: '通过名称回显',
        authorUserId: 'user_a',
        createdAt: '',
        updatedAt: '',
      },
    ],
  } as AnnotationQueueItemRecord

  const defaults = buildAnnotationScoreDefaultValues(completedItem, scoreConfigs)

  assert.equal(defaults.scores[0].value, 5)
  assert.equal(defaults.scores[0].comment, '通过 scoreConfigId 回显')
  assert.equal(defaults.scores[1].value, true)
  assert.equal(defaults.scores[1].comment, '通过名称回显')
})

test('annotation score submit payload clears stale fields by score type', () => {
  const input = normalizeAnnotationScoreFormInput(
    {
      scores: [
        {
          configId: 'numeric_config',
          value: 3,
          stringValue: 'stale-number',
          comment: '',
        },
        {
          configId: 'boolean_config',
          value: false,
          stringValue: 'stale-bool',
          comment: '',
        },
        {
          configId: 'category_config',
          value: null,
          stringValue: '答案',
          comment: '',
        },
        {
          configId: 'text_config',
          value: 1,
          stringValue: '人工说明',
          comment: '',
        },
      ],
    },
    scoreConfigs
  )

  assert.deepEqual(input.scores, [
    { configId: 'numeric_config', value: 3, stringValue: '', comment: '' },
    {
      configId: 'boolean_config',
      value: false,
      stringValue: '',
      comment: '',
    },
    {
      configId: 'category_config',
      value: 2,
      stringValue: '答案',
      comment: '',
    },
    {
      configId: 'text_config',
      value: 0,
      stringValue: '人工说明',
      comment: '',
    },
  ])
})

test('categorical options expose Langfuse numeric values with display labels', async () => {
  const { getCategoricalScoreOptions } =
    await import('../../modules/app-evaluation/components/annotation-score-values.ts')

  assert.deepEqual(getCategoricalScoreOptions(scoreConfigs[2]), [
    { value: '1', label: '工具' },
    { value: '2', label: '答案' },
  ])
})
