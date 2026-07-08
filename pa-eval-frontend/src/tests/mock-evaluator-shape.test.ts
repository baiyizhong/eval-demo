import assert from 'node:assert/strict'
import { test } from 'node:test'
import { db } from '../../mock/_data.ts'

test('mock evaluators match evaluator list view shape', () => {
  const evaluators = db.evaluators as Array<Record<string, unknown>>

  assert.ok(evaluators.length > 0)

  for (const evaluator of evaluators) {
    assert.equal(typeof evaluator.name, 'string')
    assert.match(String(evaluator.type), /^(LLM_AS_JUDGE|CODE|WORKFLOW|SDK)$/)
    assert.equal(typeof evaluator.version, 'string')
    assert.ok(Array.isArray(evaluator.variables))
    assert.equal(typeof evaluator.description, 'string')
    assert.match(String(evaluator.provider), /^(LANGFUSE|DIFY|HIAGENT|N8N|OPENJUDGE)$/)
    assert.equal(
      typeof evaluator.projectId === 'string' || evaluator.projectId === null,
      true
    )
    assert.equal(typeof evaluator.projectName, 'string')
    assert.equal(typeof evaluator.usageCount, 'number')
    assert.equal(typeof evaluator.updatedAt, 'string')
    assert.ok(!Number.isNaN(new Date(String(evaluator.updatedAt)).getTime()))
  }
})
