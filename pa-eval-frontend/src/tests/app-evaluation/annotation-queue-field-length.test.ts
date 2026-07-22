import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-form-drawer.tsx',
  'utf8'
)

test('annotation queue create and edit forms share the confirmed field limits', () => {
  assert.match(source, /ANNOTATION_QUEUE_NAME_MAX_LENGTH = 40/)
  assert.match(source, /ANNOTATION_QUEUE_DESCRIPTION_MAX_LENGTH = 200/)
  assert.match(source, /max\(ANNOTATION_QUEUE_NAME_MAX_LENGTH/)
  assert.match(source, /max\(ANNOTATION_QUEUE_DESCRIPTION_MAX_LENGTH/)
  assert.match(source, /maxLength=\{ANNOTATION_QUEUE_NAME_MAX_LENGTH\}/)
  assert.match(source, /maxLength=\{ANNOTATION_QUEUE_DESCRIPTION_MAX_LENGTH\}/)
})
