import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../../..')

test('scheduled experiment page e2e script is available as a package command', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8')
  )

  assert.equal(
    packageJson.scripts['e2e:scheduled-experiment'],
    'node scripts/scheduled-experiment-e2e.mjs'
  )
})

test('scheduled experiment page e2e script guards the scheduled run closed loop', () => {
  const source = readFileSync(
    resolve(root, 'scripts/scheduled-experiment-e2e.mjs'),
    'utf8'
  )

  assert.match(source, /RUN_EXPERIMENT/)
  assert.match(source, /supportsScheduledExecution/)
  assert.match(source, /scheduled-jobs\/.*\/trigger/)
  assert.match(source, /scheduled-job-logs/)
  assert.match(source, /experimentReportId/)
  assert.match(source, /langfuseDatasetRunItemId/)
})
