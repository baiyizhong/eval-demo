import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const annotateSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-item-annotate.tsx',
  'utf8'
)
const queueDetailSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
  'utf8'
)
const queuesSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queues.tsx',
  'utf8'
)

test('annotation save invalidates query key prefixes that match api-scoped query keys', () => {
  assert.match(annotateSource, /queryKey:\s*\['project-annotation-navigation'\]/)
  assert.match(annotateSource, /queryKey:\s*\['project-annotation-queue'\]/)
  assert.match(annotateSource, /queryKey:\s*\['project-annotation-queue-items'\]/)
  assert.match(annotateSource, /queryKey:\s*\['project-annotation-queue-metrics'\]/)
  assert.match(annotateSource, /queryKey:\s*\['project-annotation-queues'\]/)
  assert.doesNotMatch(
    annotateSource,
    /queryKey:\s*\['project-annotation-navigation',\s*projectId/
  )
})

test('annotation queue pages invalidate the same api-scoped prefixes', () => {
  assert.match(queueDetailSource, /queryKey:\s*\['project-annotation-queue'\]/)
  assert.match(queueDetailSource, /queryKey:\s*\['project-annotation-queue-items'\]/)
  assert.match(queueDetailSource, /queryKey:\s*\['project-annotation-queue-metrics'\]/)
  assert.match(queueDetailSource, /queryKey:\s*\['project-annotation-queues'\]/)
  assert.match(queuesSource, /queryKey:\s*\['project-annotation-queues'\]/)
})
