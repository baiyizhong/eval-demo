import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  environmentOptions,
  isEnvironmentCode,
} from '../modules/environment/environment-options.ts'
import { getEnvironmentRedirectPath } from '../modules/environment/environment-routing.ts'

test('environmentOptions exposes the supported business environments', () => {
  assert.deepEqual(
    environmentOptions.map((option) => ({
      code: option.code,
      name: option.name,
    })),
    [
      { code: 'general', name: '通用环境' },
      { code: 'property', name: '产险环境' },
      { code: 'life', name: '寿险环境' },
      { code: 'bank', name: '银行环境' },
    ]
  )
})

test('isEnvironmentCode accepts only supported environment codes', () => {
  assert.equal(isEnvironmentCode('general'), true)
  assert.equal(isEnvironmentCode('property'), true)
  assert.equal(isEnvironmentCode('unknown'), false)
  assert.equal(isEnvironmentCode(null), false)
})

test('getEnvironmentRedirectPath redirects protected pages until environment is selected', () => {
  assert.equal(getEnvironmentRedirectPath('/apps', null), '/environment')
  assert.equal(
    getEnvironmentRedirectPath('/projects/project-1/evaluation/datasets', null),
    '/environment'
  )
  assert.equal(getEnvironmentRedirectPath('/login', null), null)
  assert.equal(getEnvironmentRedirectPath('/environment', null), null)
  assert.equal(getEnvironmentRedirectPath('/apps', 'general'), null)
})
