import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildEvaluationTopNavLinks,
  buildEvaluationProjectSwitchPath,
  findEvaluationProject,
} from './evaluation-page-nav-utils.ts'

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
        title: '人工评测',
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

test('findEvaluationProject returns the matching project context', () => {
  assert.deepEqual(
    findEvaluationProject(
      [
        {
          id: 'project-other',
          name: '其他项目',
          organizationName: '其他组织',
        },
        {
          id: 'project-real-1',
          name: 'PA Eval 验证组织默认项目',
          organizationName: 'PA Eval 验证组织',
        },
      ],
      'project-real-1'
    ),
    {
      id: 'project-real-1',
      name: 'PA Eval 验证组织默认项目',
      organizationName: 'PA Eval 验证组织',
    }
  )
})

test('buildEvaluationProjectSwitchPath keeps current evaluation sub route', () => {
  assert.equal(
    buildEvaluationProjectSwitchPath(
      '/projects/project-a/evaluation/evaluators',
      'project-a',
      'project-b'
    ),
    '/projects/project-b/evaluation/evaluators'
  )

  assert.equal(
    buildEvaluationProjectSwitchPath('/dashboard', 'project-a', 'project-b'),
    '/projects/project-b/evaluation/datasets'
  )
})
