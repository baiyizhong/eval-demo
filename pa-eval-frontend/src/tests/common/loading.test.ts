import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getLoadingClassName } from '../../components/common/loading-class.ts'

test('loading uses a bounded local area by default', () => {
  const className = getLoadingClassName({})

  assert.equal(className.includes('min-h-40'), true)
  assert.equal(className.includes('h-full'), false)
})

test('loading can fill the available container height', () => {
  const className = getLoadingClassName({ full: true })

  assert.equal(className.includes('h-full'), true)
  assert.equal(className.includes('min-h-40'), false)
})

test('loading lets callers override local area height', () => {
  const className = getLoadingClassName({ className: 'min-h-24' })

  assert.equal(className.includes('min-h-24'), true)
  assert.equal(className.includes('min-h-40'), false)
})
