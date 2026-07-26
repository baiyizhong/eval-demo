import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createProgressiveRefetchInterval } from '../lib/progressive-refetch-interval.ts'

function createQueryState(dataUpdateCount: number, errorUpdateCount = 0) {
  return {
    state: {
      dataUpdateCount,
      errorUpdateCount,
    },
  }
}

test('progressive refetch interval excludes the initial request and stops after five polls', () => {
  const getInterval = createProgressiveRefetchInterval()

  assert.equal(getInterval(createQueryState(0)), 2_000)
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((dataUpdateCount) =>
      getInterval(createQueryState(dataUpdateCount))
    ),
    [2_000, 4_000, 8_000, 16_000, 32_000, false]
  )
})

test('progressive refetch interval counts failed requests toward the limit', () => {
  const getInterval = createProgressiveRefetchInterval()

  assert.equal(getInterval(createQueryState(1, 1)), 4_000)
  assert.equal(getInterval(createQueryState(1, 5)), false)
})

test('progressive refetch interval supports reusable schedule options', () => {
  const getInterval = createProgressiveRefetchInterval({
    initialInterval: 1_000,
    multiplier: 3,
    maxAttempts: 2,
  })

  assert.deepEqual(
    [1, 2, 3].map((dataUpdateCount) =>
      getInterval(createQueryState(dataUpdateCount))
    ),
    [1_000, 3_000, false]
  )
})

test('auto evaluation list uses the shared progressive polling strategy', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/views/auto-evaluations.tsx',
    'utf8'
  )

  assert.match(source, /createProgressiveRefetchInterval/)
  assert.match(source, /refetchInterval:\s*autoEvaluationRefetchInterval/)
  assert.doesNotMatch(source, /refetchInterval:\s*3000/)
})

test('running auto evaluation detail queries poll every five seconds', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/views/auto-evaluation-detail.tsx',
    'utf8'
  )

  assert.equal(source.match(/\? 5000 : false/g)?.length, 3)
  assert.doesNotMatch(source, /\? 3000 : false/)
})
