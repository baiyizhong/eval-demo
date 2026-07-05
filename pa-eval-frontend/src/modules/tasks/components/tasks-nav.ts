import type { PageNav } from '@/components/common/page-nav'

type TasksTopNavLinks = NonNullable<
  NonNullable<React.ComponentProps<typeof PageNav>['topNav']>['links']
>

export const tasksTopNav: TasksTopNavLinks = [
  {
    title: '评测报告',
    href: '/tasks',
  },
  {
    title: '评估器',
    href: '/tasks/evaluators',
  },
  {
    title: '自动评测',
    href: '/tasks/auto-evaluation',
  },
]
