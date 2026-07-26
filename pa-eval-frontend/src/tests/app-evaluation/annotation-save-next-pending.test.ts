import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as annotationApi from '../../modules/app-evaluation/api/annotation-api.ts'

type NextPendingHelper = (
  api: unknown,
  projectId: string,
  queueId: string
) => Promise<{ id: string } | null>

const getNextPendingProjectAnnotationItem = (
  annotationApi as unknown as {
    getNextPendingProjectAnnotationItem?: NextPendingHelper
  }
).getNextPendingProjectAnnotationItem

test('save-next helper queries the first pending item from the whole queue', async () => {
  assert.ok(getNextPendingProjectAnnotationItem)

  const calls: unknown[] = []
  const api = {
    async getProjectAnnotationQueueItems(options: unknown) {
      calls.push(options)
      return {
        total: 2,
        datas: [{ id: 'pending-item-1' }],
      }
    },
  }

  const item = await getNextPendingProjectAnnotationItem(
    api,
    'project-1',
    'queue-1'
  )

  assert.equal(item?.id, 'pending-item-1')
  assert.deepEqual(calls, [
    {
      path: { projectId: 'project-1', queueId: 'queue-1' },
      query: {
        page: 1,
        pageSize: 1,
        status: ['PENDING'],
      },
    },
  ])
})

test('save-next helper returns null when the queue has no pending item', async () => {
  assert.ok(getNextPendingProjectAnnotationItem)

  const api = {
    async getProjectAnnotationQueueItems() {
      return { total: 0, datas: [] }
    },
  }

  const item = await getNextPendingProjectAnnotationItem(
    api,
    'project-1',
    'queue-1'
  )

  assert.equal(item, null)
})

test('single annotation save-next uses pending queue navigation', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/views/annotation-item-annotate.tsx',
    'utf8'
  )
  const saveNextBranch = source.match(
    /if \(mode === 'saveNext'\) \{([\s\S]*?)\n {4}\}/
  )?.[1]

  assert.match(source, /getNextPendingProjectAnnotationItem/)
  assert.ok(saveNextBranch)
  assert.match(saveNextBranch, /getNextPendingProjectAnnotationItem/)
  assert.doesNotMatch(saveNextBranch, /getProjectAnnotationNavigation/)
  assert.match(source, /pendingSearchParams\.set\('page',\s*'1'\)/)
  assert.match(source, /pendingSearchParams\.append\('status',\s*'PENDING'\)/)
  assert.match(source, /当前标注队列已全部完成/)
})
