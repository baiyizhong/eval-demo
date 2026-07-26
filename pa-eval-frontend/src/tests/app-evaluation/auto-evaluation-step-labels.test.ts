import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoEvaluationStepLabels } from '../../modules/app-evaluation/components/auto-evaluation-steps.ts'

test('自动评测创建步骤文案与 PRD 保持一致', () => {
  assert.deepEqual(autoEvaluationStepLabels, [
    '基础信息配置',
    '选择评估器',
    '选择评测数据来源',
  ])
})
