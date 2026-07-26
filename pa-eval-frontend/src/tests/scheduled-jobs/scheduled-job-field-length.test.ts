import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const drawerSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-drawer.tsx',
  'utf8'
)

test('scheduled job drawer limits task name and description lengths', () => {
  assert.match(drawerSource, /SCHEDULED_JOB_NAME_MAX_LENGTH = 40/)
  assert.match(drawerSource, /SCHEDULED_JOB_DESCRIPTION_MAX_LENGTH = 200/)
  assert.match(drawerSource, /maxLength=\{SCHEDULED_JOB_NAME_MAX_LENGTH\}/)
  assert.match(
    drawerSource,
    /maxLength=\{SCHEDULED_JOB_DESCRIPTION_MAX_LENGTH\}/
  )
  assert.match(drawerSource, /任务名称不能超过40个字/)
  assert.match(drawerSource, /任务描述不能超过200个字/)
})
