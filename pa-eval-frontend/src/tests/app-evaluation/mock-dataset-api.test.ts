import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DataTableQueryState } from '../../components/common/data-table/index.ts'
import {
  archiveProjectDatasetItemMock,
  createProjectDatasetItemMock,
  createProjectDatasetMock,
  deleteProjectDatasetMock,
  exportProjectDatasetItemsMock,
  exportProjectDatasetMock,
  listProjectDatasetItemsMock,
  listProjectDatasetsMock,
  resetProjectDatasetMocks,
  updateProjectDatasetItemMock,
  updateProjectDatasetMock,
} from '../../modules/app-evaluation/api/mock-dataset-api.ts'

const baseQuery: DataTableQueryState = {
  page: 1,
  pageSize: 20,
  keyword: '',
  filters: {},
  sorting: [],
}

test('listProjectDatasetsMock 按项目、名称和类型过滤数据集', async () => {
  resetProjectDatasetMocks()

  const all = await listProjectDatasetsMock(
    'project_customer_agent',
    baseQuery,
    'all'
  )
  const otherProject = await listProjectDatasetsMock(
    'project_support_bot',
    baseQuery,
    'all'
  )
  const keyword = await listProjectDatasetsMock(
    'project_customer_agent',
    { ...baseQuery, keyword: '客服' },
    'all'
  )
  const golden = await listProjectDatasetsMock(
    'project_customer_agent',
    baseQuery,
    'golden'
  )

  assert.equal(all.total > 0, true)
  assert.equal(
    all.datas.every(
      (dataset) => dataset.projectId === 'project_customer_agent'
    ),
    true
  )
  assert.equal(
    otherProject.datas.every(
      (dataset) => dataset.projectId === 'project_support_bot'
    ),
    true
  )
  assert.equal(
    keyword.datas.every((dataset) => dataset.name.includes('客服')),
    true
  )
  assert.equal(
    golden.datas.every((dataset) => dataset.type === 'golden'),
    true
  )
})

test('数据集新建、编辑、删除会更新 mock 状态并清理关联数据项', async () => {
  resetProjectDatasetMocks()

  const created = await createProjectDatasetMock('project_customer_agent', {
    name: '临时评测集',
    type: 'evaluation',
    description: '用于验证 CRUD',
    metadata: { owner: 'qa' },
    inputSchema: { type: 'object' },
    expectedOutputSchema: { type: 'object' },
  })

  const updated = await updateProjectDatasetMock(
    'project_customer_agent',
    created.id,
    {
      name: '临时评测集 v2',
      type: 'badcase',
      description: '已更新',
      metadata: { owner: 'qa', type: 'evaluation' },
      inputSchema: { type: 'object' },
      expectedOutputSchema: { type: 'object' },
    }
  )

  assert.equal(updated.name, '临时评测集 v2')
  assert.equal(updated.type, 'badcase')
  assert.equal(updated.metadata.type, 'badcase')

  await createProjectDatasetItemMock('project_customer_agent', created.id, {
    status: 'ACTIVE',
    input: { question: 'hello' },
    expectedOutput: { answer: 'world' },
    metadata: { tags: ['temp'] },
    sourceTraceId: '',
    sourceObservationId: '',
  })

  await deleteProjectDatasetMock('project_customer_agent', created.id)

  const datasets = await listProjectDatasetsMock(
    'project_customer_agent',
    baseQuery,
    'all'
  )
  const items = await listProjectDatasetItemsMock(
    'project_customer_agent',
    created.id,
    baseQuery
  )

  assert.equal(
    datasets.datas.some((dataset) => dataset.id === created.id),
    false
  )
  assert.equal(items.total, 0)
})

test('数据项新增、编辑、归档和导出按项目与数据集隔离', async () => {
  resetProjectDatasetMocks()

  const dataset = (
    await listProjectDatasetsMock('project_customer_agent', baseQuery, 'all')
  ).datas[0]
  assert.ok(dataset)

  const created = await createProjectDatasetItemMock(
    'project_customer_agent',
    dataset.id,
    {
      status: 'ACTIVE',
      input: { question: '如何退款？' },
      expectedOutput: { answer: '请在订单页提交退款申请。' },
      metadata: { priority: 'high' },
      sourceTraceId: 'trace_temp',
      sourceObservationId: 'obs_temp',
    }
  )

  const edited = await updateProjectDatasetItemMock(
    'project_customer_agent',
    dataset.id,
    created.id,
    {
      status: 'ACTIVE',
      input: { question: '如何申请退款？' },
      expectedOutput: { answer: '请在订单详情提交退款申请。' },
      metadata: { priority: 'medium' },
      sourceTraceId: 'trace_temp',
      sourceObservationId: 'obs_temp',
    }
  )

  const archived = await archiveProjectDatasetItemMock(
    'project_customer_agent',
    dataset.id,
    created.id
  )
  const fullExport = await exportProjectDatasetMock(
    'project_customer_agent',
    dataset.id
  )
  const partialExport = await exportProjectDatasetItemsMock(
    'project_customer_agent',
    dataset.id,
    [created.id]
  )

  assert.deepEqual(edited.input, { question: '如何申请退款？' })
  assert.equal(archived.status, 'ARCHIVED')
  assert.equal(
    fullExport.items.some((item) => item.id === created.id),
    true
  )
  assert.deepEqual(
    partialExport.items.map((item) => item.id),
    [created.id]
  )
})
