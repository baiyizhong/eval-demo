import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const generalSettingsSource = readFileSync(
  'src/modules/project-settings/views/general.tsx',
  'utf8'
)

test('project general settings limits project name and description lengths', () => {
  assert.match(generalSettingsSource, /PROJECT_NAME_MAX_LENGTH = 30/)
  assert.match(generalSettingsSource, /PROJECT_DESCRIPTION_MAX_LENGTH = 200/)
  assert.match(generalSettingsSource, /maxLength=\{PROJECT_NAME_MAX_LENGTH\}/)
  assert.match(
    generalSettingsSource,
    /maxLength=\{PROJECT_DESCRIPTION_MAX_LENGTH\}/
  )
  assert.match(generalSettingsSource, /项目名称不能超过30个字/)
  assert.match(generalSettingsSource, /项目描述不能超过200个字/)
})
