import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../../..')

test('scene experiment page e2e script is available as a package command', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8')
  )

  assert.equal(
    packageJson.scripts['e2e:scene-experiment'],
    'node scripts/scene-experiment-e2e.mjs'
  )
})

test('scene experiment page e2e script guards the real closed loop', () => {
  const source = readFileSync(
    resolve(root, 'scripts/scene-experiment-e2e.mjs'),
    'utf8'
  )

  assert.match(source, /PA_E2E_WEBHOOK_TOKEN/)
  assert.match(source, /user\["id"\]/)
  assert.match(source, /credentialRef/)
  assert.match(source, /function createRemoteExperimentRunner/)
  assert.match(source, /function ingestLangfuseTrace/)
  assert.match(source, /function createDatasetRunItem/)
  assert.match(source, /function waitForDatasetRunItems/)
  assert.match(source, /function completeRemoteExperiment/)
  assert.match(source, /\/api\/public\/ingestion/)
  assert.match(source, /\/api\/public\/dataset-run-items/)
  assert.match(source, /createdAt/)
  assert.match(source, /expectedCount/)
  assert.match(source, /\/remote-callback/)
  assert.match(source, /webhookCalls/)
  assert.match(source, /pageHasExperiment/)
  assert.match(source, /dataset-run-items|langfuseDatasetRunItemId/)
})
