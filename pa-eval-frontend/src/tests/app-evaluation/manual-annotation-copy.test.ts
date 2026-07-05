import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluationReportSourceTypeLabels } from '../../modules/app-evaluation/types.ts'

test('manual annotation report source uses annotation wording', () => {
  assert.equal(evaluationReportSourceTypeLabels.MANUAL_ANNOTATION, '人工标注')
})
