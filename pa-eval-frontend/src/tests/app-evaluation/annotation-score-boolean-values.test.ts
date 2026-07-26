import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getBooleanScoreRadioValue,
  parseBooleanScoreInput,
} from '../../modules/app-evaluation/components/annotation-score-values.ts'

test('boolean score field renders backend numeric values as selected radio values', () => {
  assert.equal(getBooleanScoreRadioValue(1), '1')
  assert.equal(getBooleanScoreRadioValue(1.0), '1')
  assert.equal(getBooleanScoreRadioValue(0), '0')
  assert.equal(getBooleanScoreRadioValue(0.0), '0')
})

test('boolean score field renders backend string values as selected radio values', () => {
  assert.equal(getBooleanScoreRadioValue('true'), '1')
  assert.equal(getBooleanScoreRadioValue('1'), '1')
  assert.equal(getBooleanScoreRadioValue('是'), '1')
  assert.equal(getBooleanScoreRadioValue('false'), '0')
  assert.equal(getBooleanScoreRadioValue('0'), '0')
  assert.equal(getBooleanScoreRadioValue('否'), '0')
})

test('boolean score field writes radio values as real booleans', () => {
  assert.equal(parseBooleanScoreInput('1'), true)
  assert.equal(parseBooleanScoreInput('true'), true)
  assert.equal(parseBooleanScoreInput('是'), true)
  assert.equal(parseBooleanScoreInput('0'), false)
  assert.equal(parseBooleanScoreInput('false'), false)
  assert.equal(parseBooleanScoreInput('否'), false)
})
