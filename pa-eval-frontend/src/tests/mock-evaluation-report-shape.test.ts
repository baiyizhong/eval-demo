import assert from 'node:assert/strict'
import { test } from 'node:test'
import { db } from '../../mock/_data.ts'

test('mock evaluation reports match report list view shape', () => {
  const reports = db.evaluationReports as Array<Record<string, unknown>>

  assert.ok(reports.length > 0)

  for (const report of reports) {
    assert.equal(typeof report.title, 'string')
    assert.equal(typeof report.sourceType, 'string')
    assert.equal(typeof report.sourceTaskName, 'string')
    assert.match(String(report.status), /^(GENERATING|READY|FAILED)$/)
    assert.equal(typeof report.generatedAt, 'string')
    assert.ok(!Number.isNaN(new Date(String(report.generatedAt)).getTime()))
  }
})
