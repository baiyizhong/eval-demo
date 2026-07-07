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
    categories: ['是|1', '否|0', 'unexpected|不要展示'],
  },
  {
    id: 'category_config',
    projectId: 'project_a',
    name: '问题类型',
    dataType: 'CATEGORICAL',
    description: '',
    categories: ['tool|工具', 'answer|答案'],
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
      value: null,
      stringValue: 'tool',
      comment: '',
      authorUserId: 'user_a',
      createdAt: '',
      updatedAt: '',
    },
  ],
  completedAt: '',
  completedBy: null,
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

test('boolean score options are always concise yes or no regardless of stored categories', () => {
  assert.deepEqual(getBooleanScoreOptions(), [
    { value: '1', label: '是' },
    { value: '0', label: '否' },
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
      value: null,
      stringValue: 'tool',
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
          value: 5,
          stringValue: 'answer',
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
      value: null,
      stringValue: 'answer',
      comment: '',
    },
    {
      configId: 'text_config',
      value: null,
      stringValue: '人工说明',
      comment: '',
    },
  ])
})
