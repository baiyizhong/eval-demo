import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildEvaluationTopNavLinks } from './evaluation-page-nav-utils.ts'

test('buildEvaluationTopNavLinks renders project evaluation top nav', () => {
  const links = buildEvaluationTopNavLinks({
    pathname: '/projects/project-real-1/evaluation/reports',
    projectId: 'project-real-1',
  })

  assert.deepEqual(
    links.map(({ title, href }) => ({ title, href })),
    [
      {
        title: '数据集',
        href: '/projects/project-real-1/evaluation/datasets',
      },
      {
        title: '评估器',
        href: '/projects/project-real-1/evaluation/evaluators',
      },
      {
        title: '人工标注',
        href: '/projects/project-real-1/evaluation/annotation-queues',
      },
      {
        title: '自动评测',
        href: '/projects/project-real-1/evaluation/auto-evaluations',
      },
      {
        title: '评测报告',
        href: '/projects/project-real-1/evaluation/reports',
      },
    ]
  )
})
