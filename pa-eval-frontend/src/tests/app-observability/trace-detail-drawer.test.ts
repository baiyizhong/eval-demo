import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { TRACE_METADATA_JSON_EDITOR_CONFIG } from '../../modules/app-observability/components/trace-detail-drawer-config.ts'

test('trace metadata json editor keeps search enabled in detail view', () => {
  assert.equal(TRACE_METADATA_JSON_EDITOR_CONFIG.searchable, true)
})

test('trace detail drawer uses join annotation task wording and removes editing actions', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-detail-drawer.tsx'
    ),
    'utf8'
  )

  assert.match(source, />\s*加入标注任务\s*</)
  assert.doesNotMatch(source, /新建标注任务/)
  assert.doesNotMatch(source, />\s*编辑\s*</)
  assert.doesNotMatch(source, />\s*保存\s*</)
  assert.doesNotMatch(source, />\s*取消\s*</)
  assert.doesNotMatch(source, /patchProjectTrace/)
  assert.doesNotMatch(source, /defaultMode='edit'/)
  assert.doesNotMatch(source, /当前 Trace 编辑内容/)
})
