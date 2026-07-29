import { Bot, FlaskConical, ListChecks, Plus, RefreshCw } from 'lucide-react'
import { PageNav } from '@/components/common/page-nav'

export type ScheduledJobsTab =
  'tasks' | 'auto-evaluation-logs' | 'experiment-logs'

type ScheduledJobsPageNavProps = {
  activeTab: ScheduledJobsTab
  basePath: string
  canCreate?: boolean
  onCreate: () => void
  onRefresh: () => void
}

export function ScheduledJobsPageNav({
  activeTab,
  basePath,
  canCreate = true,
  onCreate,
  onRefresh,
}: ScheduledJobsPageNavProps) {
  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: [
          {
            title: '任务列表',
            href: `${basePath}?tab=tasks`,
            icon: ListChecks,
            isActive: activeTab === 'tasks',
          },
          {
            title: '自动评测执行日志',
            href: `${basePath}?tab=auto-evaluation-logs`,
            icon: Bot,
            isActive: activeTab === 'auto-evaluation-logs',
          },
          {
            title: '运行试验执行日志',
            href: `${basePath}?tab=experiment-logs`,
            icon: FlaskConical,
            isActive: activeTab === 'experiment-logs',
          },
        ],
      }}
      buttonGroups={{
        buttons: [
          {
            id: 'refresh',
            label: '刷新',
            icon: RefreshCw,
            iconPosition: 'start',
            variant: 'outline',
            size: 'sm',
            onClick: onRefresh,
          },
          ...(canCreate
            ? [
                {
                  id: 'create',
                  label: '创建任务',
                  icon: Plus,
                  iconPosition: 'start' as const,
                  size: 'sm' as const,
                  onClick: onCreate,
                },
              ]
            : []),
        ],
      }}
    />
  )
}
