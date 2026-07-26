import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const formSource = readFileSync(
  'src/modules/organization-management/views/info/organization-info-form.tsx',
  'utf8'
)

test('organization info form limits name, subsystem and description lengths', () => {
  assert.match(formSource, /ORGANIZATION_NAME_MAX_LENGTH = 40/)
  assert.match(formSource, /ORGANIZATION_SUBSYSTEM_MAX_LENGTH = 40/)
  assert.match(formSource, /ORGANIZATION_DESCRIPTION_MAX_LENGTH = 200/)
  assert.match(formSource, /maxLength=\{ORGANIZATION_NAME_MAX_LENGTH\}/)
  assert.match(formSource, /maxLength=\{ORGANIZATION_SUBSYSTEM_MAX_LENGTH\}/)
  assert.match(formSource, /maxLength=\{ORGANIZATION_DESCRIPTION_MAX_LENGTH\}/)
  assert.match(formSource, /组织名称不能超过40个字/)
  assert.match(formSource, /所属子系统不能超过40个字/)
  assert.match(formSource, /组织描述不能超过200个字/)
})
