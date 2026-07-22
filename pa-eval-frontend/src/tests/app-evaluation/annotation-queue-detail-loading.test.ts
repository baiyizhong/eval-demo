import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
  'utf8'
)

test('人工标注详情页使用表格内置加载态，不渲染详情页级 Loading', () => {
  assert.doesNotMatch(source, /加载人工标注任务详情中/)
  assert.match(
    source,
    /<DataTable<AnnotationQueueItemRecord>[\s\S]*loadingText=\{\s*<Loading\s+text='加载队列数据中\.\.\.'/
  )
})
