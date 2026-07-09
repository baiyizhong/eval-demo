import { FileClock, ListChecks, Plus, RefreshCw } from 'lucide-react'
import { PageNav } from '@/components/common/page-nav'

export type ScheduledJobsTab = 'tasks' | 'logs'

type ScheduledJobsPageNavProps = {
  activeTab: ScheduledJobsTab
  basePath: string
  onCreate: () => void
  onRefresh: () => void
}

export function ScheduledJobsPageNav({
  activeTab,
  basePath,
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
            title: '执行日志',
            href: `${basePath}?tab=logs`,
            icon: FileClock,
            isActive: activeTab === 'logs',
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
          {
            id: 'create',
            label: '创建任务',
            icon: Plus,
            iconPosition: 'start',
            size: 'sm',
            onClick: onCreate,
          },
        ],
      }}
    />
  )
}
