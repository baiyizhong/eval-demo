import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const appEvaluationSources = [
  'src/api/registry.ts',
  'src/modules/app-evaluation/api/auto-evaluation-api.ts',
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'src/modules/app-evaluation/components/auto-evaluation-run-records.tsx',
  'src/modules/app-evaluation/types.ts',
  'src/modules/app-evaluation/views/auto-evaluation-detail.tsx',
  'src/modules/app-evaluation/views/auto-evaluations.tsx',
].map((path) => ({
  path,
  source: readFileSync(path, 'utf8'),
}))

test('auto evaluation module does not expose scheduled evaluation capability', () => {
  for (const { path, source } of appEvaluationSources) {
    assert.doesNotMatch(source, /runMode|SCHEDULED|schedule\/start|schedule\/pause/, path)
    assert.doesNotMatch(source, /定时执行|启动调度|停止调度|调度配置/, path)
  }
})
