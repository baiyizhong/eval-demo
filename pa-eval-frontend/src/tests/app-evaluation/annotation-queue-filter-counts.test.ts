import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const registrySource = readFileSync('src/api/registry.ts', 'utf8')
const annotationApiSource = readFileSync(
  'src/modules/app-evaluation/api/annotation-api.ts',
  'utf8'
)
const annotationDetailSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
  'utf8'
)
const annotationMockSource = readFileSync('mock/annotations.ts', 'utf8')

test('annotation queue status, type, and assignee filters use backend full counts', () => {
  assert.match(registrySource, /getProjectAnnotationQueueItemFilterCounts/)
  assert.match(
    registrySource,
    /\/projects\/:projectId\/annotation-queues\/:queueId\/items\/filter-counts/
  )
  assert.match(annotationApiSource, /getProjectAnnotationQueueItemFilterCounts/)
  assert.match(annotationApiSource, /DataTableQueryState/)
  assert.match(annotationDetailSource, /filterCountsQuery/)
  assert.match(annotationDetailSource, /statusCounts: filterCountsQuery\.data\?\.status/)
  assert.match(annotationDetailSource, /objectTypeCounts: filterCountsQuery\.data\?\.objectType/)
  assert.match(annotationDetailSource, /assigneeCounts: filterCountsQuery\.data\?\.assigneeIds/)
  assert.match(annotationDetailSource, /optionCounts: statusCounts/)
  assert.match(annotationDetailSource, /optionCounts: objectTypeCounts/)
  assert.match(annotationDetailSource, /optionCounts: assigneeCounts/)
  assert.match(annotationMockSource, /items\/filter-counts/)
  assert.match(annotationMockSource, /annotationItemFilterRows\(req, 'status'\)/)
  assert.match(annotationMockSource, /annotationItemFilterRows\(req, 'objectType'\)/)
  assert.match(annotationMockSource, /annotationItemFilterRows\(req, 'assigneeIds'\)/)
})
