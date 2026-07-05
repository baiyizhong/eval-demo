import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DataTableQueryState } from '@/components/common/data-table'
import {
  addProjectAnnotationItemToDatasetMock,
  createProjectAnnotationQueueMock,
  deleteProjectAnnotationQueueItemsMock,
  exportProjectAnnotationQueueItemsMock,
  getProjectAnnotationNavigationMock,
  listProjectAnnotationQueueItemsMock,
  listProjectAnnotationQueuesMock,
  resetProjectAnnotationMocks,
  saveProjectAnnotationScoresMock,
} from '../../modules/app-evaluation/api/mock-annotation-api.ts'

const baseQuery: DataTableQueryState = {
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
}

describe('mock annotation api', () => {
  it('lists annotation queues by project and keyword', async () => {
    resetProjectAnnotationMocks()

    const all = await listProjectAnnotationQueuesMock(
      'project_customer_agent',
      baseQuery
    )
    const keyword = await listProjectAnnotationQueuesMock(
      'project_customer_agent',
      { ...baseQuery, keyword: '客服' }
    )

    assert.ok(all.total >= 2)
    assert.equal(
      all.datas.every((queue) => queue.projectId === 'project_customer_agent'),
      true
    )
    assert.equal(
      keyword.datas.every(
        (queue) =>
          queue.name.includes('客服') || queue.description.includes('客服')
      ),
      true
    )
  })

  it('creates queues with selected score configs and assignees', async () => {
    resetProjectAnnotationMocks()

    const created = await createProjectAnnotationQueueMock(
      'project_customer_agent',
      {
        name: '人工标注回归任务',
        description: '验证创建任务 mock 闭环',
        scoreConfigIds: ['score_accuracy', 'score_usability'],
        assigneeIds: ['user_annotator_a'],
      }
    )

    assert.equal(created.name, '人工标注回归任务')
    assert.deepEqual(created.scoreConfigIds, [
      'score_accuracy',
      'score_usability',
    ])
    assert.deepEqual(created.assigneeIds, ['user_annotator_a'])

    const listed = await listProjectAnnotationQueuesMock(
      'project_customer_agent',
      { ...baseQuery, keyword: '回归任务' }
    )

    assert.equal(listed.total, 1)
    assert.equal(listed.datas[0]?.id, created.id)
  })

  it('filters queue items and deletes selected items only', async () => {
    resetProjectAnnotationMocks()

    const pending = await listProjectAnnotationQueueItemsMock(
      'project_customer_agent',
      'queue_customer_quality',
      {
        ...baseQuery,
        filters: { status: ['PENDING'] },
      }
    )

    assert.ok(pending.total >= 1)
    assert.equal(
      pending.datas.every((item) => item.status === 'PENDING'),
      true
    )

    const deletedIds = pending.datas.slice(0, 2).map((item) => item.id)
    await deleteProjectAnnotationQueueItemsMock(
      'project_customer_agent',
      'queue_customer_quality',
      deletedIds
    )

    const afterDelete = await listProjectAnnotationQueueItemsMock(
      'project_customer_agent',
      'queue_customer_quality',
      baseQuery
    )

    assert.equal(
      afterDelete.datas.some((item) => deletedIds.includes(item.id)),
      false
    )
  })

  it('saves scores, marks item completed, and navigates across pages', async () => {
    resetProjectAnnotationMocks()

    const saved = await saveProjectAnnotationScoresMock(
      'project_customer_agent',
      'queue_customer_quality',
      'aqi_customer_001',
      {
        scores: [
          {
            configId: 'score_accuracy',
            value: 4,
            stringValue: '',
            comment: '答案准确',
          },
          {
            configId: 'score_usability',
            value: true,
            stringValue: '',
            comment: '可以沉淀',
          },
        ],
      }
    )

    assert.equal(saved.status, 'COMPLETED')
    assert.equal(saved.scores.length, 2)
    assert.ok(saved.completedAt)
    assert.ok(saved.completedBy)

    const navigation = await getProjectAnnotationNavigationMock(
      'project_customer_agent',
      'queue_customer_quality',
      'aqi_customer_001',
      { ...baseQuery, pageSize: 1 }
    )

    assert.equal(navigation.current.id, 'aqi_customer_001')
    assert.ok(navigation.next)
    assert.equal(navigation.total >= 2, true)
  })

  it('exports selected items and adds current item to a dataset', async () => {
    resetProjectAnnotationMocks()

    const exported = await exportProjectAnnotationQueueItemsMock(
      'project_customer_agent',
      'queue_customer_quality',
      ['aqi_customer_001', 'aqi_customer_002']
    )

    assert.equal(exported.items.length, 2)
    assert.equal(exported.queue.id, 'queue_customer_quality')

    const datasetItem = await addProjectAnnotationItemToDatasetMock(
      'project_customer_agent',
      'queue_customer_quality',
      'aqi_customer_001',
      {
        datasetId: 'dataset_customer_eval',
        input: { text: '用户要求退款' },
        expectedOutput: { answer: '解释退款流程' },
        metadata: { source: 'manual_annotation' },
      }
    )

    assert.equal(datasetItem.datasetId, 'dataset_customer_eval')
    assert.equal(datasetItem.sourceTraceId, 'trace_customer_001')
    assert.equal(datasetItem.metadata.source, 'manual_annotation')
  })
})
